@echo off
title LocalPayroll PC-2 Automated Updater
echo =======================================================
echo     LocalPayroll PC-2 Automated Code Updater
echo =======================================================
echo.
echo Please ensure that LocalPayroll is CLOSED on this PC before proceeding.
echo.
pause

:: Resolve OneDrive directory
set "ONEDRIVE_PATH="
if exist "%USERPROFILE%\OneDrive" set "ONEDRIVE_PATH=%USERPROFILE%\OneDrive"
if exist "%USERPROFILE%\OneDrive - Personal" set "ONEDRIVE_PATH=%USERPROFILE%\OneDrive - Personal"
if exist "%USERPROFILE%\OneDrive - Business" set "ONEDRIVE_PATH=%USERPROFILE%\OneDrive - Business"

if "%ONEDRIVE_PATH%"=="" (
    echo ERROR: OneDrive folder not found under %USERPROFILE%.
    echo Please copy app.asar manually from your OneDrive folder.
    echo.
    pause
    exit /b 1
)

set "SRC_ASAR=%ONEDRIVE_PATH%\LocalPayroll\dist\win-unpacked\resources\app.asar"
set "DEST_DIR=D:\LocalPayroll\resources"
set "DEST_ASAR=%DEST_DIR%\app.asar"
set "BACKUP_ASAR=%DEST_DIR%\app.asar.bak"

if not exist "%SRC_ASAR%" (
    echo ERROR: Synced app.asar not found in OneDrive at:
    echo "%SRC_ASAR%"
    echo Please verify OneDrive is running and fully synced.
    echo.
    pause
    exit /b 1
)

if not exist "%DEST_DIR%" (
    echo ERROR: Target installation directory "%DEST_DIR%" does not exist on D: drive of this PC.
    echo Please ensure the app is installed at D:\LocalPayroll.
    echo.
    pause
    exit /b 1
)

echo.
echo Backing up existing app.asar...
if exist "%DEST_ASAR%" copy /y "%DEST_ASAR%" "%BACKUP_ASAR%" >nul

echo Copying updated app.asar from OneDrive...
copy /y "%SRC_ASAR%" "%DEST_ASAR%" >nul

if %errorlevel% equ 0 (
    echo.
    echo =======================================================
    echo    SUCCESS! LocalPayroll has been updated on this PC!
    echo =======================================================
    echo.
) else (
    echo ERROR: Failed to copy app.asar. Check if the app is still open.
)

pause
