param(
  [int]$AppPort = 3000,
  [int]$WsPort = 3001
)

$ErrorActionPreference = "Stop"

Write-Host "Starting Next.js app on port $AppPort..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:PORT='$AppPort'; npx next dev"

Write-Host "Starting WebSocket server on port $WsPort..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:WS_PORT='$WsPort'; npm run dev:ws"

Write-Host "Both processes started in separate PowerShell windows."
Write-Host "App: http://localhost:$AppPort"
Write-Host "WS:  ws://localhost:$WsPort"
