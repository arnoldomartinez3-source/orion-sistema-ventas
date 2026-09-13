; ══════════════════════════════════════════════════════════════════════
; ORION Caja — instalador (Inno Setup 6)
; Deja una PC lista para que ORION imprima los tickets DIRECTO en la impresora
; termica: acceso directo "ORION Caja" (Chrome en modo kiosco con perfil propio
; en C:\OrionCaja), impresora termica como predeterminada y politica de Chrome
; para usar siempre la predeterminada del sistema.
; Compilar:  "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" instalador\ORION-Caja.iss
; Salida:    public\descargas\ORION-Caja-Setup.exe  (Hosting lo sirve tal cual)
; Sin firma digital: Windows muestra "Windows protegio su PC" → Mas informacion → Ejecutar.
; ══════════════════════════════════════════════════════════════════════

#define AppName "ORION Caja"
#define AppVersion "1.0"
#define Publisher "One Geo Systems"
#define AppUrl "https://app.orionsv.net"
#define KioscoArgs "--kiosk-printing --start-fullscreen --user-data-dir=C:\OrionCaja --app=https://app.orionsv.net/?kiosco=1"

[Setup]
AppId={{7B1E6C0A-5C2D-4E7F-9A3B-0A10ECA3A001}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
AppPublisherURL={#AppUrl}
DefaultDirName={autopf}\ORION Caja
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=no
PrivilegesRequired=admin
OutputDir=..\public\descargas
OutputBaseFilename=ORION-Caja-Setup
SetupIconFile=..\public\orion.ico
UninstallDisplayIcon={app}\orion.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=110
ShowLanguageDialog=no

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Messages]
es.WelcomeLabel1=Bienvenido al instalador de ORION Caja
es.WelcomeLabel2=Este asistente deja lista esta computadora para que ORION imprima los tickets DIRECTO en la impresora termica, sin el cuadro de "Imprimir" de Windows.%n%nCrea el acceso directo "ORION Caja" en el Escritorio y configura la impresora de tickets.%n%nNecesita tener Google Chrome instalado.
es.FinishedHeadingLabel=Listo
es.FinishedLabel=Abra ORION siempre con el icono "ORION Caja" del Escritorio. La primera vez pedira iniciar sesion. Se abre a pantalla completa; con F11 se puede salir y volver.%n%nConsejo: en el driver de la impresora use papel 80 x 210 mm y densidad maxima.

[Files]
Source: "..\public\orion.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "configurar.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "listar-impresoras.ps1"; Flags: dontcopy

[Icons]
Name: "{commondesktop}\ORION Caja"; Filename: "{code:RutaChrome}"; Parameters: "{#KioscoArgs}"; IconFilename: "{app}\orion.ico"; Comment: "Caja ORION (impresion directa)"
Name: "{autoprograms}\ORION Caja"; Filename: "{code:RutaChrome}"; Parameters: "{#KioscoArgs}"; IconFilename: "{app}\orion.ico"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\configurar.ps1"" -Impresora ""{code:ImpresoraElegida}"""; Flags: runhidden waituntilterminated; StatusMsg: "Configurando la impresora de tickets..."
Filename: "{code:RutaChrome}"; Parameters: "{#KioscoArgs}"; Description: "Abrir ORION Caja ahora"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  Chrome: String;
  PaginaImpresora: TInputOptionWizardPage;
  Impresoras: TArrayOfString;
  HayImpresoras: Boolean;

function RutaChrome(Param: String): String;
begin
  Result := Chrome;
end;

function BuscarChrome(): String;
var
  Rutas: TArrayOfString;
  I: Integer;
begin
  SetArrayLength(Rutas, 3);
  Rutas[0] := ExpandConstant('{commonpf}\Google\Chrome\Application\chrome.exe');
  Rutas[1] := ExpandConstant('{commonpf32}\Google\Chrome\Application\chrome.exe');
  Rutas[2] := ExpandConstant('{localappdata}\Google\Chrome\Application\chrome.exe');
  Result := '';
  for I := 0 to 2 do
    if (Result = '') and FileExists(Rutas[I]) then Result := Rutas[I];
end;

function InitializeSetup(): Boolean;
var
  Err: Integer;
begin
  Chrome := BuscarChrome();
  if Chrome = '' then
  begin
    MsgBox('No se encontro Google Chrome en esta computadora.' + #13#10#13#10 +
           'Se abrira la pagina para instalarlo. Cuando termine, vuelva a ejecutar este instalador.', mbError, MB_OK);
    ShellExec('open', 'https://www.google.com/chrome/', '', '', SW_SHOWNORMAL, ewNoWait, Err);
    Result := False;
    Exit;
  end;
  Result := True;
end;

procedure CargarImpresoras();
var
  Archivo, Script: String;
  Codigo, I: Integer;
  Lineas: TArrayOfString;
begin
  HayImpresoras := False;
  ExtractTemporaryFile('listar-impresoras.ps1');
  Script := ExpandConstant('{tmp}\listar-impresoras.ps1');
  Archivo := ExpandConstant('{tmp}\orion_impresoras.txt');
  DeleteFile(Archivo);
  Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
       '-NoProfile -ExecutionPolicy Bypass -File "' + Script + '" -Salida "' + Archivo + '"',
       '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  if LoadStringsFromFile(Archivo, Lineas) then
  begin
    SetArrayLength(Impresoras, 0);
    for I := 0 to GetArrayLength(Lineas) - 1 do
      if Trim(Lineas[I]) <> '' then
      begin
        SetArrayLength(Impresoras, GetArrayLength(Impresoras) + 1);
        Impresoras[GetArrayLength(Impresoras) - 1] := Lineas[I];
      end;
    HayImpresoras := GetArrayLength(Impresoras) > 0;
  end;
end;

procedure InitializeWizard();
var
  I, Sugerida: Integer;
  Nombre: String;
begin
  PaginaImpresora := CreateInputOptionPage(wpWelcome,
    'Impresora de tickets',
    'Elija la impresora termica donde saldran los tickets.',
    'ORION Caja imprime SIEMPRE en la impresora predeterminada de Windows. Elija la termica (POS-80, 58 mm, etc.). ' +
    'Si elige una de PDF o XPS, en vez de imprimir se abrira un cuadro para guardar archivos.',
    True, True);
  CargarImpresoras();
  Sugerida := -1;
  if HayImpresoras then
  begin
    for I := 0 to GetArrayLength(Impresoras) - 1 do
    begin
      Nombre := Impresoras[I];
      if Copy(Nombre, 1, 1) = '*' then
      begin
        Nombre := Copy(Nombre, 2, Length(Nombre));
        Impresoras[I] := Nombre;
        Sugerida := I;
        Nombre := Nombre + '   (detectada como termica)';
      end;
      PaginaImpresora.Add(Nombre);
    end;
    PaginaImpresora.Add('No cambiar la impresora predeterminada ahora');
    if Sugerida >= 0 then PaginaImpresora.SelectedValueIndex := Sugerida
    else PaginaImpresora.SelectedValueIndex := 0;
  end
  else
  begin
    PaginaImpresora.Add('No se encontraron impresoras (configurela despues desde Windows)');
    PaginaImpresora.SelectedValueIndex := 0;
  end;
end;

function ImpresoraElegida(Param: String): String;
var
  Idx: Integer;
begin
  Result := '';
  if not HayImpresoras then Exit;
  Idx := PaginaImpresora.SelectedValueIndex;
  if (Idx >= 0) and (Idx < GetArrayLength(Impresoras)) then Result := Impresoras[Idx];
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
var
  Imp: String;
begin
  Imp := ImpresoraElegida('');
  if Imp = '' then Imp := '(sin cambios)';
  Result := 'Se va a configurar:' + NewLine +
            Space + 'Acceso directo "ORION Caja" en el Escritorio (pantalla completa)' + NewLine +
            Space + 'Perfil de Chrome propio en C:\OrionCaja' + NewLine +
            Space + 'Impresora de tickets: ' + Imp + NewLine +
            Space + 'Chrome imprimira siempre a la predeterminada de Windows' + NewLine + NewLine +
            'Google Chrome: ' + Chrome;
end;
