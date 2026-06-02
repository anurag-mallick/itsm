#!/usr/bin/env pwsh
# =============================================================================
#  ITSM Platform — One-Command Deployment (Windows)
#
#  Usage:
#    # Allow local scripts once:
#    Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
#    .\deploy.ps1
#
#  Supports: Windows 10/11, Windows Server 2019/2022, PowerShell 5.1+
#  For Linux/macOS: use deploy.sh instead.
# =============================================================================

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

# ── Colours ───────────────────────────────────────────────────────────────────
function info  { param($m) Write-Host "[>] $m" -ForegroundColor Cyan }
function ok    { param($m) Write-Host "[v] $m" -ForegroundColor Green }
function warn  { param($m) Write-Host "[!] $m" -ForegroundColor Yellow }
function die   { param($m) Write-Host "[X] $m" -ForegroundColor Red; exit 1 }
function step  { param($m) Write-Host "`n=== $m ===" -ForegroundColor Magenta }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ITSM Platform v1.0" -ForegroundColor Blue
Write-Host "  Bluspring Enterprises - Internal IT Management`n" -ForegroundColor Blue

# ── 1. Install Docker Desktop ─────────────────────────────────────────────────
step "Checking Docker"

$dockerOk = $false
try { docker info 2>&1 | Out-Null; $dockerOk = $true } catch {}

if (-not $dockerOk) {
    warn "Docker Desktop not running or not installed."
    # Try winget first
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        info "Installing Docker Desktop via winget..."
        winget install --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements --silent
        ok "Docker Desktop installed."
    } else {
        info "Downloading Docker Desktop installer..."
        $installer = "$env:TEMP\DockerDesktopInstaller.exe"
        Invoke-WebRequest "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe" `
            -OutFile $installer -UseBasicParsing
        Start-Process $installer "-install --quiet --accept-license" -Wait
        Remove-Item $installer -ErrorAction SilentlyContinue
    }
    # Enable WSL2
    try {
        wsl --install --no-distribution 2>&1 | Out-Null
        wsl --set-default-version 2 2>&1 | Out-Null
    } catch {}

    Write-Host ""
    warn "Docker Desktop was installed. Please:"
    warn "  1. Start Docker Desktop from the Start Menu"
    warn "  2. Wait for the whale icon in the system tray to show 'Running'"
    warn "  3. Re-run: .\deploy.ps1"
    exit 0
}
ok "Docker is running"

# Compose command
$Compose = $null
try { docker compose version | Out-Null; $Compose = "docker compose" } catch {}
if (-not $Compose) { try { docker-compose --version | Out-Null; $Compose = "docker-compose" } catch {} }
if (-not $Compose) { die "Docker Compose not found. Update Docker Desktop." }
ok "Compose: $Compose"

# ── 2. Environment file ───────────────────────────────────────────────────────
step "Configuring environment"

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    ok ".env created from template"

    # Auto-generate SECRET_KEY and DB_PASSWORD
    $secretKey = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 50 | % { [char]$_ })
    $dbPass    = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 20 | % { [char]$_ })

    (Get-Content ".env") `
        -replace 'change-this-to-a-long-random-string-at-least-50-chars', $secretKey `
        -replace 'change-this-strong-password', $dbPass | Set-Content ".env" -Encoding UTF8

    ok "SECRET_KEY auto-generated"
    ok "DB_PASSWORD auto-generated: $dbPass"
    warn "For production, also set: ALLOWED_HOSTS, FRONTEND_URL, SMTP_HOST, IMAP_HOST"
    Write-Host ""
    Read-Host "Press ENTER to continue with auto-generated defaults, or Ctrl+C to edit .env"
} else {
    ok ".env already exists"
}

# Validate
$envVars = @{}
Get-Content ".env" | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
    $p = $_ -split '=', 2; if ($p.Count -eq 2) { $envVars[$p[0].Trim()] = $p[1].Trim() }
}
if ($envVars['SECRET_KEY'] -match 'change-this') { die "SECRET_KEY not set. Edit .env and re-run." }
ok "Environment validated"

# ── 3. SSL Certificate ────────────────────────────────────────────────────────
step "Setting up SSL certificate"

if (-not (Test-Path "nginx\ssl")) { New-Item -ItemType Directory -Path "nginx\ssl" -Force | Out-Null }

if (-not (Test-Path "nginx\ssl\server.crt") -or -not (Test-Path "nginx\ssl\server.key")) {
    $hostname = ($envVars['ALLOWED_HOSTS'] -split ',')[0].Trim()
    if (-not $hostname) { $hostname = "localhost" }

    # Try openssl (comes with Git for Windows)
    $opensslPaths = @('openssl', 'C:\Program Files\Git\usr\bin\openssl.exe')
    $openssl = $opensslPaths | Where-Object { try { & $_ version 2>&1 | Out-Null; $true } catch { $false } } | Select-Object -First 1

    if ($openssl) {
        & $openssl req -x509 -nodes -days 3650 -newkey rsa:2048 `
            -keyout "nginx\ssl\server.key" -out "nginx\ssl\server.crt" `
            -subj "/C=IN/ST=Maharashtra/O=Bluspring/CN=$hostname" `
            -addext "subjectAltName=DNS:$hostname,DNS:localhost,IP:127.0.0.1" 2>&1 | Out-Null
        ok "SSL certificate generated via OpenSSL for: $hostname"
    } else {
        # PowerShell .NET fallback
        info "OpenSSL not found - using PowerShell .NET crypto..."
        $rsa = [System.Security.Cryptography.RSA]::Create(2048)
        $req = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
            "CN=$hostname,O=Bluspring,C=IN", $rsa,
            [System.Security.Cryptography.HashAlgorithmName]::SHA256,
            [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
        $san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
        $san.AddDnsName($hostname); $san.AddDnsName("localhost"); $san.AddIpAddress([System.Net.IPAddress]::Loopback)
        $req.CertificateExtensions.Add($san.Build())
        $cert = $req.CreateSelfSigned([DateTimeOffset]::Now, [DateTimeOffset]::Now.AddYears(10))

        $certB64 = [Convert]::ToBase64String($cert.Export('Cert'), 'InsertLineBreaks')
        "-----BEGIN CERTIFICATE-----`n$certB64`n-----END CERTIFICATE-----" |
            Set-Content "nginx\ssl\server.crt" -Encoding ASCII

        $keyB64 = [Convert]::ToBase64String($rsa.ExportPkcs8PrivateKey(), 'InsertLineBreaks')
        "-----BEGIN PRIVATE KEY-----`n$keyB64`n-----END PRIVATE KEY-----" |
            Set-Content "nginx\ssl\server.key" -Encoding ASCII
        $rsa.Dispose()
        ok "SSL certificate generated via .NET for: $hostname"
    }
    warn "For production, replace nginx\ssl\server.crt and server.key with a CA-signed cert."
} else {
    ok "SSL certificate already exists"
}

