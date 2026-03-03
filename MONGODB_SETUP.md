# MongoDB Setup & Troubleshooting Guide

## Problem Fixed ✅

**Weekly Database Errors:** MongoDB was not persisting between sessions because:
- The executable (`mongod.exe`) was missing from Program Files
- The process would crash without auto-recovery
- No health monitoring to alert when it went down

## Solution Implemented

### 1. **Automatic MongoDB Management** 
   - Enhanced startup script with auto-recovery
   - Background process monitor restarts MongoDB if it crashes
   - Health check endpoint (`/api/health`) verifies connectivity

### 2. **User-Friendly Alerts**
   - Frontend shows warning toast if database disconnects
   - Alerts appear in bottom-right corner with troubleshooting tips
   - Checks every 30 seconds automatically

### 3. **Smart Startup Process**
   - Automatic cleanup of stale lock files
   - Retry logic if MongoDB takes time to start
   - Clear status messages in console

---

## How to Start Development

### Option 1: Easy Start (Recommended)
Double-click one of these files in your project root:
- **Windows:** `start-dev.bat` 
- **PowerShell:** `start-dev.ps1`

This automatically:
- ✅ Starts MongoDB (if not running)
- ✅ Monitors MongoDB for crashes
- ✅ Launches frontend + backend
- ✅ Restarts the browser on file changes

### Option 2: Manual Start
```bash
npm run dev
```
MongoDB must be running already (see below)

### Option 3: Separate Terminals
**Terminal 1 - MongoDB:**
```bash
$mongod = "C:\Users\user\mongodb-portable\MongoDB\Server\8.2\bin\mongod.exe"
$dataDir = "$env:USERPROFILE\mongodb-data\db"
$logFile = "$env:USERPROFILE\mongodb-data\log\mongod.log"
& $mongod --dbpath "$dataDir" --logpath "$logFile" --port 27017
```

**Terminal 2 - Dev Server:**
```bash
npm run dev
```

---

## Verify Everything is Working

### Check MongoDB is Running
```bash
netstat -ano | findstr ":27017"
# Should show: TCP 127.0.0.1:27017 0.0.0.0:0 LISTENING
```

### Check Backend Health
```bash
curl http://localhost:5001/api/health
# Response: {"status":"ok","mongodb":"connected",...}
```

### Check Authentication
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@edu.com","password":"admin123"}'
# Should return: {"token":"...","user":{...}}
```

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@edu.com` | `admin123` |
| **Teacher** | `shweta.kaushik@college.edu` | `teacher123` |
| **Student** | `devesh@college.edu` | `student123` |

---

## Troubleshooting

### ❌ "Port 27017 already in use"
```bash
# Find and kill existing MongoDB process
Get-Process mongod | Stop-Process -Force
# Then restart
```

### ❌ "Permission denied" on MongoDB startup
- Close VS Code
- Restart your computer (hard reset may have corrupted permissions)
- or move data directory to another location:
  ```bash
  Copy-Item "$env:USERPROFILE\mongodb-data" "$env:USERPROFILE\mongodb-data-backup"
  ```

### ❌ "Cannot connect to MongoDB"
Check MongoDB is listening:
```bash
netstat -ano | findstr ":27017"
```
If no output, MongoDB crashed. Check log:
```bash
Get-Content "$env:USERPROFILE\mongodb-data\log\mongod.log" -Tail 20
```

### ❌ Database errors after system update
Data might be corrupted. Backup and reset:
```bash
# Backup current data
Copy-Item "$env:USERPROFILE\mongodb-data\db" "$env:USERPROFILE\mongodb-data-backup-$(Get-Date -Format yyyyMMdd)"

# Delete and recreate database (data will be re-seeded)
Remove-Item "$env:USERPROFILE\mongodb-data\db" -Recurse -Force
```

### ❌ Authentication fails
1. Verify MongoDB is running (see above)
2. Check `/api/health` endpoint returns `"status":"ok"`
3. Try admin login with correct credentials
4. If credentials lost, reseed database:
   ```bash
   npm --prefix backend run db:seed
   ```

---

## How Auto-Recovery Works

The startup script launches a **MongoDB Guard process** in the background:
- Checks MongoDB every 5 seconds
- If it stops responding, automatically restarts it
- Cleans up stale lock files
- Logs restart attempts to mongod.log
- Runs independently of the dev server

You'll see this in the terminal when starting:
```
🛡️  Starting MongoDB auto-recovery monitor...
✅ MongoDB will auto-restart if it crashes
```

---

## Performance & Optimization

### Reduce Startup Time
Add to `.env`:
```
SEED_ON_STARTUP=false
NODE_ENV=development
```

### Monitor MongoDB Performance
```bash
# Watch MongoDB log for warnings
Get-Content "$env:USERPROFILE\mongodb-data\log\mongod.log" -Wait -Tail 50
```

### Check Database Size
```bash
Get-ChildItem "$env:USERPROFILE\mongodb-data\db" -Recurse | Measure-Object -Sum Length | Select-Object @{Name="SizeMB";Expression={[math]::Round($_.Sum / 1MB, 2)}}
```

---

## Production Deployment

For production, use MongoDB Atlas or managed MongoDB service instead:

1. Create MongoDB Atlas account at https://www.mongodb.com/cloud/atlas
2. Update `.env`:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname
   NODE_ENV=production
   ```
3. Deploy backend (Vercel, Railway, etc.)

---

## Key Files

- **`start-dev.ps1`** - Main startup script with auto-recovery
- **`start-dev.bat`** - Windows batch wrapper
- **`backend/routes.ts`** - Added `/api/health` endpoint
- **`frontend/src/hooks/useMongoDBHealth.ts`** - Health check hook
- **`frontend/src/components/DatabaseStatusAlert.tsx`** - Alert UI
- **`.env`** - MongoDB connection config

---

## Still Having Issues?

1. Clear browser cache (Ctrl+Shift+Del)
2. Restart VS Code
3. Reboot your computer
4. Delete `node_modules` and `package-lock.json`, run `npm install`
5. Delete MongoDB data and reseed: `npm --prefix backend run db:seed`

If problems persist, check the MongoDB log file for detailed error messages.
