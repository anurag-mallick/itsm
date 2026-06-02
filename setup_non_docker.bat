@echo off
rem ------------------------------------------------------------
rem ITSM Application Non‑Docker Setup Script (Windows)
rem ------------------------------------------------------------

rem ==== Prerequisites ====
rem - Python 3.12 (or compatible) installed and added to PATH
rem - Node.js (v18+) installed and added to PATH
rem - (Optional) PostgreSQL and Redis if you prefer to use them instead of SQLite

rem ---- Step 1: Create Python virtual environment ----
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
) else (
    echo Virtual environment already exists.
)

rem ---- Step 2: Activate virtual environment and install Python dependencies ----
call venv\Scripts\activate
if %errorlevel% neq 0 (
    echo Failed to activate virtual environment. Exiting.
    exit /b 1
)

echo Installing Python requirements...
pip install --upgrade pip
pip install -r backend\requirements.txt

rem ---- Step 3: Prepare environment variables ----
rem Copy .env.example to .env if .env does not exist
if not exist .env (
    copy .env.example .env
    echo .env file created. Please edit .env to suit your environment.
) else (
    echo .env already exists. Please review its contents.
)

rem ---- Step 4: Apply database migrations (uses SQLite by default) ----
python backend\manage.py migrate

rem ---- Step 5: Seed initial data (admin user, sample data) ----
python backend\setup_data.py

rem ---- Step 6: Start the backend server ----
start "backend" cmd /k "call venv\Scripts\activate && python backend\manage.py runserver 0.0.0.0:8000"

rem ---- Step 7: Install frontend dependencies ----
cd frontend
if not exist node_modules (
    echo Installing frontend npm packages...
    npm install
) else (
    echo npm packages already installed.
)

rem ---- Step 8: Start the Vite development server (frontend) ----
start "frontend" cmd /k "npm run dev"

echo Setup complete. Backend is running on http://localhost:8000 and frontend on http://localhost:5173
pause
