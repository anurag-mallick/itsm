@echo off
:: =============================================================================
::  ITSM Platform - One-Step Windows Installer
::  Bluspring Enterprises
::
::  Usage: Double-click setup.bat  OR  run from PowerShell/CMD
::  Recommended: Run as Administrator for automatic dependency installation
:: =============================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

:: ── Colours (ANSI — works in Windows 10 1903+ and Windows Terminal) ────────
set "GREEN=[92m"
set "YELLOW=[93m"
set "RED=[91m"
set "CYAN=[96m"
set "BOLD=[1m"
set "NC=[0m"

echo.
echo %CYAN%%BOLD%
echo  ======================================================
echo   ITSM Platform ^| Bluspring Enterprises
echo   One-Step Windows Installer
echo  ======================================================
echo %NC%
echo.

:: ── Step 1: Check Python 3.11+ ────────────────────────────────────────────
echo %CYAN%[1/8] Checking Python...%NC%
python --version >nul 2>&1
if %errorlevel% neq 0 goto :install_python

for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PY_VER=%%v
for /f "tokens=1,2 delims=." %%a in ("!PY_VER!") do (
    set PY_MAJOR=%%a & set PY_MINOR=%%b
)
if !PY_MAJOR! LSS 3 goto :install_python
if !PY_MAJOR! EQU 3 if !PY_MINOR! LSS 11 goto :install_python
echo %GREEN%  [OK] Python !PY_VER! found%NC%
goto :check_node

:install_python
echo %YELLOW%  [!] Python 3.11+ not found. Installing via winget...%NC%
winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements --silent
if %errorlevel% neq 0 (
    echo %RED%  [X] winget failed. Download manually: https://python.org/downloads/%NC%
    pause & exit /b 1
)
echo %GREEN%  [OK] Python installed. Please restart this script.%NC%
pause & exit /b 0

:: ── Step 2: Check Node.js 18+ ──────────────────────────────────────────────
:check_node
echo %CYAN%[2/8] Checking Node.js...%NC%
node --version >nul 2>&1
if %errorlevel% neq 0 goto :install_node

for /f "tokens=1 delims=v" %%v in ('node --version 2^>^&1') do set NODE_VER=%%v
for /f "tokens=1 delims=." %%a in ('node --version') do (
    set /a NODE_MAJOR=%%a
    if "!NODE_MAJOR:~0,1!" == "v" set NODE_MAJOR=!NODE_MAJOR:~1!
)
echo %GREEN%  [OK] Node.js found%NC%
goto :check_git

:install_node
echo %YELLOW%  [!] Node.js not found. Installing via winget...%NC%
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements --silent
if %errorlevel% neq 0 (
    echo %RED%  [X] winget failed. Download manually: https://nodejs.org/%NC%
    pause & exit /b 1
)
echo %GREEN%  [OK] Node.js installed. Please restart this script.%NC%
pause & exit /b 0

:: ── Step 3: Check Git ──────────────────────────────────────────────────────
:check_git
echo %CYAN%[3/8] Checking Git...%NC%
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo %YELLOW%  [!] Git not found. Installing via winget...%NC%
    winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements --silent
    echo %GREEN%  [OK] Git installed.%NC%
) else (
    echo %GREEN%  [OK] Git found%NC%
)

:: ── Step 4: Set up .env ────────────────────────────────────────────────────
echo %CYAN%[4/8] Setting up environment configuration...%NC%
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo %GREEN%  [OK] .env created from .env.example%NC%
    ) else (
        echo %RED%  [X] .env.example not found!%NC%
        pause & exit /b 1
    )
    :: Auto-generate SECRET_KEY
    for /f %%i in ('python -c "import secrets; print(secrets.token_hex(32))"') do set SK=%%i
    powershell -Command "(Get-Content '.env') -replace 'change-this-to-a-long-random-string-at-least-50-chars', '!SK!' | Set-Content '.env'"
    :: Auto-generate DB_PASSWORD
    for /f %%i in ('python -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(20)))"') do set DP=%%i
    powershell -Command "(Get-Content '.env') -replace 'change-this-strong-password', '!DP!' | Set-Content '.env'"
    echo %GREEN%  [OK] SECRET_KEY and DB_PASSWORD auto-generated%NC%
    echo %YELLOW%  [!] Review .env before production deployment%NC%
) else (
    echo %GREEN%  [OK] .env already exists%NC%
)

