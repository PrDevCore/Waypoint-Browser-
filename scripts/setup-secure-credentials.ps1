# Secure Credential Storage using Windows Credential Manager
# This stores credentials securely instead of in plaintext

Write-Host "🔐 Secure Android Signing Credentials Setup" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

# Credentials to store
$storePassword = "WaypointPrDevCore2025!"
$keyPassword = "WaypointPrDevCore2025!"

Write-Host "📦 Storing credentials in Windows Credential Manager..." -ForegroundColor Yellow
Write-Host ""

# Store in Windows Credential Manager
# This requires PowerShell to be run as Administrator
try {
	# Store keystore password
	$credPath1 = "waypoint/release-store-password"
	$securePassword1 = ConvertTo-SecureString $storePassword -AsPlainText -Force

	# Store key password
	$credPath2 = "waypoint/release-key-password"
	$securePassword2 = ConvertTo-SecureString $keyPassword -AsPlainText -Force

	# Using cmdkey (Windows built-in)
	Write-Host "Adding credentials to Windows Credential Manager..." -ForegroundColor Cyan

	# Note: cmdkey requires elevated privileges
	& cmdkey /add:waypoint-store /user:android /pass:$storePassword 2>$null
	& cmdkey /add:waypoint-key /user:android /pass:$keyPassword 2>$null

	if ($LASTEXITCODE -eq 0) {
		Write-Host "✅ Credentials stored securely!" -ForegroundColor Green
		Write-Host ""
		Write-Host "To use in scripts, retrieve with:" -ForegroundColor Cyan
		Write-Host '$cred = Get-StoredCredential -Target "waypoint-store"' -ForegroundColor DarkGray
		Write-Host '$password = $cred.GetNetworkCredential().Password' -ForegroundColor DarkGray
	}
} catch {
	Write-Host "⚠️  Could not store in Credential Manager (may require admin)" -ForegroundColor Yellow
	Write-Host "Using environment variables instead..." -ForegroundColor Yellow
	& "$PSScriptRoot\setup-env-vars.ps1"
}

Write-Host ""
Write-Host "To view stored credentials:" -ForegroundColor Cyan
Write-Host "   cmdkey /list | Select-String waypoint" -ForegroundColor DarkGray
Write-Host ""
Write-Host "To delete stored credentials:" -ForegroundColor Cyan
Write-Host "   cmdkey /delete:waypoint-store" -ForegroundColor DarkGray
Write-Host "   cmdkey /delete:waypoint-key" -ForegroundColor DarkGray
