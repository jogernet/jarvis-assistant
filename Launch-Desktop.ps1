$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$locations=@(
 (Join-Path $PSScriptRoot 'node_modules\electron\dist\electron.exe'),
 (Join-Path $PSScriptRoot 'runtime\electron\electron.exe'),
 'C:\Users\User\Documents\Codex\2026-10-19\new-chat-2\jarvis-local\node_modules\electron\dist\electron.exe'
)
$electronPath=$locations | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
if (!$electronPath) { throw 'Electron is not installed. Run npm install in this folder, then try again.' }
New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'runtime') -Force | Out-Null
$desktopProcess=Start-Process -FilePath $electronPath -ArgumentList ('"'+$PSScriptRoot+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Normal -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'runtime\desktop.log') -RedirectStandardError (Join-Path $PSScriptRoot 'runtime\desktop-error.log')
$null=$desktopProcess.Handle
if ($desktopProcess.WaitForExit(1500)) {
    $desktopExitCode=$desktopProcess.ExitCode
    if ($null -ne $desktopExitCode -and [int]$desktopExitCode -ne 0) {
        throw ('JARVIS could not start. Exit code: '+$desktopExitCode+'. See runtime\desktop-error.log.')
    }
}