:: ── Step 5: Backend virtual environment ────────────────────────────────────
echo %CYAN%[5/8] Setting up Python virtual environment...%NC%
if not exist "backend\venv" (
    python -m venv backend\venv
    echo %GREEN%  [OK] Virtual environment created%NC%
)
echo   Installing Python packages (this may take 2-3 minutes)...
backend\venv\Scripts\pip install --quiet -r backend\requirements-local.txt
if %errorlevel% neq 0 (
    echo %YELLOW%  [!] Some packages failed. Trying full requirements...%NC%
    backend\venv\Scripts\pip install --quiet -r backend\requirements.txt 2>nul
)
echo %GREEN%  [OK] Python packages installed%NC%

:: ── Step 6: Database migrations ────────────────────────────────────────────
echo %CYAN%[6/8] Running database migrations...%NC%
set DJANGO_SETTINGS_MODULE=config.settings.local
cd backend
..\backend\venv\Scripts\python manage.py migrate --noinput 2>&1 | findstr /i "applying ok error"
if %errorlevel% neq 0 (
    echo %RED%  [X] Migration failed. Check error above.%NC%
    cd ..
    pause & exit /b 1
)
echo %GREEN%  [OK] Migrations applied%NC%

:: ── Step 7: Seed data ──────────────────────────────────────────────────────
echo %CYAN%[7/8] Seeding roles, categories, and demo users...%NC%
..\backend\venv\Scripts\python manage.py setup_roles 2>&1 | findstr /i "Created Exists"
..\backend\venv\Scripts\python manage.py setup_config 2>&1 | findstr /i "Seeded"
..\backend\venv\Scripts\python manage.py create_initial_admin 2>&1
..\backend\venv\Scripts\python manage.py setup_demo_data 2>&1 | findstr /i "Created Exists"
cd ..
echo %GREEN%  [OK] Seed data applied%NC%

:: ── Step 8: Frontend packages ──────────────────────────────────────────────
echo %CYAN%[8/8] Installing frontend Node packages...%NC%
cd frontend
call npm install --silent 2>&1 | findstr /i "added vulnerabilities"
cd ..
echo %GREEN%  [OK] Frontend packages installed%NC%

:: ── Summary ────────────────────────────────────────────────────────────────
echo.
echo %GREEN%%BOLD%
echo  ======================================================
echo   Setup Complete!
echo  ======================================================
echo %NC%
echo.
echo  %BOLD%To start the application:%NC%
echo.
echo    Option 1 - Start everything at once:
echo      start_dev.bat
echo.
echo    Option 2 - Start manually:
echo      Terminal 1: cd backend ^& set DJANGO_SETTINGS_MODULE=config.settings.local ^& venv\Scripts\python manage.py runserver 8000
echo      Terminal 2: cd frontend ^& npm run dev
echo.
echo  %BOLD%Demo accounts:%NC%
echo    Admin    : admin@helpdesk.local         / Admin@ITSM2025!
echo    Manager  : itmanager@helpdesk.local     / Manager@ITSM2025!
echo    Agent    : agent1@helpdesk.local        / Agent@ITSM2025!
echo    User     : neha.gupta@company.local     / User@ITSM2025!
echo.
echo  %BOLD%URLs:%NC%
echo    Application  : http://localhost:3000
echo    API          : http://localhost:8000/api/
echo    API Docs     : http://localhost:8000/api/docs/
echo    Guest Portal : http://localhost:3000/portal
echo.
pause
