@echo off
:: =============================================================================
::  ITSM Platform - Start Development Servers
::  Launches Django backend + Vite frontend in separate windows
:: =============================================================================
cd /d "%~dp0"

echo.
echo  Starting ITSM Platform...
echo.

:: Start Django backend in new window
start "ITSM Backend (Django :8000)" cmd /k "cd /d %~dp0backend && set DJANGO_SETTINGS_MODULE=config.settings.local && venv\Scripts\python manage.py runserver 8000"

:: Wait 3 seconds for backend to initialise
timeout /t 3 /nobreak >nul

:: Start Vite frontend in new window
start "ITSM Frontend (Vite :3000)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo  Both servers starting in separate windows.
echo.
echo  Application : http://localhost:3000
echo  API Docs    : http://localhost:8000/api/docs/
echo  Admin Panel : http://localhost:8000/admin/
echo.
echo  Press any key to exit this window (servers keep running).
pause >nul