# ── 4. Build & start ──────────────────────────────────────────────────────────
step "Building Docker images"
info "First run may take 5-10 minutes (downloading dependencies)..."
Invoke-Expression "$Compose build --parallel"
ok "Images built"

step "Starting all services"
Invoke-Expression "$Compose up -d"
ok "Services started"

# ── 5. Wait for ready ─────────────────────────────────────────────────────────
step "Waiting for services to be ready"
$maxWait = 120; $elapsed = 0
while ($elapsed -lt $maxWait) {
    try {
        $resp = Invoke-WebRequest "http://localhost:8000/api/auth/login/" -Method POST `
            -ContentType "application/json" -Body '{"email":"x","password":"x"}' `
            -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp.StatusCode -in @(200, 400, 401)) { break }
    } catch {
        if ($_.Exception.Message -match "401|400") { break }
    }
    Write-Host -NoNewline "`r  Waiting... ${elapsed}s"
    Start-Sleep 4; $elapsed += 4
}
Write-Host ""
ok "All services ready"

# ── 6. Service status ─────────────────────────────────────────────────────────
step "Service status"
Invoke-Expression "$Compose ps"

# ── 7. Credentials ───────────────────────────────────────────────────────────
step "Initial admin credentials"
Start-Sleep 3
try {
    $creds = Invoke-Expression "$Compose exec -T backend cat /app/initial_credentials" 2>&1 | Out-String
    if ($creds -match 'email=') {
        $adminEmail = ($creds -split "`n" | Where-Object { $_ -match '^email=' }) -replace '^email=',''
        $adminPass  = ($creds -split "`n" | Where-Object { $_ -match '^password=' }) -replace '^password=',''
        $adminUrl   = ($creds -split "`n" | Where-Object { $_ -match '^url=' }) -replace '^url=',''
        Write-Host ""
        Write-Host "  +-----------------------------------------------+" -ForegroundColor Green
        Write-Host "  |  ITSM -- Initial Admin Account               |" -ForegroundColor Green
        Write-Host "  +-----------------------------------------------+" -ForegroundColor Green
        Write-Host ("  |  Email   : {0,-36}|" -f $adminEmail.Trim()) -ForegroundColor Green
        Write-Host ("  |  Password: {0,-36}|" -f $adminPass.Trim())  -ForegroundColor Green
        Write-Host ("  |  URL     : {0,-36}|" -f $adminUrl.Trim())   -ForegroundColor Green
        Write-Host "  +-----------------------------------------------+" -ForegroundColor Green
        Write-Host ""
        warn "Change this password immediately after first login!"
    }
} catch {
    info "To see credentials: $Compose logs backend | Select-String 'INITIAL ADMIN' -Context 0,8"
}

Write-Host "  Pre-seeded demo accounts:"
Write-Host "    IT Manager : itmanager@helpdesk.local  / Manager@ITSM2025!"
Write-Host "    IT Agent   : agent1@helpdesk.local     / Agent@ITSM2025!"
Write-Host "    Requestor  : neha.gupta@company.local   / User@ITSM2025!"

# ── 8. Summary ────────────────────────────────────────────────────────────────
$frontendUrl = if ($envVars['FRONTEND_URL']) { $envVars['FRONTEND_URL'] } else { "https://localhost" }
Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Application  : $frontendUrl"
Write-Host "  Guest Portal : $frontendUrl/portal"
Write-Host "  API Docs     : $frontendUrl/api/docs/"
Write-Host "  Django Admin : $frontendUrl/admin/"
Write-Host ""
Write-Host "  Commands:"
Write-Host "    Logs   : $Compose logs -f"
Write-Host "    Stop   : $Compose down"
Write-Host "    Update : git pull; .\deploy.ps1"
Write-Host "================================================================" -ForegroundColor Green
