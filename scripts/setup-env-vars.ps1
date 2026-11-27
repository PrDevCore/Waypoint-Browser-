# Setup secure environment variables for Android signing
# This script sets the required environment variables for APK signing

Write-Host "🔐 Android APK Signing - Environment Variables Setup" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

# Set environment variables for the current session
$env:RELEASE_STORE_PASSWORD = "WaypointPrDevCore2025!"
$env:RELEASE_KEY_PASSWORD = "WaypointPrDevCore2025!"

Write-Host "✅ Environment variables set for this session:" -ForegroundColor Green
Write-Host "   • RELEASE_STORE_PASSWORD" -ForegroundColor Yellow
Write-Host "   • RELEASE_KEY_PASSWORD" -ForegroundColor Yellow
Write-Host ""

Write-Host "📌 To make these permanent, add to your PowerShell profile:" -ForegroundColor Cyan
Write-Host ""
Write-Host '$env:RELEASE_STORE_PASSWORD = "WaypointPrDevCore2025!"' -ForegroundColor DarkGray
Write-Host '$env:RELEASE_KEY_PASSWORD = "WaypointPrDevCore2025!"' -ForegroundColor DarkGray
Write-Host ""

Write-Host "⚠️  SECURITY WARNING:" -ForegroundColor Red
Write-Host "   • Do NOT commit credentials to version control" -ForegroundColor Red
Write-Host "   • Use secure credential storage (Windows Credential Manager)" -ForegroundColor Red
Write-Host "   • Treat these values like passwords" -ForegroundColor Red
Write-Host ""

Write-Host "✨ Ready to build release APK!" -ForegroundColor Green
Write-Host "   Run: npm run build && npm run mobile:sync && cd android && ./gradlew assembleRelease" -ForegroundColor DarkGray
