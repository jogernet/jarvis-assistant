$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$testRoot=Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../runtime'))) ('test-update-archive-'+[Guid]::NewGuid().ToString())
[IO.Directory]::CreateDirectory($testRoot)|Out-Null
function MakeArchive([string]$file,[string[]]$names) {
 $stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew)
 $zip=New-Object IO.Compression.ZipArchive($stream,[IO.Compression.ZipArchiveMode]::Create)
 try {foreach($name in $names){$entry=$zip.CreateEntry($name);$writer=New-Object IO.StreamWriter($entry.Open());$writer.Write('fixture');$writer.Dispose()}} finally {$zip.Dispose();$stream.Dispose()}
}
$good=Join-Path $testRoot 'good.zip';MakeArchive $good @('versions/0.18.0/resources/app/file.txt')
$destination=Join-Path $testRoot 'good'
& (Join-Path $PSScriptRoot 'Expand-Update.ps1') -Archive $good -Destination $destination -Version '0.18.0'
if((Get-Content -LiteralPath (Join-Path $destination 'resources/app/file.txt') -Raw) -ne 'fixture'){throw 'Valid archive not extracted'}
foreach($name in @('versions/0.18.0/../escape.txt','versions/0.18.0/C:/escape.txt','versions/0.18.0/../../escape.txt')){
 $bad=Join-Path $testRoot ([Guid]::NewGuid().ToString()+'.zip');MakeArchive $bad @($name);$rejected=$false
 try{& (Join-Path $PSScriptRoot 'Expand-Update.ps1') -Archive $bad -Destination (Join-Path $testRoot ([Guid]::NewGuid().ToString())) -Version '0.18.0'}catch{$rejected=$true}
 if(!$rejected){throw 'Unsafe archive was accepted'}
}
Write-Output 'PASS: real ZIP extraction and rejection of parent traversal and absolute paths.'
