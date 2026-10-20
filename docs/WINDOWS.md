# El .exe de Windows

Nadie del equipo tiene un PC con Windows, así que el instalador se prueba en **GitHub Actions** (`windows-latest`,
Windows Server 2025, 4 núcleos, **sin GPU**). Rama `prueba-windows` (sin mergear).

## Cómo se prueba

`.github/workflows/probar-windows.yml` (al subir a `prueba-windows` o a mano) + `desktop/probar_windows.ps1`:

1. Arma el instalador **igual que `instaladores.yml`** (`empaquetar.sh`: PyInstaller + electron-builder) y una
   actualización de prueba `9.9.9` con `actualizacion.sh`.
2. Lo instala en silencio (`/S`), abre la app con `DRONMAKER_PRUEBA=1` (`desktop/main.js`: sin diálogos, el log del
   servidor en `<datos>/servidor.log`, y `<datos>/prueba.json` con el puerto cuando el juego responde).
3. Revisa el juego y la API, entrena unos segundos en el fondo (nivel 19, un modelo de prueba desde cero), evaluar,
   simular, cerrar con el entrenamiento andando y volver a abrir, la actualización servida en local, que no queden
   `servidor.exe` huérfanos, y desinstala.
4. Deja un artefacto `prueba-windows`: `resultados.json`, capturas de pantalla y logs. El instalador queda como
   artefacto `instalador-windows` (5 días): *Run workflow* con su `run` = id lo vuelve a probar sin armarlo.

En un PC con Windows: `pwsh desktop/probar_windows.ps1 -Instalador <el .exe>` (OJO: instala y desinstala de verdad).

## Resultados (run [39369297072](https://github.com/Sagaz0501/neural-drone-forge/actions/runs/39369297072), 20-10-2026, v3.3.0)

