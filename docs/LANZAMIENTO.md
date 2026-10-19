# Lanzamiento · lo que falta

Lista viva del lanzamiento de Neural Drone Forge (redes, web, conexiones). La muestra el panel "Pendientes"
al lado de Claude Code. `- [x]` = hecho, `- [ ]` = falta, `- [~]` = en eso.

## ✅ Base
- [x] Página web publicada (sagaz0501.github.io/neural-drone-forge)
- [x] Logo en la web, el juego y la app
- [x] Correo del juego
- [x] Gmail conectado a Claude
- [x] Cuenta de Instagram @neuraldroneforge

## 🎮 Demo de esta semana (19-10 → 26-10)
- [x] Día 1-2 · Partidas en archivos: varias partidas por jugador (crear, cargar, borrar, exportar) en la carpeta de datos
- [~] Día 1-3 · Piezas 3D por script (como la ESP32): ✅ ESC 4 en 1 con pads, ✅ motores (6), ✅ baterías (6), ✅ ESP32-CAM, ✅ chasis de madera (contrachapado en capas) · falta: FC STM32
- [x] Botón 🚪 Salir al escritorio (inicio, panel del garaje y ⏻ en la barra del computador) y ☰ Menú en el garaje · arreglado: en la mesa un motor arrastraba a 3
- [x] Luces y gráficos (19-10): garaje con reflejos (PMREM), foco y contraluz sobre el plato, bloom + viñeta (media/alta), polvo en la luz, ventana, mesa barnizada, portátil, hélices y herramientas con forma, la estación de soldar de Blender; mesa de trabajo más sobria; vuelo con sol de tarde y reflejos del cielo; hélices con forma en todos los drones · la STM32 queda para después (la demo no la usa)
- [x] Día 3 · Las piezas nuevas en la mesa (soldar en los pads del ESC), la tienda (miniaturas) y el dron armado
- [x] Día 3-4 · Gráficos: luz y sombras del garaje, materiales (PBR), mesa con fondo, postproceso suave
- [x] Día 4-5 · Instalador Mac (.dmg, Apple Silicon, sin firmar, 291 MB): Electron + servidor Python empaquetado (PyInstaller, con PyTorch CPU) · `cd desktop && npm run dist` · probado: abre limpio, entrena en segundo plano desde cero (6.400 pasos/s, sin App Nap), examen, y **el laboratorio 3D con el Blender del jugador** (si lo tiene instalado; si no, le dice que es gratis en blender.org)
- [~] Día 5 · Instalador Windows (.exe): el mismo, construido en GitHub Actions (`.github/workflows/instaladores.yml`, listo; falta subirlo y correrlo)
- [x] Pedidos según lo que tienes (solo fotos hasta E5, 3 por día, clientes que mienten sobre el viento) · el primer modelo parte de cero (no de la IA base)
- [x] Actualizaciones sin reinstalar (v3.1.1): la app baja el código nuevo del release (~11 MB) · probado en local: instala, usa la nueva, y si viene rota vuelve sola
- [ ] Día 6 · Prueba completa de los dos modos en un computador limpio (tutorial → Doña Marta → 1.er pedido de la campaña)
- [x] Release v3.1.0 en GitHub con el .dmg (firma ad-hoc) + botón «Descargar para Mac» en la web + README/CHANGELOG (19-10)
- [ ] Reel del demo
- [x] Kit de Steam (19-10): cápsulas en los 7 tamaños, 7 capturas, 4 GIFs, textos EN/ES, tags · `marketing/README.md`
- [ ] Steamworks: cuenta + Steam Direct (US$100) + página «Próximamente» (Santiago)
- [x] Novedades en la web: cada release sale sola de CHANGELOG.md (`site/novedades.py`)

## 📸 Instagram
- [x] Pasar a cuenta de creador (Gaming)
- [x] Foto de perfil, nombre y bio
- [ ] Enlace a la web en el perfil (desde el celular)
- [x] Los 3 primeros reels (Build · Solder · The AI, en inglés) + bio en inglés
- [x] Seguir cuentas del público (FPV, simuladores, indie games): 10 el 18-10
- [ ] Seguir ~10 más por día (sin pasarse: Instagram limita)
- [ ] Conexión para publicar (app de Meta)

## 𝕏 X (Twitter)
- [ ] Crear la cuenta (@NeuralDroneGame: @neuraldroneforge no cabe, máx. 15 letras) con el correo del juego
- [ ] Los primeros 6 posts (GIFs listos en marketing/steam/gifs; textos en marketing/README.md)
- [ ] 3-4 posts por semana

## 🎵 TikTok
- [ ] Crear @neuraldroneforge con el correo del juego
- [ ] Foto de perfil, bio y enlace
- [ ] Conexión para publicar (API de TikTok)

## ▶️ YouTube
- [ ] Canal Neural Drone Forge (correo del juego)
- [ ] Foto, banner, descripción y enlace
- [ ] Conexión para subir videos (YouTube API)

## 🧭 Después
- [ ] Escritorio privado de los dos
- [ ] Plan de marketing
- [ ] Enlaces de las redes en la web
- [ ] Kit de prensa en la web
