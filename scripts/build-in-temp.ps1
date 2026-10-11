$ErrorActionPreference='Stop'
$taskSource=Split-Path $PSScriptRoot -Parent
$taskTempBase=[System.IO.Path]::GetFullPath($env:TEMP)
$taskTempRoot=Join-Path $taskTempBase 'wh-01a110c7'
if(!$taskTempRoot.StartsWith($taskTempBase+'\')) {throw 'Temporary path is outside TEMP.'}
if($taskTempRoot -match '[^\x00-\x7F]') {throw 'Temporary build path must contain ASCII characters only.'}
$taskMarker=Join-Path $taskTempRoot '.work-hours-build-marker'
if(Test-Path -LiteralPath $taskTempRoot) {
 if(!(Test-Path -LiteralPath $taskMarker) -or [System.IO.File]::ReadAllText($taskMarker) -ne $taskSource) {throw 'Temporary build directory belongs to another task.'}
} else {New-Item -ItemType Directory -Path $taskTempRoot | Out-Null;[System.IO.File]::WriteAllText($taskMarker,$taskSource)}
Write-Output ('Temporary build directory: '+$taskTempRoot)
foreach($taskFile in @('App.tsx','app.json','package.json','package-lock.json','tsconfig.json','eas.json')) {
 Copy-Item -LiteralPath (Join-Path $taskSource $taskFile) -Destination $taskTempRoot -Force
}
foreach($taskDir in @('src','modules','assets','scripts','.signing','node_modules','.gradle-local','.tools/jdk','.tools/gradle','.tools/android-sdk')) {
 $taskFrom=Join-Path $taskSource $taskDir
 $taskTo=Join-Path $taskTempRoot $taskDir
 New-Item -ItemType Directory -Force -Path $taskTo | Out-Null
 & robocopy.exe $taskFrom $taskTo /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /MT:8 /NFL /NDL /NP /NJH /NJS /XD .temp .installer
 if($LASTEXITCODE -ge 8) {throw ('Temporary copy failed: '+$taskDir)}
 Write-Output ('Prepared: '+$taskDir)
}
Push-Location $taskTempRoot
try {
 & (Join-Path $taskTempRoot 'scripts/build-android.ps1') -AcceptSdkLicense -UseDownloadedTools
 $taskRelease=Join-Path $taskSource 'release'
 New-Item -ItemType Directory -Force -Path $taskRelease | Out-Null
 Copy-Item -LiteralPath (Join-Path $taskTempRoot 'release/daily-work-hours-1.5.0.apk') -Destination $taskRelease -Force
 & robocopy.exe (Join-Path $taskTempRoot '.gradle-local/caches') (Join-Path $taskSource '.gradle-local/caches') /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /MT:8 /NFL /NDL /NP /NJH /NJS /XF *.lock *.lck
 if($LASTEXITCODE -ge 8) {Write-Warning 'APK is ready; some optional build cache files could not be synchronized.'}
 Write-Output ('Installation file: '+(Join-Path $taskRelease 'daily-work-hours-1.5.0.apk'))
} finally {Pop-Location}
