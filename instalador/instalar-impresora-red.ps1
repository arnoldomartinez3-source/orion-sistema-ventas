# Instala una impresora de tickets conectada por cable de red (RJ45) DIRECTO a la computadora, sin router.
# Correr como ADMINISTRADOR en la computadora donde está enchufado el cable:
#   powershell -ExecutionPolicy Bypass -File instalar-impresora-red.ps1 [-IpImpresora 192.168.123.100] [-Driver "POS-80 11.3.0.1"]
# Qué hace: 1) IP fija a la tarjeta de red cableada (mismo rango que la impresora), 2) prueba que la impresora
# responda, 3) imprime un ticket de prueba directo, 4) crea el puerto TCP/IP y la impresora en Windows con el
# driver POS-80 (tiene que estar instalado; si no, instala primero el driver del CD o del fabricante) y la deja
# como predeterminada (el acceso directo de caja de ORIÓN imprime a la predeterminada).
param([string]$IpImpresora = '192.168.123.100', [string]$Driver = '', [string]$NombreImpresora = 'POS-80 Red')

$base = $IpImpresora -replace '\.\d+$', ''
$ipPc = "$base.10"
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Write-Host 'Abre PowerShell como ADMINISTRADOR y vuelve a correrlo.'; exit 1 }

# 1) tarjeta de red cableada física
$ad = Get-NetAdapter -Physical | Where-Object { $_.MediaType -eq '802.3' -and $_.Status -eq 'Up' } | Select-Object -First 1
if (-not $ad) { $ad = Get-NetAdapter -Physical | Where-Object { $_.MediaType -eq '802.3' } | Select-Object -First 1 }
if (-not $ad) { Write-Host 'Esta computadora no tiene puerto de red RJ45. Hace falta un adaptador USB a red.'; exit 1 }
if ($ad.Status -ne 'Up') { Write-Host "El cable no está conectado o la impresora está apagada (tarjeta '$($ad.Name)' sin enlace)."; exit 1 }
Write-Host "Tarjeta de red: $($ad.Name) ($($ad.InterfaceDescription))"
$ya = Get-NetIPAddress -InterfaceIndex $ad.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -eq $ipPc }
if (-not $ya) {
  Remove-NetIPAddress -InterfaceIndex $ad.ifIndex -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
  Remove-NetRoute -InterfaceIndex $ad.ifIndex -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
  Set-NetIPInterface -InterfaceIndex $ad.ifIndex -Dhcp Disabled -ErrorAction SilentlyContinue
  New-NetIPAddress -InterfaceIndex $ad.ifIndex -IPAddress $ipPc -PrefixLength 24 -ErrorAction Stop | Out-Null
  Start-Sleep -Seconds 3
}
Write-Host "IP fija de la computadora en ese cable: $ipPc"

# 2) ¿responde la impresora?
$c = New-Object System.Net.Sockets.TcpClient
$r = $c.BeginConnect($IpImpresora, 9100, $null, $null); $ok = $r.AsyncWaitHandle.WaitOne(3000) -and $c.Connected
if (-not $ok) { Write-Host "La impresora $IpImpresora NO responde. Revisa la hoja de autoprueba (IP y máscara 255.255.255.0) y el cable."; exit 1 }
# 3) ticket de prueba directo (ESC/POS)
$s = $c.GetStream(); $esc = [char]27; $gs = [char]29
$txt = "$esc@$esc" + 'a' + [char]1 + "$esc" + 'E' + [char]1 + "ORION - PRUEBA DE RED`n$esc" + 'E' + [char]0 + "Impresora $IpImpresora`nComputadora $ipPc`n$(Get-Date -Format 'dd/MM/yyyy HH:mm')`n`n`n`n$gs" + 'V' + [char]0
$b = [Text.Encoding]::ASCII.GetBytes($txt); $s.Write($b, 0, $b.Length); $s.Flush(); $c.Close()
Write-Host 'La impresora respondió y debió sacar un ticket de prueba.'

# 4) puerto + impresora en Windows
if (-not $Driver) { $Driver = (Get-PrinterDriver | Where-Object { $_.Name -match 'POS-?80' } | Select-Object -First 1).Name }
if (-not $Driver) { Write-Host 'No está instalado el driver POS-80 en Windows. Instálalo (CD de la impresora o del fabricante) y vuelve a correr esto.'; exit 1 }
$puerto = "IP_$IpImpresora"
if (-not (Get-PrinterPort -Name $puerto -ErrorAction SilentlyContinue)) { Add-PrinterPort -Name $puerto -PrinterHostAddress $IpImpresora -PortNumber 9100 }
if (-not (Get-Printer -Name $NombreImpresora -ErrorAction SilentlyContinue)) { Add-Printer -Name $NombreImpresora -DriverName $Driver -PortName $puerto }
(Get-CimInstance Win32_Printer -Filter "Name='$NombreImpresora'") | Invoke-CimMethod -MethodName SetDefaultPrinter | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows' -Name LegacyDefaultPrinterMode -Value 1 -Type DWord -ErrorAction SilentlyContinue
Write-Host "Listo: impresora '$NombreImpresora' (driver $Driver, puerto $puerto) instalada y PREDETERMINADA. Ya puedes imprimir desde ORIÓN."
