# ⚡ PowerShell Scripts Not Running - Quick Fix

## 🔧 Problem: "Cannot be loaded because running scripts is disabled"

This is a PowerShell execution policy issue. Here are the solutions:

---

## ✅ Solution 1: Bypass for Single Session (Easiest)

**Open PowerShell as Administrator** and run:

```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope CurrentUser
```

Then use the scripts:
```powershell
.\scripts\verify-signing-setup.ps1
```

---

## ✅ Solution 2: Unblock Individual Scripts

**Open PowerShell as Administrator** and run:

```powershell
# Unblock all scripts
Get-ChildItem scripts\*.ps1 | Unblock-File

# Then run any script
.\scripts\verify-signing-setup.ps1
```

---

## ✅ Solution 3: Run PowerShell with Bypass Flag

**Run this single command** (no admin needed for most operations):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-signing-setup.ps1
```

---

## ✅ Solution 4: Permanent Fix (Recommended)

**Open PowerShell as Administrator** and run:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

This allows locally created scripts to run while maintaining security.

---

## 🎯 Recommended Approach

### Step 1: Open PowerShell as Administrator
- Press `Win + X` → Select "Windows PowerShell (Admin)"
- Or search for "PowerShell" and right-click → "Run as Administrator"

### Step 2: Set Execution Policy
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Step 3: Run Your Scripts
```powershell
cd C:\Users\USER\Documents\geo\Waypoint-Browser-
.\scripts\verify-signing-setup.ps1
```

---

## 🔍 Check Current Policy

If you want to see your current execution policy:

```powershell
Get-ExecutionPolicy
```

Expected output: `RemoteSigned` or `Unrestricted`

---

## 📋 Step-by-Step Instructions

### For Windows 10/11 Users:

1. **Open PowerShell as Administrator**
   - Press `Windows Key + X`
   - Click "Windows PowerShell (Admin)" or "Terminal (Admin)"

2. **Copy and Paste This**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
   ```

3. **Press Enter**

4. **Type `A` and Press Enter** (if prompted to confirm)

5. **Navigate to your project**
   ```powershell
   cd "C:\Users\USER\Documents\geo\Waypoint-Browser-"
   ```

6. **Run any script**
   ```powershell
   .\scripts\verify-signing-setup.ps1
   ```

---

## 🆘 If Still Not Working

### Try This Workaround:

```powershell
# Navigate to your scripts folder
cd C:\Users\USER\Documents\geo\Waypoint-Browser-\scripts

# Run with explicit bypass
powershell -ExecutionPolicy Bypass -File verify-signing-setup.ps1
```

---

## 🎓 Understanding Execution Policies

| Policy | Meaning |
|--------|---------|
| `Restricted` | ❌ No scripts run (default) |
| `AllSigned` | ✓ Only signed scripts run |
| `RemoteSigned` | ✓ Local scripts run, remote must be signed (Recommended) |
| `Unrestricted` | ✓ All scripts run (less secure) |
| `Bypass` | ✓ All scripts run, no warnings (temporary) |

---

## ✅ Quick Fix Summary

**Most Users:** Copy and run this in PowerShell (as Admin):
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```

**Then run your scripts normally:**
```powershell
.\scripts\verify-signing-setup.ps1
.\scripts\create-keystore.ps1
.\scripts\build-release-apk.ps1
```

---

## 🎯 Test It Works

After setting the policy, run this test:

```powershell
# Navigate to project
cd "C:\Users\USER\Documents\geo\Waypoint-Browser-"

# Run verification
.\scripts\verify-signing-setup.ps1
```

If it runs: ✅ **Success!**

If error: 🔴 Try the workaround above

---

## 💡 Pro Tips

**Create a convenient alias:**
```powershell
Set-Alias build-apk "C:\Users\USER\Documents\geo\Waypoint-Browser-\scripts\build-release-apk.ps1"

# Then just run:
build-apk
```

**Add to PowerShell profile** (make permanent):
```powershell
# Edit your profile
notepad $PROFILE

# Add these lines:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Set-Alias build-apk "C:\Users\USER\Documents\geo\Waypoint-Browser-\scripts\build-release-apk.ps1"
```

---

**Still having issues?** Run this diagnostic:

```powershell
Write-Host "Current Policy: $(Get-ExecutionPolicy)"
Write-Host "PowerShell Version: $($PSVersionTable.PSVersion)"
Write-Host "Is Admin: $(([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] 'Administrator'))"
```

Share the output and I can help further!
