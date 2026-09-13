@echo off
setlocal
title ORION Caja - Instalador
color 1F
echo.
echo  ==============================================
echo    ORION Caja - Instalador   (One Geo Systems)
echo  ==============================================
echo.
echo  Este asistente deja lista esta computadora para que ORION
echo  imprima los tickets DIRECTO en la impresora termica,
echo  sin el cuadro de "Imprimir" de Windows.
echo.

REM ---- 0) Permisos de administrador (UAC) ----
REM La politica de Chrome vive en HKLM/HKCU\Software\Policies, que solo escribe un
REM administrador. Si no somos admin, nos relanzamos con UAC; si el usuario lo
REM rechaza, seguimos sin la politica (el resto funciona igual). ORION_NOELEVATE=1
REM salta este paso (pruebas).
REM OJO: sin bloques ( ) aqui, porque la ruta del archivo puede traer parentesis
REM (p. ej. "ORION-Caja-Instalar (1).bat") y romperia el bloque.
if "%ORION_NOELEVATE%"=="1" goto :sinuac
net session >nul 2>&1
if not errorlevel 1 goto :sinuac
echo  Se pediran permisos de administrador para dejar la impresion
echo  configurada para todos los usuarios de esta computadora...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -Verb RunAs -ArgumentList '/c \"%~f0\"'" >nul 2>&1
if not errorlevel 1 exit /b
echo  [!] Sin permisos de administrador: se continua sin la politica de Chrome.
echo.
:sinuac

REM ---- 1) Buscar Google Chrome ----
set "CHROME="
for %%P in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do (
  if not defined CHROME if exist "%%~P" set "CHROME=%%~P"
)
if not defined CHROME (
  echo  [X] No se encontro Google Chrome en esta computadora.
  echo      Se abrira la pagina para instalarlo. Cuando termine,
  echo      vuelva a ejecutar este instalador.
  start "" https://www.google.com/chrome/
  echo.
  pause
  exit /b 1
)
echo  [OK] Google Chrome encontrado.

REM ---- 2) Cerrar ORION Caja si esta abierto (para poder ajustar su perfil) ----
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -match 'OrionCaja' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
if not exist "C:\OrionCaja" mkdir "C:\OrionCaja"
echo  [OK] Carpeta C:\OrionCaja lista.

REM ---- 3) Icono de ORION (si no se puede descargar, usa el de Chrome) ----
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing 'https://app.orionsv.net/orion.ico' -OutFile 'C:\OrionCaja\orion.ico' } catch {}" >nul 2>&1
set "ICON=C:\OrionCaja\orion.ico"
if not exist "%ICON%" set "ICON=%CHROME%"

REM ---- 4) Acceso directo "ORION Caja" en el Escritorio (pantalla completa) ----
set "ARGS=--kiosk-printing --start-fullscreen --user-data-dir=\"C:\OrionCaja\" --app=https://app.orionsv.net/?kiosco=1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'\ORION Caja.lnk'); $s.TargetPath='%CHROME%'; $s.Arguments='%ARGS%'; $s.WorkingDirectory='C:\OrionCaja'; $s.IconLocation='%ICON%'; $s.Description='ORION Punto de Venta - impresion directa'; $s.Save(); Write-Host ('  [OK] Acceso directo creado: ' + $d + '\ORION Caja.lnk')"
if errorlevel 1 echo  [!] No se pudo crear el acceso directo. Avise a One Geo Systems.

