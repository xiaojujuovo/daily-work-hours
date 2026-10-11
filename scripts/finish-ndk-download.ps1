$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskTarget=Join-Path $taskRoot '.tools/ndk.zip'
$taskTotal=781495902L
$taskStart=(Get-Item -LiteralPath $taskTarget).Length
$taskJobs=@()
$taskPartSize=[long][Math]::Ceiling(($taskTotal-$taskStart)/4.0)
for($taskIndex=0;$taskIndex -lt 4;$taskIndex++) {
 $taskFrom=$taskStart+$taskIndex*$taskPartSize
 $taskTo=[Math]::Min($taskTotal-1,$taskFrom+$taskPartSize-1)
 if($taskFrom -ge $taskTotal) {continue}
 $taskPart=Join-Path $taskRoot ".tools/ndk-part-$taskIndex.bin"
 $taskLog=Join-Path $taskRoot ".tools/ndk-part-$taskIndex.log"
 $taskProcess=Start-Process -FilePath 'curl.exe' -WindowStyle Hidden -PassThru -ArgumentList @('--fail','--silent','--show-error','--location','--retry','3','--connect-timeout','20','--speed-limit','1024','--speed-time','30','--range',"$taskFrom-$taskTo",'--output',"`"$taskPart`"",'https://dl.google.com/android/repository/android-ndk-r27b-windows.zip') -RedirectStandardError $taskLog
 $taskJobs+=@{Process=$taskProcess;Path=$taskPart;Size=$taskTo-$taskFrom+1}
}
Write-Output 'Downloading remaining NDK bytes in four verified ranges.'
foreach($taskJob in $taskJobs) {
 $taskJob.Process.WaitForExit()
 if($taskJob.Process.ExitCode -ne 0 -or (Get-Item -LiteralPath $taskJob.Path).Length -ne $taskJob.Size) {throw 'A ranged download failed; original partial file is preserved.'}
}
$taskOutput=[System.IO.File]::Open($taskTarget,[System.IO.FileMode]::Append)
try {foreach($taskJob in $taskJobs) {$taskInput=[System.IO.File]::OpenRead($taskJob.Path);try{$taskInput.CopyTo($taskOutput)}finally{$taskInput.Dispose()}}} finally {$taskOutput.Dispose()}
if((Get-FileHash -LiteralPath $taskTarget -Algorithm SHA1).Hash.ToLower() -ne '3bb7efc850cd0af7707854b7e0d5c3b6a7153703') {throw 'NDK checksum mismatch.'}
Write-Output 'NDK downloaded and checksum verified.'
