$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest=Get-Content -LiteralPath (Join-Path $root 'dist/jarvis-update.json') -Raw | ConvertFrom-Json
$archive=Join-Path $root ('dist/'+$manifest.file)
if((Get-Item -LiteralPath $archive).Length -ne $manifest.size -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256){throw 'Manifest checksum mismatch'}
$setup=Join-Path $root ('dist/JARVIS-Setup-'+$manifest.version+'.exe')
$assembly=[Reflection.Assembly]::LoadFile($setup)
$stream=$assembly.GetManifestResourceStream('payload.zip')
if(!$stream){throw 'Installer payload missing'}
try{
 $hash=[Security.Cryptography.SHA256]::Create()
 try{$payloadHash=([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
 if($payloadHash -ne $manifest.sha256){throw 'Installer payload differs from verified portable archive'}
 $stream.Position=0
 $zip=New-Object IO.Compression.ZipArchive($stream,[IO.Compression.ZipArchiveMode]::Read,$true)
 try{
  $entries=@($zip.Entries | ForEach-Object {$_.FullName.Replace('\','/')})
  foreach($entry in $entries){if($entry -match '(^|/)(desktop-profile|test-profile|\.env|connection\.enc|telegram\.enc|journal\.enc|spotify\.enc)(/|$)'){throw 'Private data in installer'}}
  $prefix='versions/'+$manifest.version+'/resources/app/'
  foreach($file in @('JARVIS.exe','Uninstall.exe','current.txt',($prefix+'desktop.cjs'),($prefix+'update-service.cjs'),($prefix+'public/models/ru-small.tar.gz'),($prefix+'telegram-runtime/node_modules/telegram/index.js'))){if($entries -notcontains $file){throw ('Missing payload file: '+$file)}}
  Write-Output ('PASS: installer payload equals SHA-256-verified portable ZIP; '+$entries.Count+' entries; personal profiles absent.')
 }finally{$zip.Dispose()}
}finally{$stream.Dispose()}
