param([switch]$SkipNdk)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskSdk=Join-Path $taskRoot '.tools/android-sdk'
[xml]$taskRepo=[System.IO.File]::ReadAllText((Join-Path $taskRoot '.tools/repository.xml'))
$taskPackages=@(
 @{File='ndk.zip';Path='ndk;27.1.12297006';Url='android-ndk-r27b-windows.zip';Target='ndk/27.1.12297006'},
 @{File='build-tools.zip';Path='build-tools;36.0.0';Url='build-tools_r36_windows.zip';Target='build-tools/36.0.0'},
 @{File='platform.zip';Path='platforms;android-36';Url='platform-36_r02.zip';Target='platforms/android-36'},
 @{File='cmake.zip';Path='cmake;3.22.1';Url='cmake-3.22.1-windows.zip';Target='cmake/3.22.1'},
 @{File='platform-tools.zip';Path='platform-tools';Url='platform-tools_r37.0.1-win.zip';Target='platform-tools'}
)
foreach($taskPackage in $taskPackages) {
 if($SkipNdk -and $taskPackage.Path.StartsWith('ndk;')) {continue}
 $taskRemote=$taskRepo.SelectNodes('//*[local-name()="remotePackage"]') | Where-Object {$_.path -eq $taskPackage.Path -and $_.OuterXml.Contains($taskPackage.Url)} | Select-Object -First 1
 $taskArchive=$taskRemote.SelectNodes('.//*[local-name()="complete"]') | Where-Object {$_.url -eq $taskPackage.Url} | Select-Object -First 1
 $taskZip=Join-Path $taskRoot ('.tools/'+$taskPackage.File)
 if((Get-Item -LiteralPath $taskZip).Length -ne [long]$taskArchive.size) {throw ('Incomplete download: '+$taskPackage.File)}
 if((Get-FileHash -LiteralPath $taskZip -Algorithm SHA1).Hash.ToLower() -ne $taskArchive.checksum) {throw ('Checksum mismatch: '+$taskPackage.File)}
 $taskExtract=Join-Path $taskRoot ('.tools/extract-'+$taskPackage.File)
 $taskDestination=Join-Path $taskSdk $taskPackage.Target
 if(!(Test-Path -LiteralPath (Join-Path $taskDestination 'source.properties'))) {
  New-Item -ItemType Directory -Force -Path $taskExtract,$taskDestination | Out-Null
  Expand-Archive -LiteralPath $taskZip -DestinationPath $taskExtract -Force
  $taskSource=Get-ChildItem -LiteralPath $taskExtract -Directory | Select-Object -First 1
  if(!$taskSource.FullName.StartsWith($taskRoot+'\') -or !$taskDestination.StartsWith($taskRoot+'\')) {throw 'Tool path is outside the project.'}
  Get-ChildItem -LiteralPath $taskSource.FullName -Force | ForEach-Object { Move-Item -LiteralPath $_.FullName -Destination $taskDestination -Force }
 }
 # Generate local SDK metadata from Google's matching official package definition.
 $taskDoc=New-Object System.Xml.XmlDocument
 $taskRootElement=$taskDoc.CreateElement('repository','http://schemas.android.com/repository/android/common/01')
 foreach($taskAttr in $taskRepo.DocumentElement.Attributes) {if($taskAttr.Name.StartsWith('xmlns')) {$taskRootElement.SetAttribute($taskAttr.Name,$taskAttr.Value)}}
 [void]$taskDoc.AppendChild($taskRootElement)
 $taskLicense=$taskRepo.SelectNodes('//*[local-name()="license"]') | Where-Object {$_.id -eq 'android-sdk-license'} | Select-Object -First 1
 if($taskLicense) {[void]$taskRootElement.AppendChild($taskDoc.ImportNode($taskLicense,$true))}
 $taskLocal=$taskDoc.CreateElement('localPackage');$taskLocal.SetAttribute('path',$taskPackage.Path);$taskLocal.SetAttribute('obsolete','false')
 foreach($taskChild in $taskRemote.ChildNodes) {if($taskChild.LocalName -in @('type-details','revision','display-name','uses-license')) {[void]$taskLocal.AppendChild($taskDoc.ImportNode($taskChild,$true))}}
 [void]$taskRootElement.AppendChild($taskLocal)
 $taskDoc.Save((Join-Path $taskDestination 'package.xml'))
 Write-Output ('Verified and installed: '+$taskPackage.Path)
}
$taskGradleZip=Join-Path $taskRoot '.tools/gradle.zip'
$taskGradleHash=[System.IO.File]::ReadAllText((Join-Path $taskRoot '.tools/gradle.sha256')).Trim()
if((Get-FileHash -LiteralPath $taskGradleZip -Algorithm SHA256).Hash.ToLower() -ne $taskGradleHash) {throw 'Gradle checksum mismatch'}
if(!(Test-Path -LiteralPath (Join-Path $taskRoot '.tools/gradle/gradle-9.3.1/bin/gradle.bat'))) {Expand-Archive -LiteralPath $taskGradleZip -DestinationPath (Join-Path $taskRoot '.tools/gradle') -Force}
Write-Output 'Verified and installed: Gradle 9.3.1'
