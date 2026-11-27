# Verify Android Signing Setup
# This script checks if all components are properly configured

Write-Host "🔍 Verifying Android Signing Setup" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Check 1: Java/keytool
Write-Host "✓ Checking Java/keytool..." -ForegroundColor Yellow
if (Get-Command keytool -ErrorAction SilentlyContinue) {
	Write-Host "  ✅ keytool found" -ForegroundColor Green
} else {
	Write-Host "  ❌ keytool not found - Install Java JDK" -ForegroundColor Red
	$allGood = $false
}

# Check 2: Keystore file
Write-Host "✓ Checking keystore file..." -ForegroundColor Yellow
if (Test-Path "android/app/waypoint.keystore") {
	Write-Host "  ✅ Keystore exists: android/app/waypoint.keystore" -ForegroundColor Green
} else {
	Write-Host "  ⚠️  Keystore not found - Run: .\scripts\create-keystore.ps1" -ForegroundColor Yellow
}

# Check 3: gradle.properties configuration
Write-Host "✓ Checking gradle.properties..." -ForegroundColor Yellow
$gradleProps = Get-Content "android/gradle.properties" -Raw
if ($gradleProps -match "RELEASE_STORE_PASSWORD") {
	Write-Host "  ✅ gradle.properties has signing config" -ForegroundColor Green
} else {
	Write-Host "  ❌ gradle.properties missing signing config" -ForegroundColor Red
	$allGood = $false
}

# Check 4: build.gradle configuration
Write-Host "✓ Checking build.gradle signing config..." -ForegroundColor Yellow
$buildGradle = Get-Content "android/app/build.gradle" -Raw
if ($buildGradle -match "signingConfig") {
	Write-Host "  ✅ build.gradle has signing configuration" -ForegroundColor Green
} else {
	Write-Host "  ❌ build.gradle missing signing configuration" -ForegroundColor Red
	$allGood = $false
}

# Check 5: .gitignore protection
Write-Host "✓ Checking .gitignore protection..." -ForegroundColor Yellow
$gitignore = Get-Content ".gitignore" -Raw
if ($gitignore -match "\.keystore" -or $gitignore -match "gradle\.properties") {
	Write-Host "  ✅ Keystores and gradle.properties are in .gitignore" -ForegroundColor Green
} else {
	Write-Host "  ⚠️  Keystores might not be protected in .gitignore" -ForegroundColor Yellow
}

# Check 6: Environment variables
Write-Host "✓ Checking environment variables..." -ForegroundColor Yellow
if ($env:RELEASE_STORE_PASSWORD) {
	Write-Host "  ✅ RELEASE_STORE_PASSWORD is set" -ForegroundColor Green
} else {
	Write-Host "  ⚠️  RELEASE_STORE_PASSWORD not set - Run: .\scripts\setup-env-vars.ps1" -ForegroundColor Yellow
}

if ($env:RELEASE_KEY_PASSWORD) {
	Write-Host "  ✅ RELEASE_KEY_PASSWORD is set" -ForegroundColor Green
} else {
	Write-Host "  ⚠️  RELEASE_KEY_PASSWORD not set - Run: .\scripts\setup-env-vars.ps1" -ForegroundColor Yellow
}

# Check 7: Android SDK
Write-Host "✓ Checking Android SDK..." -ForegroundColor Yellow
if (Test-Path "android") {
	Write-Host "  ✅ Android project exists" -ForegroundColor Green
} else {
	Write-Host "  ❌ Android project not found" -ForegroundColor Red
	$allGood = $false
}

# Check 8: Gradle wrapper
Write-Host "✓ Checking Gradle wrapper..." -ForegroundColor Yellow
if (Test-Path "android/gradlew.bat") {
	Write-Host "  ✅ Gradle wrapper found" -ForegroundColor Green
} else {
	Write-Host "  ❌ Gradle wrapper not found" -ForegroundColor Red
	$allGood = $false
}

Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan

if ($allGood) {
	Write-Host "✨ All critical checks passed! Ready to build." -ForegroundColor Green
	Write-Host ""
	Write-Host "Next steps:" -ForegroundColor Cyan
	Write-Host "1. Create keystore (if not exists):" -ForegroundColor DarkGray
	Write-Host "   .\scripts\create-keystore.ps1" -ForegroundColor DarkGray
	Write-Host ""
	Write-Host "2. Setup environment variables:" -ForegroundColor DarkGray
	Write-Host "   .\scripts\setup-env-vars.ps1" -ForegroundColor DarkGray
	Write-Host ""
	Write-Host "3. Build release APK:" -ForegroundColor DarkGray
	Write-Host "   .\scripts\build-release-apk.ps1" -ForegroundColor DarkGray
} else {
	Write-Host "⚠️  Some issues found. Please resolve them above." -ForegroundColor Yellow
}

Write-Host ""
