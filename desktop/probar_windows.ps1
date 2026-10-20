# LA PRUEBA DEL INSTALADOR EN WINDOWS (la corre .github/workflows/probar-windows.yml en windows-latest; también sirve en
# un PC con Windows:  pwsh desktop/probar_windows.ps1 -Instalador <el .exe> [-Actualizacion <carpeta con
# actualizacion.json + juego-x.tar.gz>]). OJO: instala y desinstala la app de verdad y usa la carpeta de datos normal
# (%APPDATA%\Neural Drone Forge). Deja todo en prueba/: resultados.json, capturas, logs.
param(
  [Parameter(Mandatory = $true)][string]$Instalador,
  [string]$Actualizacion = ""
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$OUT = Join-Path (Get-Location) "prueba"
New-Item -ItemType Directory -Force $OUT | Out-Null
$NUM = [ordered]@{}          # los números
$PASOS = New-Object System.Collections.ArrayList
$APP = "Neural Drone Forge"
$DATOS = Join-Path $env:APPDATA $APP
$SLUG = "prueba_ci"

function Paso([string]$nombre, [bool]$ok, [string]$detalle = "") {
  [void]$PASOS.Add([ordered]@{ paso = $nombre; ok = $ok; detalle = $detalle })
  Write-Host ("{0} {1}  {2}" -f ($(if ($ok) { "[OK]  " } else { "[FALLA]" })), $nombre, $detalle)
}
function Guardar {
  $NUM.pasos = $PASOS
  $NUM | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 (Join-Path $OUT "resultados.json")
}
function Servidores {   # los servidor.exe vivos (el del juego y los entrenadores), con su línea de comandos
  @(Get-CimInstance Win32_Process -Filter "Name='servidor.exe'" | ForEach-Object { [ordered]@{ pid = $_.ProcessId; cmd = $_.CommandLine } })
}
function Captura([string]$nombre) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $OUT "$nombre.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  } catch { Write-Host "captura $nombre falló: $_" }
}
function Api([string]$ruta, $cuerpo = $null, [int]$seg = 30) {
  $u = "http://127.0.0.1:$($script:PUERTO)$ruta"
  if ($null -eq $cuerpo) { return Invoke-RestMethod -Uri $u -TimeoutSec $seg }
  $j = $cuerpo | ConvertTo-Json -Compress -Depth 5
  return Invoke-RestMethod -Uri $u -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($j)) -ContentType "application/json; charset=utf-8" -TimeoutSec $seg
}
function Fondo {   # el entrenamiento del fondo de $SLUG según GET /api/lab
  return @((Api "/api/lab").fondo) | Where-Object { $_.modelo -eq $SLUG } | Select-Object -First 1
}
function CpuPorProceso {   # segundos de CPU acumulados por nombre de proceso
  $h = @{}
  Get-Process | ForEach-Object { if ($_.CPU) { $h[$_.ProcessName] = [double]$h[$_.ProcessName] + $_.CPU } }
  $top = [ordered]@{}
  foreach ($k in @("Neural Drone Forge", "servidor")) { $top[$k] = [double]$h[$k] }
  $top["(todo)"] = [double](($h.Values | Measure-Object -Sum).Sum)
  return $top
}
Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);'
function Ventana([int]$modo) {
  Get-Process -Name $APP -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { [void][W.U]::ShowWindow($_.MainWindowHandle, $modo) }
}
$script:N = 0
function Abrir([hashtable]$entorno = @{}) {
  $script:N++
  Remove-Item (Join-Path $DATOS "prueba.json") -ErrorAction SilentlyContinue
  $env:DRONMAKER_PRUEBA = "1"; $env:ELECTRON_ENABLE_LOGGING = "1"
  foreach ($k in $entorno.Keys) { Set-Item "env:$k" $entorno[$k] }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $script:PROC = Start-Process $script:EXE -PassThru -RedirectStandardOutput (Join-Path $OUT "electron_$($script:N).log") -RedirectStandardError (Join-Path $OUT "electron_$($script:N)_err.log")
  foreach ($k in $entorno.Keys) { Remove-Item "env:$k" }
  $pj = Join-Path $DATOS "prueba.json"
  while ($sw.Elapsed.TotalSeconds -lt 180 -and -not (Test-Path $pj)) { Start-Sleep -Milliseconds 250 }
  if (-not (Test-Path $pj)) { return $null }
  Start-Sleep -Milliseconds 300
  $p = Get-Content $pj -Raw | ConvertFrom-Json
  $p | Add-Member -NotePropertyName segundos -NotePropertyValue ([math]::Round($sw.Elapsed.TotalSeconds, 1))
  $script:PUERTO = $p.puerto
  return $p
}
function Cerrar([string]$cuando) {
  # como el jugador al cerrar la ventana: WM_CLOSE (taskkill SIN /F) -> window-all-closed -> app.quit -> before-quit
  & taskkill /IM "$APP.exe" 2>&1 | Out-Null
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt 30 -and (Get-Process -Name $APP -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 250 }
  $vivo = [bool](Get-Process -Name $APP -ErrorAction SilentlyContinue)
  Paso "cerrar la ventana ($cuando)" (-not $vivo) ("{0:N1} s" -f $sw.Elapsed.TotalSeconds)
  if ($vivo) { Stop-Process -Name $APP -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 3
}
function Esperar([scriptblock]$cond, [int]$seg) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $seg) { try { if (& $cond) { return $true } } catch {}; Start-Sleep -Seconds 1 }
  return $false
}

