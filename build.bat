@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "ANDROID_PROJECT=%ROOT%android-sample"
set "DIST=%ROOT%dist"
set "APK=%ANDROID_PROJECT%\app\build\outputs\apk\debug\app-debug.apk"
set "OUT=%DIST%\zexl-debug.apk"
set "LOG=%DIST%\build.log"
set "GRADLE_VERSION=9.7.1"
set "GRADLE_SHA256=acd53f1edaf02f1a8ff99879f8a34b302661a057d9b063ae9e35b552f804d20a"
set "TOOLS=%ROOT%.tools"
set "GRADLE_HOME=%TOOLS%\gradle-%GRADLE_VERSION%"
set "GRADLE_ZIP=%TOOLS%\gradle-%GRADLE_VERSION%-bin.zip"
set "GRADLE_URL=https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip"

if not exist "%DIST%" mkdir "%DIST%"
> "%LOG%" echo ZEXL build log
>> "%LOG%" echo Started: %DATE% %TIME%
>> "%LOG%" echo.

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
if not exist "%ANDROID_HOME%" (
    echo [ERROR] Android SDK directory does not exist: %ANDROID_HOME%
    goto :fail
)

echo [OK] ANDROID_HOME=%ANDROID_HOME%

set "SDKMANAGER="
if exist "%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat" set "SDKMANAGER=%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat"
if not defined SDKMANAGER if exist "%ANDROID_HOME%\tools\bin\sdkmanager.bat" set "SDKMANAGER=%ANDROID_HOME%\tools\bin\sdkmanager.bat"
if not defined SDKMANAGER (
    for /f "delims=" %%S in ('dir /b /s "%ANDROID_HOME%\cmdline-tools\sdkmanager.bat" 2^>nul') do if not defined SDKMANAGER set "SDKMANAGER=%%S"
)
if not defined SDKMANAGER (
    for /f "delims=" %%S in ('where sdkmanager.bat 2^>nul') do if not defined SDKMANAGER set "SDKMANAGER=%%S"
)

set "NEED_SDK_INSTALL=0"
if not exist "%ANDROID_HOME%\platform-tools" set "NEED_SDK_INSTALL=1"
if not exist "%ANDROID_HOME%\platforms\android-37.0" set "NEED_SDK_INSTALL=1"
if not exist "%ANDROID_HOME%\build-tools\37.0.0" set "NEED_SDK_INSTALL=1"

if "%NEED_SDK_INSTALL%"=="1" (
    echo [INFO] Required Android SDK packages are missing.
    if not defined SDKMANAGER (
        echo [ERROR] Android SDK Command-Line Tools are not installed.
        echo.
        echo Open Android Studio ^> SDK Manager ^> SDK Tools.
        echo Enable "Android SDK Command-Line Tools ^(latest^)" and click Apply.
        echo Then run build.bat again. ZEXL will install the remaining SDK packages automatically.
        goto :fail
    )

    echo [INFO] sdkmanager=%SDKMANAGER%
    echo [INFO] Accepting Android SDK licenses...
    >> "%LOG%" echo [SDK] Accepting licenses with %SDKMANAGER%
    (for /L %%L in (1,1,100) do @echo y) | call "%SDKMANAGER%" --sdk_root="%ANDROID_HOME%" --licenses >> "%LOG%" 2>&1

    echo [INFO] Installing Android SDK Platform 37, Build Tools 37.0.0 and Platform Tools...
    >> "%LOG%" echo [SDK] Installing platform-tools platforms;android-37.0 build-tools;37.0.0
    call "%SDKMANAGER%" --sdk_root="%ANDROID_HOME%" "platform-tools" "platforms;android-37.0" "build-tools;37.0.0" >> "%LOG%" 2>&1
    if errorlevel 1 (
        echo [ERROR] Android SDK package installation failed.
        echo See: %LOG%
        goto :fail
    )
)

if not exist "%ANDROID_HOME%\platform-tools" (
    echo [ERROR] Android SDK Platform Tools are still missing after installation.
    goto :fail
)
if not exist "%ANDROID_HOME%\platforms\android-37.0" (
    echo [ERROR] Android SDK Platform 37 is still missing after installation.
    goto :fail
)
if not exist "%ANDROID_HOME%\build-tools\37.0.0" (
    echo [ERROR] Android SDK Build Tools 37.0.0 are still missing after installation.
    goto :fail
)
echo [OK] Android SDK Platform 37 + Build Tools 37.0.0

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
pushd "%ANDROID_PROJECT%"
echo.
echo [BUILD] Compiling ZEXL debug APK...
echo [INFO] Gradle output is also saved to: %LOG%
call "%GRADLE_HOME%\bin\gradle.bat" --no-daemon :app:assembleDebug >> "%LOG%" 2>&1
set "BUILD_EXIT=%ERRORLEVEL%"
echo.
echo ---------------- Gradle output ----------------
type "%LOG%"
echo ------------------------------------------------
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
set "EXIT_CODE=0"
goto :finish

:fail
echo.
echo Build stopped. Fix the error above and run build.bat again.
echo [LOG] %LOG%
set "EXIT_CODE=1"
goto :finish

:finish
echo.
if not "%ZEXL_NO_PAUSE%"=="1" (
    echo Press any key to close this window.
    pause >nul
)
exit /b %EXIT_CODE%
