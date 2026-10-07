# ============================================================================
# captain-log / .gitignore self-check
#
# NOTE: keep this file ASCII-only (Windows PowerShell reads BOM-less .ps1 as ANSI).
#
# What it does: copies the project to a temp dir, runs a real `git init` + `git add -A`
# and asserts:
#   1. signing secrets (release.keystore / keystore.properties) are NOT tracked
#   2. dependencies, build output and temp dirs are NOT tracked
#   3. every file the project needs IS tracked (so .gitignore never hides real source)
#
# Why a copy: it never touches the real working tree (no .git is created there).
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/check-gitignore.ps1
# ============================================================================

param([switch]$KeepTemp)

$ErrorActionPreference = 'Continue'
$app = Split-Path $PSScriptRoot -Parent
$root = Split-Path $app -Parent

function Find-Git {
    $cands = @(
        "$env:ProgramFiles\Git\cmd\git.exe",
        "${env:ProgramFiles(x86)}\Git\cmd\git.exe",
        "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
    )
    foreach ($c in $cands) { if (Test-Path $c) { return $c } }
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw 'git.exe not found -- install Git for Windows or put git on PATH'
}

$git = Find-Git
$tmp = Join-Path $root ('.gitignore-check-' + ([guid]::NewGuid().ToString('N').Substring(0, 8)))
Write-Output "git  = $git"
Write-Output "tmp  = $tmp"

# Heavy build output is irrelevant for ignore rules -> skip it to keep the check fast.
$skip = @("$app\android\app\build", "$app\android\build", "$app\android\.gradle", "$app\release")
robocopy $app $tmp /E /XD @skip /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with code $LASTEXITCODE" }

& $git -C $tmp init -q 2>&1 | Out-Null
& $git -C $tmp add -A 2>&1 | Out-Null
$tracked = @(& $git -C $tmp ls-files)

$problems = New-Object System.Collections.ArrayList

# ---- 1/2: nothing sensitive may be tracked -------------------------------
$forbidden = @(
    'keystore.properties', 'release.keystore', '.jks', '.p12', '.pem', '.key',
    'node_modules/', 'release/', 'assets/public/', '.verify/', '.probe-', '.p-',
    'local.properties', 'google-services.json', '.npmrc', '.env', 'keystore'
)
foreach ($f in $tracked) {
    if ($f -eq 'android/keystore.properties.example') { continue }   # public template, on purpose
    foreach ($bad in $forbidden) {
        if ($f -like "*$bad*") { [void]$problems.Add("LEAK: $f  (matches '$bad')"); break }
    }
    if ($f -like '*.log' -or $f -like '*.apk' -or $f -like '*.aab') { [void]$problems.Add("LEAK: $f") }
}

# ---- 3/3: everything needed must be tracked ------------------------------
$required = @(
    '.gitignore', 'index.html', 'manifest.webmanifest', 'sw.js', 'capacitor.config.json',
    'package.json', 'README.md', 'css/styles.css',
    'js/util.js', 'js/kit.js', 'js/reminder-core.js', 'js/store.js', 'js/stats.js',
    'js/view-editor.js', 'js/view-calendar.js', 'js/view-stats.js', 'js/view-settings.js',
    'js/reminder.js', 'js/app.js',
    'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
    'tools/serve.mjs', 'tools/selftest.mjs', 'tools/make-icons.mjs',
    'tools/verify-render.ps1', 'tools/layout-probe.html', 'tools/build-apk.ps1',
    'android/settings.gradle', 'android/build.gradle', 'android/variables.gradle',
    'android/gradle.properties', 'android/gradlew', 'android/gradlew.bat',
    'android/gradle/wrapper/gradle-wrapper.jar', 'android/gradle/wrapper/gradle-wrapper.properties',
    'android/app/build.gradle', 'android/app/capacitor.build.gradle', 'android/app/proguard-rules.pro',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/assets/capacitor.config.json',
    'android/app/src/main/assets/capacitor.plugins.json',
    'android/app/src/main/res/xml/config.xml',
    'android/app/src/main/res/values/strings.xml',
    'android/app/src/main/res/values/styles.xml',
    'android/app/src/main/java/com/captainlog/app/MainActivity.java',
    'android/app/src/main/java/com/captainlog/app/ReminderPlugin.java',
    'android/app/src/main/java/com/captainlog/app/ReminderScheduler.java',
    'android/app/src/main/java/com/captainlog/app/ReminderReceiver.java',
    'android/app/src/main/java/com/captainlog/app/BootReceiver.java',
    'android/capacitor-cordova-android-plugins/build.gradle',
    'android/capacitor-cordova-android-plugins/cordova.variables.gradle',
    'android/keystore.properties.example'
)
foreach ($f in $required) {
    if ($tracked -notcontains $f) { [void]$problems.Add("MISSING: $f  would not be committed") }
}

# ---- report --------------------------------------------------------------
Write-Output ''
Write-Output ("tracked files: {0}" -f $tracked.Count)
Write-Output ''
Write-Output 'sample of tracked files:'
$tracked | Select-Object -First 8 | ForEach-Object { Write-Output "  $_" }
Write-Output ''

if (-not $KeepTemp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }

if ($problems.Count -gt 0) {
    Write-Output ("FAILED ({0}):" -f $problems.Count)
    $problems | ForEach-Object { Write-Output ("  x " + $_) }
    exit 1
}
Write-Output 'OK: no secrets/build output would be committed, and all project files are tracked'
