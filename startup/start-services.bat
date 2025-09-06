@echo off
chcp 65001 >nul
echo Starting Claude API Services...

echo Starting backend server...
cd /d "C:\Users\jiang\claude API\backend"
start "Claude API Backend" cmd /c "node server-smart-claude.js"

timeout /t 3 /nobreak >nul

echo Starting frontend dev server...
cd /d "C:\Users\jiang\claude API"
start "Claude API Frontend" cmd /c "yarn dev"

echo Services starting...
echo Backend: http://localhost:3006
echo Frontend: http://localhost:3030
timeout /t 2 /nobreak >nul