Todo en verde (28 pasos; también el run [39370748215](https://github.com/Sagaz0501/neural-drone-forge/actions/runs/39370748215)). Números (el rango = los dos runs):

| | |
|---|---|
| Instalador (`Neural-Drone-Forge-windows.exe`, NSIS asistido, sin firmar) | **227 MB** |
| Instalado (`%LOCALAPPDATA%\Programs\Neural Drone Forge`, por usuario, sin admin) | **835 MB** |
| Instalar con `/S` | 42-60 s |
| Arranque (hasta que el juego responde) | **4,4-5,7 s** la 1.ª vez · 3,6-3,7 s después |
| Accesos directos | escritorio ✓ · menú inicio ✓ |
| Escucha solo en `127.0.0.1` (TCP del juego y UDP 9032 del entrenador) | ✓ → sin aviso del firewall |
| Entrenar en el fondo (nivel 19, 16 drones), app **minimizada** | **1.694-2.442 pasos/s** |
| Entrenar con la app **a la vista** (el runner no tiene GPU) | 43-108 pasos/s (ver «Problemas conocidos») |
| El entrenador congelado solo, sin la app | 2.289-2.346 pasos/s |
| `/api/evaluar` (n=5) · `/api/simular` | ✓ (34 s / ✓) |
| Cerrar con un entrenamiento andando | el entrenador sigue (como en Mac), el servidor no; al abrir otra vez lo encuentra y lo detiene |
| Actualización sin reinstalar (9,4 MB, `tar.exe` de System32) | ✓ 3,7 s; al volver a abrir sigue en la 9.9.9 |
| Al cerrar la ventana | 0 `servidor.exe` vivos |
| Desinstalar `/S` | ✓ 3 s; las partidas y las IA quedan en `%APPDATA%\Neural Drone Forge` |

Para comparar: el mismo entrenador en Linux del runner da ~3.500 pasos/s; en el Mac de Santiago, 6.080.

## Bugs encontrados y arreglados (en esta rama)

- **`os.kill(pid, 0)` en Windows MATA el proceso** (allá no pregunta: llama `TerminateProcess`). `jugar.py _vivo()` lo
  usaba para ver si un entrenamiento seguía vivo → ahora `pid_vivo()` con `OpenProcess`/`GetExitCodeProcess`.
- **Sin `ps` en Windows**: el servidor no encontraba los entrenamientos del fondo de antes de cerrar la app (seguían
  corriendo sin que el juego los viera, y no se podían detener). Ahora cada uno deja `fondo.json` (pid, puertos, cfg,
  exe) y `fondo_win()` los encuentra (el pid tiene que coincidir con `entrenando.json` y ser el mismo ejecutable). Solo
  en Windows; en Mac sigue con `ps`.
- **UTF-8**: `read_text()`/`write_text()` sin `encoding` usan cp1252 en Windows (los acentos de `missions.json`,
  `modelo.json` con `ensure_ascii=False`…) → `encoding="utf-8"` en todos + el Python congelado en modo UTF-8
  (`servidor.spec`: `X utf8`; el log de la prueba lo confirma: `utf8_mode=1`) + `PYTHONUTF8=1`.
- **`os.replace` falla en Windows si otro proceso tiene el archivo abierto** (el servidor leyendo `entrenando.json`
  mientras el entrenador lo reemplaza; el juego bajando `modelo_web.json` mientras se guarda): podía tumbar el
  entrenamiento al guardar. `reemplazar()` reintenta ~2 s (solo en Windows) y `read_json` reintenta si choca.
- **Tipos MIME**: en Windows `mimetypes` lee el registro y hay PCs donde `.js` sale `text/plain` → los módulos ES no
  cargan (pantalla vacía). Ahora fijos en `jugar.py` (`.js`, `.json`, `.css`, `.glb`, `.wasm`…).
- **El actualizador**: usa `C:\Windows\System32\tar.exe` con su ruta (si el PATH trae el `tar` de Git, `C:\…` le parece
  un servidor remoto) y no se cae si no puede borrar la carpeta de una versión vieja en uso (un entrenamiento que sigue
  corriendo desde ahí): la borra la próxima vez.
- **Blender**: elige la versión más nueva de verdad (4.10 > 4.9) y también busca el de Steam.
- La ventana sin la barra de menú «Ver» en Windows (`autoHideMenuBar`; Alt la muestra). En Mac no cambia nada.

El comportamiento en Mac queda igual (lo de Windows va con `os.name == "nt"`; las pruebas JS y pytest pasan).

## Problemas conocidos

- **PCs sin aceleración gráfica**: si Chromium no puede usar la GPU dibuja el garaje con la CPU (SwiftShader). En el
  runner eso se come 3,7 de los 4 núcleos y el entrenamiento cae de ~2.000 a 43-108 pasos/s (el entrenador queda casi sin
  CPU: Windows le da prioridad a la ventana de adelante). Con GPU no debería pasar, pero no lo pudimos medir. Ideas:
  bajar los fps del garaje mientras entrena, o pausar el dibujo cuando la ventana no está al frente.
- **SmartScreen**: sin firma, la primera vez sale «Windows protegió su PC» → *Más información → Ejecutar de todas formas*.
- **No probado** (no hay en el runner): Blender en Windows, un mando/radio USB, una GPU de verdad, Windows 10, una
  cuenta con espacios o acentos en el nombre de usuario, antivirus de terceros. La carpeta de datos con espacios
  (`%APPDATA%\Neural Drone Forge`) sí está probada.
- Rutas largas: la más larga del instalado son 155 caracteres después de la carpeta de instalación (una licencia
  dentro de `torch-*.dist-info`); en `C:\Users\<usuario>\AppData\Local\Programs\Neural Drone Forge` queda bajo el
  límite de 260 salvo con un nombre de usuario de más de ~45 letras o una carpeta elegida muy profunda. Si molesta:
  borrar `torch-*.dist-info/licenses/third_party` en `servidor.spec`.

## Lo que falta (decide Santiago)

1. **⏸ Publicar el .exe** (preparado en la rama, commit «PENDIENTE DE APROBACIÓN»):
   - `instaladores.yml`: el job de Windows sube `Neural-Drone-Forge-windows.exe` al release del tag (los pasos de Mac
     no cambian).
   - `site/index.html`: el botón «Descargar para Windows» + cómo pasar SmartScreen.
   - `README.md` / `README.en.md`: la descarga de Windows.
   Mergear solo cuando el release ya traiga el `.exe` (si no, el botón da 404).
2. **Firmar el código** (para que SmartScreen no asuste). Opciones (precios a octubre de 2026, revisar antes de comprar):
   - **Azure Artifact Signing** (antes *Trusted Signing*): US$ 9,99/mes (5.000 firmas). Solo para organizaciones o
     personas de EE. UU./Canadá (y organizaciones de la UE/Reino Unido); para personas de otros países no sirve hoy.
   - **Certificado OV en la nube** (desde 2023 la llave tiene que ir en hardware o HSM en la nube): Certum ~US$ 116/año
     (3 años por revendedor), SSL.com eSigner desde ~US$ 180/año, Sectigo/DigiCert desde ~US$ 220/año. Ojo: varias CA
     no le dan OV a una persona sin empresa registrada.
   - **EV**: más caro y ya no salta SmartScreen al tiro (la reputación se gana igual, por archivo/editor).
   - **SignPath Foundation**: gratis para proyectos de código abierto (licencia OSI: el repo es MIT, build automático
     en CI), pero el editor que aparece es «SignPath Foundation» y piden que todo el código sea abierto.
   Sin firma igual funciona; la reputación de SmartScreen crece con las descargas.
3. **Steam**: un build para Steam no necesita la firma de SmartScreen (Steam instala y lanza el juego, sin la marca
   de «descargado de internet»). Para Steam: el mismo `empaquetar.sh` pero sin el actualizador propio (Steam
   actualiza), los datos siguen en `%APPDATA%`, y el depot es la carpeta instalada (~835 MB).
