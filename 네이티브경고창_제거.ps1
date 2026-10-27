$ErrorActionPreference = "Stop"

$hostName = "com.sgang.lecture_alarm"
$installDirectory = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "SgangLectureAlarm"))
$expectedParent = [System.IO.Path]::GetFullPath($env:LOCALAPPDATA)
$nativeHostKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"

if (-not $installDirectory.StartsWith($expectedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "제거 경로가 올바르지 않습니다: $installDirectory"
}

if (Test-Path -LiteralPath $nativeHostKey) {
  Remove-Item -LiteralPath $nativeHostKey -Recurse -Force
}

$runningHosts = Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and
  [System.IO.Path]::GetFullPath($_.ExecutablePath).StartsWith($installDirectory, [System.StringComparison]::OrdinalIgnoreCase)
}
foreach ($process in $runningHosts) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $installDirectory) {
  Remove-Item -LiteralPath $installDirectory -Recurse -Force
}

Write-Output "Windows 네이티브 경고창 제거 완료"
