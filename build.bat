@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "ANDROID_PROJECT=%ROOT%android-sample"
set "DIST=%ROOT%dist"
set "APK=%ANDROID_PROJECT%\app\build\outputs\apk\debug\app-debug.apk"
set "OUT=%DIST%\zexl-debug.apk"
set "GRADLE_VERSION=9.7.1"
set "GRADLE_SHA256=acd53f1edaf02f1a8ff99879f8a34b302661a057d9b063ae9e35b552f804d20a"
set "TOOLS=%ROOT%.tools"
set "GRADLE_HOME=%TOOLS%\gradle-%GRADLE_VERSION%"
set "GRADLE_ZIP=%TOOLS%\gradle-%GRADLE_VERSION%-bin.zip"
set "GRADLE_URL=https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip"

echo ============================================================
echo                    ZEXL ANDROID BUILD
echo                       signed by void
echo ============================================================
echo.

rem ---- Java ---------------------------------------------------
where java >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Java was not found.
    echo Install JDK 21 ^(JDK 17 or newer is supported^) and set JAVA_HOME.
    goto :fail
)

for /f "tokens=3" %%V in ('java -version 2^>^&1 ^| findstr /i "version"') do set "JAVA_RAW=%%~V"
for /f %%M in ('powershell -NoProfile -Command "$v='%JAVA_RAW%'; if($v -match '^(\d+)'){[int]$matches[1]}else{0}"') do set "JAVA_MAJOR=%%M"
if not defined JAVA_MAJOR set "JAVA_MAJOR=0"
if %JAVA_MAJOR% LSS 17 (
    echo [ERROR] Java %JAVA_RAW% is too old. JDK 17+ is required; JDK 21 is recommended.
    goto :fail
)
echo [OK] Java %JAVA_RAW%

rem ---- Android SDK --------------------------------------------
if not defined ANDROID_HOME if defined ANDROID_SDK_ROOT set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined ANDROID_HOME (
    echo [ERROR] Android SDK was not found.
    echo Set ANDROID_HOME or ANDROID_SDK_ROOT, or install Android Studio.
    goto :fail
)
if not exist "%ANDROID_HOME%\platform-tools" (
    echo [ERROR] ANDROID_HOME does not look like an Android SDK: %ANDROID_HOME%
    goto :fail
)
if not exist "%ANDROID_HOME%\platforms\android-37" (
    echo [ERROR] Android SDK Platform 37 is missing.
    echo Install "Android SDK Platform 37" in Android Studio ^> SDK Manager.
    goto :fail
)
echo [OK] ANDROID_HOME=%ANDROID_HOME%

rem ---- Gradle 9.7.1 -------------------------------------------
if not exist "%GRADLE_HOME%\bin\gradle.bat" (
    echo [INFO] Preparing Gradle %GRADLE_VERSION%...
    if not exist "%TOOLS%" mkdir "%TOOLS%"

    if not exist "%GRADLE_ZIP%" (
        echo [INFO] Downloading %GRADLE_URL%
        powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%GRADLE_URL%' -OutFile '%GRADLE_ZIP%'"
        if errorlevel 1 (
            echo [ERROR] Gradle download failed.
            goto :fail
        )
    )

    for /f %%H in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 '%GRADLE_ZIP%').Hash.ToLowerInvariant()"') do set "GRADLE_ACTUAL_SHA=%%H"
    if /I not "!GRADLE_ACTUAL_SHA!"=="%GRADLE_SHA256%" (
        echo [ERROR] Gradle archive checksum mismatch.
        echo Expected: %GRADLE_SHA256%
        echo Actual:   !GRADLE_ACTUAL_SHA!
        del /q "%GRADLE_ZIP%" >nul 2>&1
        goto :fail
    )
    echo [OK] Gradle SHA-256 verified.

    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%GRADLE_ZIP%' -DestinationPath '%TOOLS%' -Force"
    if errorlevel 1 (
        echo [ERROR] Could not extract Gradle.
        goto :fail
    )
)

echo [OK] Gradle %GRADLE_VERSION%

rem ---- Build ---------------------------------------------------
if not exist "%DIST%" mkdir "%DIST%"
pushd "%ANDROID_PROJECT%"
echo.
echo [BUILD] Compiling ZEXL debug APK...
call "%GRADLE_HOME%\bin\gradle.bat" --no-daemon :app:assembleDebug
set "BUILD_EXIT=%ERRORLEVEL%"
popd

if not "%BUILD_EXIT%"=="0" (
    echo.
    echo [ERROR] ZEXL Android build failed.
    goto :fail
)

if not exist "%APK%" (
    echo [ERROR] Gradle finished but APK was not found:
    echo         %APK%
    goto :fail
)

copy /Y "%APK%" "%OUT%" >nul
if errorlevel 1 (
    echo [ERROR] Could not copy APK to dist folder.
    goto :fail
)

echo.
echo ============================================================
echo [OK] ZEXL Android build complete.
echo [APK] %OUT%
echo ============================================================
exit /b 0

:fail
echo.
echo Build stopped. Fix the error above and run build.bat again.
exit /b 1
