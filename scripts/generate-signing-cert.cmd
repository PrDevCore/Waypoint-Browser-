@echo off
setlocal

where openssl >nul 2>nul
if errorlevel 1 (
  echo OpenSSL is required but was not found on PATH.
  exit /b 1
)

if "%~1"=="" (
  set "CERT_NAME=Waypoint Development"
) else (
  set "CERT_NAME=%~1"
)

if "%CSC_KEY_PASSWORD%"=="" (
  echo Enter the PFX password:
  set /p "CSC_KEY_PASSWORD=Password: "
)

if "%CSC_KEY_PASSWORD%"=="" (
  echo A PFX password is required.
  exit /b 1
)

if not exist certificates mkdir certificates

openssl req -new -x509 -newkey rsa:4096 -sha256 -nodes ^
  -keyout certificates\waypoint-signing-key.pem ^
  -out certificates\waypoint-signing-cert.pem ^
  -days 365 ^
  -subj "/CN=%CERT_NAME%" ^
  -addext "basicConstraints=critical,CA:FALSE" ^
  -addext "keyUsage=critical,digitalSignature" ^
  -addext "extendedKeyUsage=codeSigning"
if errorlevel 1 exit /b 1

openssl pkcs12 -export ^
  -inkey certificates\waypoint-signing-key.pem ^
  -in certificates\waypoint-signing-cert.pem ^
  -out certificates\waypoint-signing.pfx ^
  -name "%CERT_NAME%" ^
  -passout env:CSC_KEY_PASSWORD
if errorlevel 1 exit /b 1

echo Created certificates\waypoint-signing.pfx
echo Set CSC_LINK to this file before packaging.
endlocal
