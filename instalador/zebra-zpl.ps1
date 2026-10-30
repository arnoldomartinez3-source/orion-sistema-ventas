# Envía comandos ZPL en bruto a una impresora Zebra instalada en Windows (sin pasar por Chrome ni por el driver).
# Uso:  powershell -ExecutionPolicy Bypass -File zebra-zpl.ps1 -Accion calibrar|prueba|config|zpl [-Zpl "^XA...^XZ"] [-Impresora "ZDesigner ZD421-300dpi ZPL"]
#   calibrar → guarda etiqueta de 56×13 mm con separación, oscuridad 25, velocidad 2 ips y calibra el medio (~JC)
#   prueba   → imprime etiquetas colgantes de muestra (-Items "SKU|precio;SKU|precio" · por defecto 4ST608 $41.00) para ver la alineación
#   config   → solo guarda la configuración (sin calibrar)
#   zpl      → manda el ZPL que se pase en -Zpl
# Corrimientos (mm), por defecto los calibrados con la Zebra ZD421-300dpi de PALMARIA el 2026-10-30 (iguales a src/utils/zebra.js):
#   -ArribaMm / -DerechaMm: corren TODA la impresión hacia arriba / a la derecha
#   -PanelIzqMm / -PanelAbajoMm: corren SOLO el panel izquierdo (marca/precio/SKU) a la izquierda / hacia abajo
#   -BarrasAbajoMm: baja SOLO el código de barras
# Con la variable de entorno ZPL_SOLO_MOSTRAR=1 muestra el ZPL en vez de imprimirlo.
param([string]$Accion = 'prueba', [string]$Zpl = '', [string]$Impresora = '',
  [double]$ArribaMm = 3, [double]$DerechaMm = 4, [double]$PanelIzqMm = 3, [double]$PanelAbajoMm = 1, [double]$BarrasAbajoMm = 1,
  [string]$Items = '', [string]$Marca = 'PALMARIA')

$code = @'
using System; using System.Runtime.InteropServices; using System.Text;
public class RawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DOCINFOW { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern int StartDocPrinter(IntPtr h, int level, ref DOCINFOW di);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, IntPtr buf, int n, out int written);
  public static bool Send(string printer, string data) {
    IntPtr h; if (!OpenPrinter(printer, out h, IntPtr.Zero)) return false;
    var di = new DOCINFOW { pDocName = "ORION ZPL", pDataType = "RAW" };
    bool ok = false; if (StartDocPrinter(h, 1, ref di) > 0) { if (StartPagePrinter(h)) { byte[] b = Encoding.UTF8.GetBytes(data); IntPtr p = Marshal.AllocCoTaskMem(b.Length); Marshal.Copy(b, 0, p, b.Length); int w; ok = WritePrinter(h, p, b.Length, out w); Marshal.FreeCoTaskMem(p); EndPagePrinter(h); } EndDocPrinter(h); }
    ClosePrinter(h); return ok; }
}
'@
if (-not ([System.Management.Automation.PSTypeName]'RawPrint').Type) { Add-Type -TypeDefinition $code }

if (-not $Impresora) { $Impresora = (Get-Printer | Where-Object { $_.DriverName -like 'ZDesigner*' } | Select-Object -First 1).Name }
if (-not $Impresora) { Write-Host 'No hay impresora Zebra (ZDesigner) instalada.'; exit 1 }
$dpi = if ($Impresora -match '300') { 300 } else { 203 }
$pw = [int][math]::Round(56 / 25.4 * $dpi)   # ancho 56 mm en puntos
$ll = [int][math]::Round(13 / 25.4 * $dpi)   # largo 13 mm en puntos
$config = "^XA^MNY^PW$pw^LL$ll^MD25^PR2,2^JUS^XZ"

switch ($Accion) {
  'calibrar' { $data = $config + '~JC' }
  'config'   { $data = $config }
  'zpl'      { $data = $Zpl }
  default {
    # Etiqueta colgante: panel izquierdo (0–20 mm) y derecho (36–56 mm); la tira del centro va en blanco.
    $s = $dpi / 300.0  # escala respecto a 300 dpi
    $f = { param($v) [int][math]::Round($v * $s) }
    $mm = { param($v) [int][math]::Round($v / 25.4 * $dpi) }
    $lt = -(& $mm $ArribaMm); $dx = (& $mm $DerechaMm); $dy = (& $mm $PanelAbajoMm)
    $xi = [math]::Max(0, (& $f 18) + $dx - (& $mm $PanelIzqMm))   # x del panel izquierdo
    $xb = (& $f 438) + $dx                                        # x del código de barras
    $yb = (& $f 18) + (& $mm $BarrasAbajoMm)                      # y del código de barras
    if (-not $Items) { $Items = '4ST608|41.00' }
    $data = ''
    foreach ($it in ($Items -split ';')) {
      $p = $it -split '\|'; $sku = $p[0].Trim(); $precio = if ($p.Count -gt 1) { '$' + $p[1].Trim() } else { '' }
      $data += "^XA^PW$pw^LL$ll^LT$lt^LH0,0^MD25^CI28" +
        "^FO$xi,$((& $f 14) + $dy)^A0N,$(& $f 22),$(& $f 22)^FB$(& $f 200),1,0,C^FD$Marca^FS" +
        "^FO$xi,$((& $f 44) + $dy)^A0N,$(& $f 52),$(& $f 52)^FB$(& $f 200),1,0,C^FD$precio^FS" +
        "^FO$xi,$((& $f 104) + $dy)^A0N,$(& $f 26),$(& $f 26)^FB$(& $f 200),1,0,C^FD$sku^FS" +
        "^FO$xb,$yb^BY2,2.5,$(& $f 78)^BCN,$(& $f 78),Y,N,N^FD$sku^FS" +
        "^XZ"
    }
  }
}
if ($env:ZPL_SOLO_MOSTRAR) { Write-Output $data; exit 0 }
$ok = [RawPrint]::Send($Impresora, $data)
Write-Host "Impresora: $Impresora ($dpi dpi) - accion: $Accion - enviado: $ok"
