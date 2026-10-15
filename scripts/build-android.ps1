param([switch]$AcceptSdkLicense,[switch]$UseDownloadedTools)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskJdk = Get-ChildItem (Join-Path $taskRoot '.tools/jdk') -Directory | Select-Object -First 1
if (!$taskJdk) { throw 'Prepare JDK17 in .tools/jdk first.' }
$env:JAVA_HOME = $taskJdk.FullName
$env:ANDROID_HOME = Join-Path $taskRoot '.tools/android-sdk'
$env:ANDROID_USER_HOME = Join-Path $taskRoot '.tools/android-user'
$env:GRADLE_USER_HOME = Join-Path $taskRoot '.gradle-local'
$env:JAVA_TOOL_OPTIONS = '-Dfile.encoding=UTF-8 -Djava.net.preferIPv4Stack=true -Dsun.net.client.defaultConnectTimeout=30000 -Dsun.net.client.defaultReadTimeout=30000'
$env:CI = '1'
$env:NODE_ENV = 'production'
$taskSdkManager = Join-Path $env:ANDROID_HOME 'cmdline-tools/latest/bin/sdkmanager.bat'
if (!$AcceptSdkLicense) { throw 'Accept https://developer.android.com/studio/terms before using -AcceptSdkLicense.' }
if (!$UseDownloadedTools) {
 1..20 | ForEach-Object { 'y' } | & $taskSdkManager "--sdk_root=$env:ANDROID_HOME" 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' 'ndk;27.1.12297006' 'cmake;3.22.1'
 if ($LASTEXITCODE -ne 0) { throw 'Android SDK installation failed.' }
}
Push-Location $taskRoot
try {
 & npx.cmd expo prebuild --platform android --no-install
 if ($LASTEXITCODE -ne 0) { throw 'Android prebuild failed.' }
 Add-Content -LiteralPath android/gradle.properties -Value "`nandroid.overridePathCheck=true"
 $taskSigning = Join-Path $taskRoot '.signing'
 New-Item -ItemType Directory -Force -Path $taskSigning | Out-Null
 $taskKeyStore = Join-Path $taskSigning 'daily-work-hours.keystore'
 $taskKeyProperties = Join-Path $taskSigning 'keystore.properties'
 if (!(Test-Path -LiteralPath $taskKeyStore)) {
  $taskKeyPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') -genkeypair -keystore $taskKeyStore -alias daily-work-hours -keyalg RSA -keysize 2048 -validity 36500 -storepass $taskKeyPassword -keypass $taskKeyPassword -dname 'CN=Daily Work Hours, O=Personal, C=CN' -noprompt
  if ($LASTEXITCODE -ne 0) { throw 'Signing key creation failed.' }
  [System.IO.File]::WriteAllText($taskKeyProperties,"storePassword=$taskKeyPassword`nkeyPassword=$taskKeyPassword`nkeyAlias=daily-work-hours`n")
 }
 $taskAppGradle = Join-Path $taskRoot 'android/app/build.gradle'
 $taskGradleText = [System.IO.File]::ReadAllText($taskAppGradle)
 $taskGradleText = $taskGradleText.Replace('android {',"def personalSigning = new Properties()`npersonalSigning.load(new FileInputStream(rootProject.file('../.signing/keystore.properties')))`nandroid {")
 $taskGradleText = $taskGradleText.Replace('signingConfigs {',"signingConfigs {`n        personalRelease {`n            storeFile rootProject.file('../.signing/daily-work-hours.keystore')`n            storePassword personalSigning['storePassword']`n            keyAlias personalSigning['keyAlias']`n            keyPassword personalSigning['keyPassword']`n        }")
 $taskGradleText = $taskGradleText.Replace('signingConfig signingConfigs.debug','signingConfig signingConfigs.personalRelease')
 $taskGradleText = $taskGradleText.Replace('defaultConfig {',"defaultConfig {`n        externalNativeBuild {`n            cmake { arguments '-DCMAKE_OBJECT_PATH_MAX=180' }`n        }")
 [System.IO.File]::WriteAllText($taskAppGradle,$taskGradleText)
 Push-Location android
 try {
  $taskGradleCommand = Join-Path $taskRoot '.tools/gradle/gradle-9.3.1/bin/gradle.bat'
  if (!(Test-Path -LiteralPath $taskGradleCommand)) { $taskGradleCommand = Join-Path $taskRoot 'android/gradlew.bat' }
  & $taskGradleCommand assembleRelease '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a' --no-daemon --max-workers=2
  if ($LASTEXITCODE -ne 0) { throw 'APK build failed.' }
 } finally { Pop-Location }
 New-Item -ItemType Directory -Force -Path release | Out-Null
 Copy-Item -LiteralPath android/app/build/outputs/apk/release/app-release.apk -Destination release/daily-work-hours-1.6.0.apk
 Write-Output 'APK: release/daily-work-hours-1.6.0.apk'
} finally { Pop-Location }
