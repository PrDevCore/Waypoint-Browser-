# Build Release APK for Waypoint
# This script builds a signed release APK with proper environment variables

Write-Host "🚀 Building Waypoint Release APK" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

# Set environment variables
Write-Host "🔐 Setting signing credentials..." -ForegroundColor Yellow
$env:RELEASE_STORE_PASSWORD = "WaypointPrDevCore2025!"
$env:RELEASE_KEY_PASSWORD = "WaypointPrDevCore2025!"

Write-Host "✅ Credentials configured" -ForegroundColor Green
Write-Host ""

# Step 1: Build web assets
Write-Host "📦 Step 1: Building web assets..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
	Write-Host "❌ Web build failed" -ForegroundColor Red
	exit 1
}
Write-Host "✅ Web assets built" -ForegroundColor Green
Write-Host ""

# Step 2: Sync to Android
Write-Host "📱 Step 2: Syncing to Android..." -ForegroundColor Cyan
npm run mobile:sync
if ($LASTEXITCODE -ne 0) {
	Write-Host "❌ Capacitor sync failed" -ForegroundColor Red
	exit 1
}
Write-Host "✅ Android project synced" -ForegroundColor Green
Write-Host ""

# Step 3: Build release APK
Write-Host "🔨 Step 3: Building release APK..." -ForegroundColor Cyan
Push-Location android
./gradlew assembleRelease
if ($LASTEXITCODE -ne 0) {
	Write-Host "❌ APK build failed" -ForegroundColor Red
	Pop-Location
	exit 1
}
Pop-Location
Write-Host "✅ Release APK built" -ForegroundColor Green
Write-Host ""

# Step 4: Display output info
$apkPath = "android\app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apkPath) {
	$apkSize = (Get-Item $apkPath).Length / 1MB
	Write-Host "📍 Release APK Location:" -ForegroundColor Green
	Write-Host "   $apkPath" -ForegroundColor Cyan
	Write-Host ""
	Write-Host "📊 APK Size: $([Math]::Round($apkSize, 2)) MB" -ForegroundColor Yellow
	Write-Host ""
	Write-Host "✨ Build complete! Ready to upload to Google Play Store." -ForegroundColor Green
} else {
	Write-Host "⚠️  APK file not found at expected location" -ForegroundColor Yellow
}
