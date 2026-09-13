# Configura la impresion de ORION Caja. Lo ejecuta el instalador (como administrador).
#  - Cierra ORION Caja si estaba abierto (para poder tocar su perfil de Chrome).
#  - Deja la impresora elegida como predeterminada de Windows y evita que Windows la cambie sola.
#  - Politica de Chrome: imprimir SIEMPRE a la predeterminada del sistema (no a la ultima usada).
#  - Borra la preferencia de impresora guardada en el perfil C:\OrionCaja (p. ej. "Guardar como PDF").
param([string]$Impresora = '')
$ErrorActionPreference = 'SilentlyContinue'

Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -match 'OrionCaja' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Milliseconds 800

if (-not (Test-Path 'C:\OrionCaja')) { New-Item -ItemType Directory -Path 'C:\OrionCaja' | Out-Null }

if ($Impresora) {
  try { (New-Object -ComObject WScript.Network).SetDefaultPrinter($Impresora) } catch {}
}
$w = 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows'
New-Item -Path $w -Force | Out-Null
Set-ItemProperty -Path $w -Name LegacyDefaultPrinterMode -Value 1 -Type DWord

foreach ($k in @('HKLM:\SOFTWARE\Policies\Google\Chrome', 'HKCU:\SOFTWARE\Policies\Google\Chrome')) {
  New-Item -Path $k -Force | Out-Null
  Set-ItemProperty -Path $k -Name PrintPreviewUseSystemDefaultPrinter -Value 1 -Type DWord
}

$f = 'C:\OrionCaja\Default\Preferences'
if (Test-Path $f) {
  try {
    $j = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.PSObject.Properties['printing']) {
      $j.PSObject.Properties.Remove('printing')
      ($j | ConvertTo-Json -Depth 100 -Compress) | Set-Content $f -Encoding UTF8
    }
  } catch {}
}
exit 0
