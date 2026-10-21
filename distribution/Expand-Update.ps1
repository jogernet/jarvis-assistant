param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination,[Parameter(Mandatory=$true)][string]$Version)
$ErrorActionPreference='Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') {throw 'Invalid version'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$destinationRoot=[IO.Path]::GetFullPath($Destination).TrimEnd('\')+'\'
$prefix='versions/'+$Version+'/'
$zip=[IO.Compression.ZipFile]::OpenRead($Archive)
try {
 $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
 $entries=@();[long]$total=0
 foreach ($entry in $zip.Entries) {
  $name=$entry.FullName.Replace('\','/')
  if (!$name.StartsWith($prefix,[StringComparison]::Ordinal)) {continue}
  $relative=$name.Substring($prefix.Length)
  if (!$relative) {continue}
  if ($relative.StartsWith('/') -or $relative.Contains(':') -or $relative.Split('/') -contains '..' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) {throw 'Unsafe archive entry'}
  $target=[IO.Path]::GetFullPath((Join-Path $destinationRoot $relative))
  if (!$target.StartsWith($destinationRoot,[StringComparison]::OrdinalIgnoreCase) -or !$seen.Add($target)) {throw 'Unsafe or duplicate archive path'}
  $total+=$entry.Length;if($total -gt 4000000000){throw 'Archive too large'}
  $entries+=@{Entry=$entry;Target=$target;Directory=$name.EndsWith('/')}
 }
 if (!$entries.Count) {throw 'No matching application version in archive'}
 foreach ($item in $entries) {
  if ($item.Directory) {[IO.Directory]::CreateDirectory($item.Target)|Out-Null;continue}
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($item.Target))|Out-Null
  [IO.Compression.ZipFileExtensions]::ExtractToFile($item.Entry,$item.Target,$false)
 }
} finally {$zip.Dispose()}
