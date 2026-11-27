# 🚀 Quick Reference - Android APK Signing

## ⚡ One-Command Setup

```powershell
# 1. Verify everything is configured
.\scripts\verify-signing-setup.ps1

# 2. Create keystore (first time only)
.\scripts\create-keystore.ps1

# 3. Build release APK
.\scripts\build-release-apk.ps1
```

## 📋 Credentials Reference

| Item | Value |
|------|-------|
| **Organization** | PrDevCore Technologies |
| **App ID** | com.prdevcore.waypoint |
| **Alias** | waypoint |
| **Store Password** | WaypointPrDevCore2025! |
| **Key Password** | WaypointPrDevCore2025! |
| **Keystore File** | android/app/waypoint.keystore |

## 🔧 Manual Build Steps

```bash
# Step 1: Build web
npm run build

# Step 2: Sync to Android
npm run mobile:sync

# Step 3: Set credentials
$env:RELEASE_STORE_PASSWORD = "WaypointPrDevCore2025!"
$env:RELEASE_KEY_PASSWORD = "WaypointPrDevCore2025!"

# Step 4: Build release APK
cd android
./gradlew assembleRelease
```

## 📍 Output Locations

| Item | Path |
|------|------|
| **Release APK** | `android/app/build/outputs/apk/release/app-release.apk` |
| **Keystore** | `android/app/waypoint.keystore` |
| **Build Logs** | `android/app/build/outputs/` |

## 🔐 Secure Credential Options

```powershell
# Option 1: Session environment variables
.\scripts\setup-env-vars.ps1

# Option 2: Windows Credential Manager
.\scripts\setup-secure-credentials.ps1

# Option 3: PowerShell Profile (permanent)
# Add to $PROFILE
```

## ✅ Verification

```powershell
# Check if keystore exists
Test-Path android/app/waypoint.keystore

# Check environment variables
$env:RELEASE_STORE_PASSWORD
$env:RELEASE_KEY_PASSWORD

# Run full verification
.\scripts\verify-signing-setup.ps1
```

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| **Keystore not found** | Run `.\scripts\create-keystore.ps1` |
| **Invalid password** | Run `.\scripts\setup-env-vars.ps1` |
| **Build fails** | Check Java/keytool: `keytool -version` |
| **Signing error** | Verify env vars: `$env:RELEASE_STORE_PASSWORD` |

## 📞 More Info

- Full docs: `SIGNING_SETUP.md`
- Setup report: `SETUP_COMPLETE.md`
- Verification: `.\scripts\verify-signing-setup.ps1`

---

**Remember:** Keep your keystore safe. You need it for all future app updates! 🔒
