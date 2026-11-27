# Android APK Signing Setup for Waypoint Browser

This directory contains scripts to manage Android APK signing certificates and credentials securely.

## 📋 Overview

- **Organization:** PrDevCore Technologies
- **Keystore Alias:** waypoint
- **Validity:** 10 years (10,000 days)
- **Algorithm:** RSA 2048-bit

## 🔑 Keystore Credentials

**Store Password:** `WaypointPrDevCore2025!`  
**Key Password:** `WaypointPrDevCore2025!`

⚠️ **IMPORTANT:** Keep these credentials secure and never commit them to version control.

---

## 🚀 Quick Start

### Step 1: Create the Keystore

Run the keystore creation script from PowerShell (as Administrator):

```powershell
.\scripts\create-keystore.ps1
```

This generates `android\app\waypoint.keystore`

### Step 2: Setup Environment Variables

For this session, run:

```powershell
.\scripts\setup-env-vars.ps1
```

This sets the required environment variables for Gradle signing.

### Step 3: Build Release APK

```powershell
.\scripts\build-release-apk.ps1
```

Output: `android\app\build\outputs\apk\release\app-release.apk`

---

## 🔐 Secure Credential Management

### Option A: Environment Variables (Session-based)

For temporary use in your current PowerShell session:

```powershell
$env:RELEASE_STORE_PASSWORD = "WaypointPrDevCore2025!"
$env:RELEASE_KEY_PASSWORD = "WaypointPrDevCore2025!"
```

### Option B: Windows Credential Manager (Recommended)

Store credentials securely in Windows (requires Admin):

```powershell
.\scripts\setup-secure-credentials.ps1
```

Then retrieve in scripts with `cmdkey` or `Get-StoredCredential`.

### Option C: PowerShell Profile (Permanent)

Add to your PowerShell profile (`$PROFILE`):

```powershell
# Android Signing Credentials
$env:RELEASE_STORE_PASSWORD = "WaypointPrDevCore2025!"
$env:RELEASE_KEY_PASSWORD = "WaypointPrDevCore2025!"
```

---

## 📦 Build Process

The build process follows these steps:

1. **Build Web Assets**
   ```bash
   npm run build
   ```

2. **Sync to Android**
   ```bash
   npm run mobile:sync
   ```

3. **Build Release APK**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

**All-in-one:**
```powershell
.\scripts\build-release-apk.ps1
```

---

## 📂 File Locations

```
waypoint-browser/
├── android/
│   ├── app/
│   │   ├── waypoint.keystore          ← Signing keystore (DO NOT COMMIT)
│   │   └── build.gradle               ← Updated with signing config
│   └── gradle.properties              ← Updated with signing vars (DO NOT COMMIT)
├── scripts/
│   ├── create-keystore.ps1            ← Generate keystore
│   ├── setup-env-vars.ps1             ← Set environment variables
│   ├── setup-secure-credentials.ps1   ← Windows Credential Manager setup
│   └── build-release-apk.ps1          ← Full build script
└── .gitignore                          ← Updated to protect credentials
```

---

## ⚠️ Security Best Practices

1. **Never commit keystores or passwords to version control**
   - Already added to `.gitignore`

2. **Use environment variables instead of hardcoding**
   - `RELEASE_STORE_PASSWORD`
   - `RELEASE_KEY_PASSWORD`

3. **Backup your keystore securely**
   - Store in a secure location (encrypted cloud, USB drive)
   - You CANNOT rebuild your app without it

4. **Rotate passwords periodically**
   - Change passwords in Windows Credential Manager
   - Update environment variables

5. **Use different passwords for sensitive environments**
   - Consider different keystore for development vs. production

---

## 🐛 Troubleshooting

### Issue: "Keystore not found"

Ensure `waypoint.keystore` exists in `android/app/`:
```powershell
Test-Path android/app/waypoint.keystore
```

### Issue: "Invalid password"

Verify environment variables are set:
```powershell
$env:RELEASE_STORE_PASSWORD
$env:RELEASE_KEY_PASSWORD
```

### Issue: "Build fails with signing error"

Run setup script again:
```powershell
.\scripts\setup-env-vars.ps1
.\scripts\build-release-apk.ps1
```

### Issue: "keytool not found"

Ensure Java is installed and in PATH:
```powershell
keytool -version
```

---

## 🎯 Next Steps

1. Run `create-keystore.ps1` to generate the keystore
2. Store the keystore file securely
3. Use `setup-env-vars.ps1` or `setup-secure-credentials.ps1`
4. Build with `build-release-apk.ps1`
5. Upload to Google Play Store

---

## 📞 Support

For issues or questions about the signing process, refer to:
- [Android Documentation](https://developer.android.com/studio/publish/app-signing)
- [Capacitor Android Guide](https://capacitorjs.com/docs/android)
- Waypoint Team Documentation