REM ---- 5) Impresora termica como predeterminada de Windows ----
REM Chrome en modo kiosco imprime a la impresora predeterminada. Si la
REM predeterminada es "Print to PDF", abre el cuadro de guardar PDF en vez de
REM imprimir. Se detecta la termica por su nombre y queda como predeterminada
REM aunque el usuario solo de Enter.
echo.
echo  Impresoras instaladas en esta computadora:
powershell -NoProfile -ExecutionPolicy Bypass -Command "$i=0; Get-Printer | Sort-Object Name | ForEach-Object { $i++; Write-Host ('   ' + $i + ') ' + $_.Name) }"
set "SUG=0"
for /f "usebackq delims=" %%S in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$i=0; $n=0; Get-Printer | Sort-Object Name | ForEach-Object { $i++; if ($n -eq 0 -and $_.Name -match 'POS|80|58|therm|termic|ticket|receipt|xprinter|epson tm|bixolon|star tsp' -and $_.Name -notmatch 'PDF|XPS|OneNote|Fax') { $n=$i } }; Write-Output $n"`) do set "SUG=%%S"
echo.
set "NUM="
if not "%SUG%"=="0" (
  echo  Se detecto una impresora termica: es la opcion %SUG%
  set /p "NUM=  Escriba el NUMERO de la impresora de tickets (Enter = usar la %SUG%): "
  if not defined NUM set "NUM=%SUG%"
) else (
  set /p "NUM=  Escriba el NUMERO de la impresora termica de tickets: "
)
if defined NUM (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=@(Get-Printer | Sort-Object Name)[%NUM%-1]; if (-not $p) { exit 1 }; (New-Object -ComObject WScript.Network).SetDefaultPrinter($p.Name); Set-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows' -Name LegacyDefaultPrinterMode -Value 1 -Type DWord; Write-Host ('  [OK] Impresora predeterminada de Windows: ' + $p.Name)"
  if errorlevel 1 echo  [!] Numero no valido. Elija la predeterminada desde Configuracion de Windows.
) else (
  echo  [!] No se eligio impresora. Ponga la termica como predeterminada en Windows.
)

REM ---- 6) Chrome: usar SIEMPRE la predeterminada del sistema (no la ultima usada) ----
REM Chrome recuerda la ultima impresora usada por perfil (p. ej. "Guardar como PDF"
REM de una prueba) y en modo kiosco la sigue usando. Esta politica lo evita, y
REM ademas se borra la preferencia guardada en el perfil de ORION Caja.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=0; foreach ($k in @('HKLM:\SOFTWARE\Policies\Google\Chrome','HKCU:\SOFTWARE\Policies\Google\Chrome')) { try { New-Item -Path $k -Force -ErrorAction Stop | Out-Null; Set-ItemProperty -Path $k -Name PrintPreviewUseSystemDefaultPrinter -Value 1 -Type DWord -ErrorAction Stop; $ok=1 } catch {} }; if ($ok) { Write-Host '  [OK] Chrome usara siempre la impresora predeterminada del sistema.' } else { Write-Host '  [!] No se pudo fijar la politica de Chrome (requiere administrador). El resto queda configurado.' }"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='C:\OrionCaja\Default\Preferences'; if (Test-Path $f) { try { $j=Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json; if ($j.PSObject.Properties['printing']) { $j.PSObject.Properties.Remove('printing'); $j | ConvertTo-Json -Depth 100 -Compress | Set-Content $f -Encoding UTF8; Write-Host '  [OK] Se borro la impresora recordada del perfil ORION Caja.' } } catch { Write-Host '  [!] No se pudo limpiar la preferencia de impresora del perfil (no es grave).' } }"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=(Get-CimInstance Win32_Printer | Where-Object Default).Name; if ($d -match 'PDF|XPS|OneNote|Fax') { Write-Host ('  [!] ATENCION: la predeterminada es ' + $d + '. Asi el ticket NO saldra por la termica.') } else { Write-Host ('  [OK] Predeterminada actual: ' + $d) }"

echo.
echo  ==============================================
echo   Listo. Abra ORION siempre con el icono
echo   "ORION Caja" del Escritorio. La primera vez
echo   pedira iniciar sesion. Se abre a pantalla
echo   completa; con F11 se puede salir y volver.
echo.
echo   Consejo: en el driver de la impresora use
echo   papel 80 x 210 mm y densidad maxima.
echo  ==============================================
echo.
set "ABRIR="
set /p "ABRIR=  Abrir ORION Caja ahora? (S/N): "
if /i "%ABRIR%"=="S" start "" "%CHROME%" --kiosk-printing --start-fullscreen --user-data-dir="C:\OrionCaja" --app=https://app.orionsv.net/?kiosco=1
echo.
pause
endlocal
