@echo off
REM Run all Docker multi-account tests

echo 🧪 Running Docker Multi-Account Tests
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set TOTAL_TESTS=0
set PASSED_TESTS=0
set FAILED_TESTS=0

echo.
echo 1️⃣ Running Orchestrator Tests...
echo ─────────────────────────────────
cd orchestrator
call npm run test:run
if %errorlevel% equ 0 (
    echo ✓ Orchestrator tests passed
    set /a PASSED_TESTS+=1
) else (
    echo ✗ Orchestrator tests failed
    set /a FAILED_TESTS+=1
)
cd ..
set /a TOTAL_TESTS+=1

echo.
echo 2️⃣ Running Worker Tests...
echo ─────────────────────────────────
cd claude-worker
call npm run test:run
if %errorlevel% equ 0 (
    echo ✓ Worker tests passed
    set /a PASSED_TESTS+=1
) else (
    echo ✗ Worker tests failed
    set /a FAILED_TESTS+=1
)
cd ..
set /a TOTAL_TESTS+=1

echo.
echo 3️⃣ Running Integration Tests...
echo ─────────────────────────────────
if exist ..\node_modules\.bin\vitest (
    ..\node_modules\.bin\vitest run integration.test.js
    if %errorlevel% equ 0 (
        echo ✓ Integration tests passed
        set /a PASSED_TESTS+=1
    ) else (
        echo ✗ Integration tests failed
        set /a FAILED_TESTS+=1
    )
    set /a TOTAL_TESTS+=1
) else (
    echo ⚠️  Vitest not found in parent directory, skipping integration tests
)

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 📊 Test Results Summary
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Total Test Suites: %TOTAL_TESTS%
echo Passed: %PASSED_TESTS%
echo Failed: %FAILED_TESTS%

if %FAILED_TESTS% equ 0 (
    echo.
    echo ✅ All tests passed successfully!
    exit /b 0
) else (
    echo.
    echo ❌ Some tests failed. Please review the errors above.
    exit /b 1
)