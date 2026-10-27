@echo off
chcp 65001 >nul
title 싸강 완료 알림 제거

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0네이티브경고창_제거.ps1"
if errorlevel 1 (
  echo Windows 경고창 도우미 제거에 실패했습니다.
) else (
  echo Windows 경고창 도우미를 제거했습니다.
  echo Chrome 확장 프로그램 페이지에서 "싸강 완료 알림"도 삭제해 주세요.
)
pause
