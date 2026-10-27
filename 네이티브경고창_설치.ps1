$ErrorActionPreference = "Stop"

$extensionId = "jepclmecfaamkahjphldfbigcjmjdbbd"
$legacyExtensionId = "epheohlpmojoaaifihkfgnhlgiehlnie"
$hostName = "com.sgang.lecture_alarm"
$hostVersion = "2.2.0"
$sourcePath = Join-Path $PSScriptRoot "native_host\Program.cs"
$installDirectory = Join-Path $env:LOCALAPPDATA "SgangLectureAlarm"
$hostExePath = Join-Path $installDirectory "SgangLectureAlarmHost-$hostVersion.exe"
$nativeManifestPath = Join-Path $installDirectory "$hostName.json"
$compilerPath = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$nativeHostKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
$oldRunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "네이티브 경고창 소스 파일을 찾을 수 없습니다: $sourcePath"
}
if (-not (Test-Path -LiteralPath $compilerPath)) {
  $compilerPath = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path -LiteralPath $compilerPath)) {
  throw "Windows C# 컴파일러를 찾을 수 없습니다."
}

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null

if (Test-Path -LiteralPath $hostExePath) {
  Remove-Item -LiteralPath $hostExePath -Force
}

& $compilerPath `
  /nologo `
  /target:winexe `
  "/out:$hostExePath" `
  /reference:System.Web.Extensions.dll `
  $sourcePath

if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $hostExePath)) {
  throw "Windows 경고창 프로그램 컴파일에 실패했습니다."
}

$nativeManifest = [ordered]@{
  name = $hostName
  description = "싸강 완료 Windows 경고창"
  path = $hostExePath
  type = "stdio"
  allowed_origins = @(
    "chrome-extension://$extensionId/"
    "chrome-extension://$legacyExtensionId/"
  )
} | ConvertTo-Json -Depth 4

[System.IO.File]::WriteAllText(
  $nativeManifestPath,
  $nativeManifest,
  (New-Object System.Text.UTF8Encoding($false))
)

New-Item -Path $nativeHostKey -Force | Out-Null
Set-Item -Path $nativeHostKey -Value $nativeManifestPath

if (Get-ItemProperty -Path $oldRunKey -Name "SgangLectureAlarm" -ErrorAction SilentlyContinue) {
  Remove-ItemProperty -Path $oldRunKey -Name "SgangLectureAlarm"
}

Write-Output "Windows 네이티브 경고창 설치 완료"
Write-Output "확장 프로그램 ID: $extensionId"
