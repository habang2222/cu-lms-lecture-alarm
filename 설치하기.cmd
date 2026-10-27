@echo off
chcp 65001 >nul
title 싸강 완료 알림 설치

set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"

start "" explorer.exe "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0네이티브경고창_설치.ps1"
if errorlevel 1 (
  echo Windows 알림 도우미 설치에 실패했습니다.
) else (
  echo Windows 알림 도우미 설치 완료
)

if exist "%CHROME_EXE%" (
  start "" "%CHROME_EXE%" "chrome://extensions/"
) else (
  echo Google Chrome을 찾지 못했습니다.
  echo Chrome 주소창에 chrome://extensions/ 를 직접 입력해 주세요.
)

echo.
echo 1. 오른쪽 위의 "개발자 모드"를 켜세요.
echo 2. "압축해제된 확장 프로그램을 로드합니다"를 누르세요.
echo 3. 방금 열린 "싸강_완료_알림" 폴더를 선택하세요.
echo 4. 현재 싸강 탭을 새로고침(F5)하세요.
echo.
echo 자세한 내용은 사용법.txt에 있습니다.
pause