try {
  # ---------- 1. instalar ----------
  $ins = Get-Item $Instalador
  $NUM.exe_mb = [math]::Round($ins.Length / 1MB, 1)
  $t = Measure-Command { Start-Process $ins.FullName -ArgumentList "/S" -Wait }
  $NUM.instalar_s = [math]::Round($t.TotalSeconds, 1)
  $e = Get-ChildItem "$env:LOCALAPPDATA\Programs", "$env:ProgramFiles" -Recurse -Filter "$APP.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  Paso "instalar en silencio (/S)" ([bool]$e) $(if ($e) { $e.FullName } else { "no aparece $APP.exe" })
  if (-not $e) { throw "no se instaló" }
  $script:EXE = $e.FullName
  $DIR = $e.DirectoryName
  $NUM.carpeta = $DIR
  $NUM.instalada_mb = [math]::Round(((Get-ChildItem $DIR -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB, 1)
  $NUM.acceso_escritorio = Test-Path (Join-Path ([Environment]::GetFolderPath("Desktop")) "$APP.lnk")
  $NUM.acceso_menu = [bool](Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" -Recurse -Filter "$APP.lnk" -ErrorAction SilentlyContinue)

  # ---------- 2. abrir (la primera vez: Windows revisa el ejecutable y carga PyTorch) ----------
  $p = Abrir
  Paso "abrir la app (1.ª vez)" ([bool]$p -and $p.puerto) $(if ($p) { "puerto $($p.puerto), $($p.segundos) s, código $($p.version)" } else { "no escribió prueba.json en 180 s" })
  if (-not $p -or -not $p.puerto) { throw "no arrancó" }
  $NUM.arranque_1_s = $p.segundos
  $NUM.version = $p.version
  $w = Invoke-WebRequest "http://127.0.0.1:$($p.puerto)/app/" -UseBasicParsing -TimeoutSec 20
  Paso "GET /app/" ($w.StatusCode -eq 200) "$($w.StatusCode), $($w.RawContentLength) bytes"
  $w = Invoke-WebRequest "http://127.0.0.1:$($p.puerto)/app/main.js" -UseBasicParsing -TimeoutSec 20
  $ct = @($w.Headers["Content-Type"]) -join ","     # (pwsh 7: los encabezados vienen como lista)
  Paso "main.js como JavaScript" ($ct -like "*javascript*") $ct
  $m = Api "/api/modelos"
  Paso "GET /api/modelos" ($null -ne $m.modelos) "$(@($m.modelos).Count) modelos: $((@($m.modelos) | ForEach-Object { $_.slug }) -join ', ')"
  $esc = @(Get-NetTCPConnection -LocalPort $p.puerto -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.LocalAddress } | Sort-Object -Unique)
  Paso "escucha solo en 127.0.0.1 (sin aviso del firewall)" (($esc -join ",") -eq "127.0.0.1") ($esc -join ",")
  Start-Sleep -Seconds 12
  Captura "1_inicio"

  # ---------- 3. entrenar unos segundos en el fondo ----------
  $r = Api "/api/lab" @{ accion = "iniciar"; modelo = $SLUG; base_de = "cero"; donde = "fondo"; nivel = 19; drones = 16 }
  Paso "POST /api/lab iniciar (fondo, nivel 19)" ([bool]$r.ok) "$($r.msg) pid=$($r.pid)"
  # la velocidad con la ventana a la vista y minimizada (el runner no tiene GPU: Chromium dibuja el garaje con la CPU)
  $ok = Esperar { (Fondo).steps -gt 0 } 180
  $sw = [Diagnostics.Stopwatch]::StartNew()
  function Medir([int]$seg) {
    $c0 = CpuPorProceso; $s0 = [double](Fondo).steps; $t0 = $sw.Elapsed.TotalSeconds
    Start-Sleep -Seconds $seg
    $c1 = CpuPorProceso; $s1 = [double](Fondo).steps; $t1 = $sw.Elapsed.TotalSeconds
    $cpu = [ordered]@{}
    foreach ($k in $c1.Keys) { $cpu[$k] = [math]::Round(($c1[$k] - [double]$c0[$k]) / ($t1 - $t0), 2) }   # núcleos usados
    return [ordered]@{ pasos_por_s = [math]::Round(($s1 - $s0) / ($t1 - $t0)); cpu_nucleos = $cpu }
  }
  $NUM.entreno_visible = Medir 45
  Captura "2_entrenando"
  Ventana 6        # SW_MINIMIZE
  $NUM.entreno_minimizada = Medir 45
  Ventana 9        # SW_RESTORE
  $NUM.pasos_por_s = $NUM.entreno_visible.pasos_por_s
  $f = Fondo
  $NUM.entreno = [ordered]@{ gen = $f.gen; steps = $f.steps; phase = $f.phase; segundos = [math]::Round($sw.Elapsed.TotalSeconds) }
  Paso "el entrenamiento avanza" ($f -and $f.gen -ge 1) ("gen {0}, {1} pasos; {2} pasos/s con la ventana a la vista, {3} minimizada" -f $f.gen, $f.steps, $NUM.entreno_visible.pasos_por_s, $NUM.entreno_minimizada.pasos_por_s)
  $udp = @(Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 9031, 9032 } | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" })
  $NUM.udp = $udp
  $r = Api "/api/lab" @{ accion = "detener"; modelo = $SLUG; donde = "fondo" }
  $ok = Esperar { -not (Fondo).activo } 120
  Paso "detener (guarda y sale)" $ok "$($r.msg)"
  $zip = Join-Path $DATOS "models\drones\$SLUG\modelo.zip"
  Paso "guardó modelo.zip" (Test-Path $zip) $zip
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $ev = Api "/api/evaluar?modelo=$SLUG&nivel=19&n=5" $null 600
  Paso "GET /api/evaluar" ($null -ne $ev.exito) ("éxito {0}, choque {1}, gen {2}, {3:N1} s" -f $ev.exito, $ev.choque, $ev.gen, $sw.Elapsed.TotalSeconds)
  $sim = Api "/api/simular" @{ modelo = $SLUG } 300
  Paso "POST /api/simular" ($null -ne $sim) ""

  # ---------- 4. el entrenamiento sigue al cerrar la app y se encuentra al abrirla (sin `ps`: fondo.json) ----------
  $r = Api "/api/lab" @{ accion = "iniciar"; modelo = $SLUG; donde = "fondo"; nivel = 19; drones = 16 }
  $ok = Esperar { (Fondo).steps -gt 0 -and (Fondo).al_dia } 180
  Paso "entrenar otra vez" $ok "$($r.msg)"
  Cerrar "entrenando"
  $s = @(Servidores)
  $NUM.al_cerrar_entrenando = $s
  $quedan = @($s | Where-Object { $_.cmd -like "*live_train.py*" })
  Paso "al cerrar: el entrenador sigue (como en Mac) y el servidor no" ($quedan.Count -eq 1 -and $s.Count -eq 1) "$($s.Count) servidor.exe"
  $p = Abrir
  Paso "abrir otra vez" ([bool]$p) "$($p.segundos) s"
  $NUM.arranque_2_s = $p.segundos
  $f = Fondo
  Paso "encuentra el entrenamiento de antes" ($f -and $f.activo) "activo=$($f.activo) pid=$($f.pid) gen=$($f.gen)"
  $r = Api "/api/lab" @{ accion = "detener"; modelo = $SLUG; donde = "fondo" }
  $ok = Esperar { @(Servidores | Where-Object { $_.cmd -like "*live_train.py*" }).Count -eq 0 } 120
  Paso "detenerlo desde la app nueva" $ok "$($r.msg)"
  Cerrar "sin entrenar"
  $s = @(Servidores)
  Paso "sin servidor.exe huérfanos" ($s.Count -eq 0) "$($s.Count) vivos"

  # ---------- 5. la actualización sin reinstalar ----------
  if ($Actualizacion) {
    $man = Get-Content (Join-Path $Actualizacion "actualizacion.json") -Raw | ConvertFrom-Json
    $NUM.actualizacion_mb = [math]::Round($man.bytes / 1MB, 1)
    $http = Start-Process python -ArgumentList "-m", "http.server", "8123", "--bind", "127.0.0.1", "--directory", "`"$Actualizacion`"" -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 3
    $p = Abrir @{ DRONMAKER_ACTUALIZACIONES = "http://127.0.0.1:8123"; DRONMAKER_ACTUALIZAR = "si" }
    $dirAct = Join-Path $DATOS "actualizaciones\$($man.version)"
    Paso "instala la actualización $($man.version)" ($p -and $p.version -eq $man.version -and $p.actualizado) "versión $($p.version), código en $($p.codigo), $($p.segundos) s"
    Paso "el código nuevo está en la carpeta de datos" (Test-Path (Join-Path $dirAct "scripts\jugar.py")) $dirAct
    if ($p) {
      $w = Invoke-WebRequest "http://127.0.0.1:$($p.puerto)/app/" -UseBasicParsing -TimeoutSec 20
      Paso "el juego responde con el código nuevo" ($w.StatusCode -eq 200) ""
      Start-Sleep -Seconds 8
      Captura "3_actualizado"
    }
    Cerrar "actualizado"
    $p = Abrir
    Paso "al abrir sin internet sigue en la actualización" ($p -and $p.version -eq $man.version) "versión $($p.version)"
    Cerrar "después de actualizar"
    Stop-Process -Id $http.Id -Force -ErrorAction SilentlyContinue
  }
  $s = @(Servidores)
  Paso "al final: sin servidor.exe" ($s.Count -eq 0) "$($s.Count) vivos"

  # ---------- 5b. el entrenador congelado SIN la app (¿lo lento es el runner o la app al lado?) ----------
  $solo = Join-Path $env:TEMP "ndf_solo"
  Remove-Item $solo -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $solo | Out-Null
  $juego = Join-Path $DIR "resources\juego"
  $env:DRONMAKER_CODIGO = $juego
  $ps = Start-Process (Join-Path $DIR "resources\servidor\servidor.exe") -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $OUT "solo.log") -RedirectStandardError (Join-Path $OUT "solo_err.log") -ArgumentList @(
    "-u", "`"$juego\scripts\live_train.py`"", "--model", "`"$solo\modelo.zip`"", "--estado", "`"$solo\e.json`"", "--speed", "rapido",
    "--stage", "19", "--drones", "16", "--port", "9231", "--ctrl-port", "9232")
  Remove-Item env:DRONMAKER_CODIGO
  $ej = Join-Path $solo "e.json"
  $leer = { try { [double]((Get-Content $ej -Raw | ConvertFrom-Json).steps) } catch { 0 } }
  [void](Esperar { (& $leer) -gt 0 } 180)
  $s0 = & $leer; $t0 = Get-Date
  Start-Sleep -Seconds 45
  $s1 = & $leer
  $NUM.entreno_sin_app = [math]::Round(($s1 - $s0) / ((Get-Date) - $t0).TotalSeconds)
  $u = New-Object System.Net.Sockets.UdpClient
  $bytes = [Text.Encoding]::UTF8.GetBytes('{"stop": true}')
  [void]$u.Send($bytes, $bytes.Length, "127.0.0.1", 9232); $u.Close()
  $fin = $ps.WaitForExit(120000)
  Paso "entrenador congelado solo (sin la app)" ($s1 -gt $s0 -and $fin) "$($NUM.entreno_sin_app) pasos/s; salió al pedirle stop: $fin"

  # ---------- 6. desinstalar ----------
  $un = Get-ChildItem $DIR -Filter "Uninstall*.exe" | Select-Object -First 1
  if ($un) {
    $t = Measure-Command { Start-Process $un.FullName -ArgumentList "/S" -Wait }
    Start-Sleep -Seconds 5
    Paso "desinstalar (/S)" (-not (Test-Path $script:EXE)) ("{0:N1} s; los datos quedan: {1}" -f $t.TotalSeconds, (Test-Path $DATOS))
  } else { Paso "desinstalar (/S)" $false "no hay Uninstall*.exe" }
} catch {
  Paso "la prueba se cayó" $false "$_ $($_.ScriptStackTrace)"
  Captura "error"
} finally {
  Get-Process -Name $APP -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='servidor.exe'" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  foreach ($f in @("servidor.log", "prueba.json", "models\drones\$SLUG\entrenando.log", "models\drones\$SLUG\entrenando.json", "models\drones\$SLUG\fondo.json")) {
    $src = Join-Path $DATOS $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $OUT ($f -replace '[\\/]', '_')) }
  }
  Guardar
  $fallas = @($PASOS | Where-Object { -not $_.ok })
  if ($env:GITHUB_STEP_SUMMARY) {
    $md = @("## Prueba de Windows", "", "| | paso | detalle |", "|---|---|---|")
    $md += $PASOS | ForEach-Object { "| $(if ($_.ok) { '✅' } else { '❌' }) | $($_.paso) | $($_.detalle -replace '\|', '/') |" }
    $md += "", '```json', ($NUM | ConvertTo-Json -Depth 3), '```'
    $md -join "`n" | Out-File -Append -Encoding utf8 $env:GITHUB_STEP_SUMMARY
  }
  if ($fallas.Count) { Write-Host "$($fallas.Count) pasos fallaron"; exit 1 }
}
