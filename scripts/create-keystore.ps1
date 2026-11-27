# Generate Android Keystore for Waypoint
# This script creates a signing keystore for Android APK releases

$keystorePath = "android\app\waypoint.keystore"
$storePassword = "WaypointPrDevCore2025!"
$keyPassword = "WaypointPrDevCore2025!"
$alias = "waypoint"
$validity = 10000

# Check if keystore already exists
if (Test-Path $keystorePath) {
	Write-Host "⚠️  Keystore already exists at $keystorePath" -ForegroundColor Yellow
	$response = Read-Host "Do you want to overwrite it? (yes/no)"
	if ($response -ne "yes") {
		Write-Host "Cancelled." -ForegroundColor Red
		exit 1
	}
}

# Generate keystore
Write-Host "🔑 Generating keystore..." -ForegroundColor Cyan

keytool -genkey -v `
	-keystore $keystorePath `
	-keyalg RSA `
	-keysize 2048 `
	-validity $validity `
	-alias $alias `
	-dname "CN=Waypoint, OU=PrDevCore Technologies, O=PrDevCore Technologies, L=United States, ST=United States, C=US" `
	-storepass $storePassword `
	-keypass $keyPassword

if ($LASTEXITCODE -eq 0) {
	Write-Host "✅ Keystore created successfully!" -ForegroundColor Green
	Write-Host ""
	Write-Host "📍 Location: $keystorePath" -ForegroundColor Cyan
	Write-Host "🔐 Store Password: $storePassword" -ForegroundColor Yellow
	Write-Host "🔐 Key Password: $keyPassword" -ForegroundColor Yellow
	Write-Host "🏷️  Alias: $alias" -ForegroundColor Cyan
	Write-Host ""
	Write-Host "⚠️  IMPORTANT: Save these credentials in a secure location!" -ForegroundColor Red
} else {
	Write-Host "❌ Failed to create keystore" -ForegroundColor Red
	exit 1
}
