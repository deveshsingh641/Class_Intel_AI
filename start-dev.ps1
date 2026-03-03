# ClassIntel AI - Development Startup Script (v2.0)
# Starts MongoDB and then launches the dev server

$MONGOD          = "C:\Users\user\mongodb-portable\MongoDB\Server\8.2\bin\mongod.exe"
$DATA_DIR        = "$env:USERPROFILE\mongodb-data\db"
$LOG_FILE        = "$env:USERPROFILE\mongodb-data\log\mongod.log"
$LOCK_FILE       = "$env:USERPROFILE\mongodb-data\mongod.lock"

# Ensure directories exist
New-Item -ItemType Directory -Force -Path $DATA_DIR  | Out-Null
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\mongodb-data\log" | Out-Null

# Check if MongoDB is already listening on port 27017
function Is-MongoDRunning {
    param()
    $result = netstat -ano 2>$null | Select-String "127.0.0.1:27017\s+.*LISTENING"
    return $null -ne $result
}

# Write status header
Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  ClassIntel AI - Development Startup" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "MongoDB Status Check..." -ForegroundColor Yellow

if (Is-MongoDRunning) {
    Write-Host "[OK] MongoDB is already running on port 27017" -ForegroundColor Green
} else {
    Write-Host "[*] Starting MongoDB..." -ForegroundColor Cyan
    
    # Remove stale lock file
    if (Test-Path $LOCK_FILE) {
        Remove-Item $LOCK_FILE -Force -ErrorAction SilentlyContinue
    }
    
    # Start MongoDB process
    $mongoProc = Start-Process -FilePath $MONGOD `
        -ArgumentList "--dbpath `"$DATA_DIR`" --logpath `"$LOG_FILE`" --port 27017 --bind_ip 127.0.0.1" `
        -WindowStyle Hidden `
        -PassThru
    
    # Wait up to 20 seconds for MongoDB to start
    $started = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        if (Is-MongoDRunning) {
            $started = $true
            break
        }
    }
    
    if ($started) {
        Write-Host "[OK] MongoDB started successfully (PID: $($mongoProc.Id))" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] MongoDB failed to start within 20 seconds" -ForegroundColor Red
        Write-Host "Check logs: $LOG_FILE" -ForegroundColor Yellow
        Write-Host ""
        exit 1
    }
}

Write-Host ""
Write-Host "[*] Starting dev server (Frontend + Backend)..." -ForegroundColor Cyan
Write-Host "    Frontend: http://localhost:5173" -ForegroundColor Gray
Write-Host "    Backend:  http://localhost:5001" -ForegroundColor Gray
Write-Host ""
Write-Host "TIP: If MongoDB crashes, run this script again to restart it" -ForegroundColor Yellow
Write-Host ""

# Start the dev server
Set-Location $PSScriptRoot
npm run dev
