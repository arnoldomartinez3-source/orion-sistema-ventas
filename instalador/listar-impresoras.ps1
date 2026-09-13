# Lista las impresoras instaladas para el asistente de ORION Caja.
# Escribe una por linea en el archivo indicado; la que parece termica lleva "*" al inicio.
param([string]$Salida = "$env:TEMP\orion_impresoras.txt")
$ErrorActionPreference = 'SilentlyContinue'
$lineas = @()
$sugerida = $false
Get-Printer | Sort-Object Name | ForEach-Object {
  $n = $_.Name
  $esTermica = ($n -match 'POS|80|58|therm|termic|ticket|receipt|xprinter|epson tm|bixolon|star tsp') -and ($n -notmatch 'PDF|XPS|OneNote|Fax')
  if ($esTermica -and -not $sugerida) { $lineas += "*$n"; $sugerida = $true } else { $lineas += $n }
}
$lineas | Set-Content -Path $Salida -Encoding UTF8
