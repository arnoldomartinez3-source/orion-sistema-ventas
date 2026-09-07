@echo off
setlocal EnableDelayedExpansion
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

REM ---- 2) Carpeta del perfil propio de ORION Caja ----
if not exist "C:\OrionCaja" mkdir "C:\OrionCaja"
echo  [OK] Carpeta C:\OrionCaja lista.

REM ---- 3) Icono de ORION (si no se puede descargar, usa el de Chrome) ----
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing 'https://app.orionsv.net/orion.ico' -OutFile 'C:\OrionCaja\orion.ico' } catch {}" >nul 2>&1
set "ICON=C:\OrionCaja\orion.ico"
if not exist "%ICON%" set "ICON=%CHROME%"

REM ---- 4) Acceso directo "ORION Caja" en el Escritorio ----
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'\ORION Caja.lnk'); $s.TargetPath='%CHROME%'; $s.Arguments='--kiosk-printing --start-maximized --user-data-dir=\"C:\OrionCaja\" --app=https://app.orionsv.net'; $s.WorkingDirectory='C:\OrionCaja'; $s.IconLocation='%ICON%'; $s.Description='ORION Punto de Venta - impresion directa'; $s.Save(); Write-Host ('  [OK] Acceso directo creado: ' + $d + '\ORION Caja.lnk')"
if errorlevel 1 echo  [!] No se pudo crear el acceso directo. Avise a One Geo Systems.

REM ---- 5) Impresora termica como predeterminada ----
REM Chrome en modo kiosco imprime SIEMPRE a la predeterminada de Windows. Si la
REM predeterminada es "Print to PDF", abre el cuadro de guardar PDF en vez de
REM imprimir. Por eso se detecta la termica por su nombre y queda como
REM predeterminada aunque el usuario solo de Enter.
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
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=@(Get-Printer | Sort-Object Name)[%NUM%-1]; if (-not $p) { exit 1 }; (New-Object -ComObject WScript.Network).SetDefaultPrinter($p.Name); Set-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows' -Name LegacyDefaultPrinterMode -Value 1 -Type DWord; Write-Host ('  [OK] Impresora predeterminada: ' + $p.Name)"
  if errorlevel 1 echo  [!] Numero no valido. Elija la predeterminada desde Configuracion de Windows.
) else (
  echo  [!] No se eligio impresora. Ponga la termica como predeterminada en Windows.
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=(Get-CimInstance Win32_Printer | Where-Object Default).Name; if ($d -match 'PDF|XPS|OneNote|Fax') { Write-Host ('  [!] ATENCION: la predeterminada es ' + $d + '. Asi el ticket NO saldra por la termica.') } else { Write-Host ('  [OK] Predeterminada actual: ' + $d) }"

echo.
echo  ==============================================
echo   Listo. Abra ORION siempre con el icono
echo   "ORION Caja" del Escritorio. La primera vez
echo   pedira iniciar sesion.
echo.
echo   Consejo: en el driver de la impresora use
echo   papel 80 x 210 mm y densidad maxima.
echo  ==============================================
echo.
set "ABRIR="
set /p "ABRIR=  Abrir ORION Caja ahora? (S/N): "
if /i "%ABRIR%"=="S" start "" "%CHROME%" --kiosk-printing --start-maximized --user-data-dir="C:\OrionCaja" --app=https://app.orionsv.net
echo.
pause
endlocal
