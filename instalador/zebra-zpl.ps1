# EnvÃ­a comandos ZPL en bruto a una impresora Zebra instalada en Windows (sin pasar por Chrome).
# Uso:  powershell -ExecutionPolicy Bypass -File zebra-zpl.ps1 -Accion calibrar|prueba|config|zpl [-Zpl "^XA...^XZ"] [-Impresora "ZDesigner ZD421-300dpi ZPL"]
#   calibrar â†’ guarda etiqueta de 56Ã—13 mm con separaciÃ³n, oscuridad 25, velocidad 2 ips y calibra el medio (~JC)
#   prueba   â†’ imprime una etiqueta colgante de muestra (PALMARIA / $41.00 / 4ST608 + Code128) para ver la alineaciÃ³n
#   config   â†’ solo guarda la configuraciÃ³n (sin calibrar)
#   zpl      â†’ manda el ZPL que se pase en -Zpl
param([string]$Accion = 'prueba', [string]$Zpl = '', [string]$Impresora = '', [double]$ArribaMm = 3, [double]$DerechaMm = 4, [double]$PanelIzqMm = 3, [double]$BarrasAbajoMm = 1, [string]$Items = '', [string]$Marca = 'PALMARIA')
# Valores por defecto = calibrados con la Zebra ZD421-300dpi de PALMARIA el 2026-10-30 (etiqueta colgante 56Ã—13 mm).
# -PanelIzqMm: corre SOLO el panel izquierdo (marca/precio/SKU) hacia la izquierda; -BarrasAbajoMm: baja SOLO el cÃ³digo de barras.
# -ArribaMm / -DerechaMm: corren toda la impresiÃ³n (en mm) hacia arriba / a la derecha para cuadrarla con la etiqueta.

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
    # Etiqueta colgante de muestra: panel izquierdo (0â€“20 mm) y derecho (36â€“56 mm); tira del centro en blanco.
    $s = $dpi / 300.0  # escala respecto a 300 dpi
    $f = { param($v) [int][math]::Round($v * $s) }
    $lt = [int][math]::Round(-$ArribaMm / 25.4 * $dpi); $lh = [int][math]::Round($DerechaMm / 25.4 * $dpi)
    # el corrimiento a la derecha se suma a las x (no con ^LH) para poder mover el panel izquierdo mÃ¡s a la izquierda
    $xi = [math]::Max(0, (& $f 18) + $lh - [int][math]::Round($PanelIzqMm / 25.4 * $dpi))   # x del panel izquierdo
    $xb = (& $f 438) + $lh                                                                  # x del cÃ³digo de barras
    $yb = (& $f 18) + [int][math]::Round($BarrasAbajoMm / 25.4 * $dpi)                      # y del cÃ³digo de barras
    # -Items "SKU|precio;SKU|precio;..." imprime varias etiquetas seguidas en un solo envÃ­o (una por producto)
    if (-not $Items) { $Items = '4ST608|41.00' }
    $data = ''
    foreach ($it in ($Items -split ';')) {
      $p = $it -split '\|'; $sku = $p[0].Trim(); $precio = if ($p.Count -gt 1) { '$' + $p[1].Trim() } else { '' }
      $data += "^XA^PW$pw^LL$ll^LT$lt^LH0,0^CI28" +
        "^FO$xi,$(& $f 14)^A0N,$(& $f 22),$(& $f 22)^FB$(& $f 200),1,0,C^FD$Marca^FS" +
        "^FO$xi,$(& $f 44)^A0N,$(& $f 52),$(& $f 52)^FB$(& $f 200),1,0,C^FD$precio^FS" +
        "^FO$xi,$(& $f 104)^A0N,$(& $f 26),$(& $f 26)^FB$(& $f 200),1,0,C^FD$sku^FS" +
        "^FO$xb,$yb^BY2,2.5,$(& $f 78)^BCN,$(& $f 78),Y,N,N^FD$sku^FS" +
        "^XZ"
    }
  }
}
if ($env:ZPL_SOLO_MOSTRAR) { Write-Output $data; exit 0 }; $ok = [RawPrint]::Send($Impresora, $data)
Write-Host "Impresora: $Impresora ($dpi dpi) Â· acciÃ³n: $Accion Â· enviado: $ok"

