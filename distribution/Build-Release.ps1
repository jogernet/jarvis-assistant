param([switch]$Rebuild)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $root
$package=Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version=$package.version
if($Rebuild){& node (Join-Path $PSScriptRoot 'stage-release.cjs') --rebuild}else{& node (Join-Path $PSScriptRoot 'stage-release.cjs')}
if ($LASTEXITCODE -ne 0) {throw 'Staging failed'}
$folder=Join-Path $root ('dist/JARVIS-'+$version+'-win-x64')
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$icon=Join-Path $root 'assets/jarvis.ico'
& $compiler /nologo /codepage:65001 /target:winexe ('/out:'+(Join-Path $folder 'JARVIS.exe')) ('/win32icon:'+$icon) /r:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'DistributionLauncher.cs')
if ($LASTEXITCODE -ne 0) {throw 'Launcher compilation failed'}
& $compiler /nologo /codepage:65001 /target:winexe ('/out:'+(Join-Path $folder 'Uninstall.exe')) ('/win32icon:'+$icon) /r:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'Uninstaller.cs')
if ($LASTEXITCODE -ne 0) {throw 'Uninstaller compilation failed'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=Join-Path $root ('dist/JARVIS-'+$version+'-win-x64.zip')
if($Rebuild -and (Test-Path -LiteralPath $archive)){Remove-Item -LiteralPath $archive}
[IO.Compression.ZipFile]::CreateFromDirectory($folder,$archive,[IO.Compression.CompressionLevel]::Optimal,$false)
$setup=Join-Path $root ('dist/JARVIS-Setup-'+$version+'.exe')
& $compiler /nologo /codepage:65001 /target:winexe ('/out:'+$setup) ('/win32icon:'+$icon) ('/resource:'+$archive+',payload.zip') ('/resource:'+(Join-Path $PSScriptRoot 'TERMS-RU.txt')+',terms.txt') /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll (Join-Path $PSScriptRoot 'Installer.cs')
if ($LASTEXITCODE -ne 0) {throw 'Installer compilation failed'}
$manifest=@{version=$version;platform='win32-x64';file=[IO.Path]::GetFileName($archive);size=(Get-Item -LiteralPath $archive).Length;sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $root 'dist/jarvis-update.json'),($manifest | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
Write-Output ('READY: '+$setup)
Write-Output ('READY: '+$archive)
