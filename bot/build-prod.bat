@echo off
REM Production build script for Heimdall (Windows)

echo 🔨 Building Heimdall for production...
echo.

REM Check if .env exists
if not exist ".env" (
    echo ⚠️  Warning: .env file not found!
    echo    Create .env with your production configuration before starting.
    echo.
)

REM Step 1: Build TypeScript
echo 📦 Step 1/3: Compiling TypeScript...
call npm run build
if errorlevel 1 goto :error

REM Step 2: Build Next.js Dashboard
echo 📦 Step 2/3: Building Next.js dashboard...
call npm run build:dashboard
if errorlevel 1 goto :error

REM Step 3: Report success
echo 📦 Step 3/3: Build complete!
echo.
echo ✅ Production build successful!
echo.
echo To start the application:
echo   npm run start:prod
echo.
echo Or with pm2 (install first: npm install -g pm2):
echo   pm2 start npm --name heimdall -- run start:prod
echo   pm2 save
echo.
goto :end

:error
echo.
echo ❌ Build failed! Check the error messages above.
echo.
exit /b 1

:end
