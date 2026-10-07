# ============================================================================
# captain-log / one-command RELEASE APK build
#
# NOTE: keep this file ASCII-only -- Windows PowerShell reads BOM-less .ps1 as
#       ANSI, and a stray non-ASCII byte can break parsing or swallow the next line.
#
# Steps:
#   1/5 sync the web app into android/app/src/main/assets/public (never ship stale web code)
#   2/5 gradle assembleRelease (offline, uses the local gradle cache)
#   3/5 check the APK exists and is signed
#   4/5 check the packaged web assets are byte-identical to the repo files
#   5/5 print package / version / label / permissions
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-apk.ps1
# ============================================================================

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$app = Split-Path $PSScriptRoot -Parent                 # ...\captain-log
$root = Split-Path $app -Parent                         # workspace root

function Step($msg) { Write-Output ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg) }

# ------------------------------------------------------------------ toolchain
$sdk = Join-Path $root 'android-sdk'
if (-not (Test-Path (Join-Path $sdk 'platform-tools'))) {
    throw "Android SDK not found at $sdk"
}
$jdkHome = (Get-ChildItem (Join-Path $root '.android-dl') -Directory -Recurse -Depth 3 -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'jdk-21*' -and (Test-Path (Join-Path $_.FullName 'bin\java.exe')) } |
    Select-Object -First 1).FullName
if (-not $jdkHome) { throw "JDK 21 not found under $root\.android-dl" }

$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:GRADLE_USER_HOME = Join-Path $root '.gradle-home'

$androidDir = Join-Path $app 'android'
if (-not (Test-Path $androidDir)) {
    throw "android/ project not found. It was generated once and lives in the repo; restore it from backup."
}
$keystoreProps = Join-Path $androidDir 'keystore.properties'
if (-not (Test-Path $keystoreProps)) {
    Step 'WARNING: android/keystore.properties is missing -> the release APK will be UNSIGNED'
}

Step "JAVA_HOME    = $jdkHome"
Step "ANDROID_HOME = $sdk"

# --------------------------------------------------------- 1/5 sync web assets
Step '=== 1/5 sync web app into android assets ==='
$dest = Join-Path $androidDir 'app\src\main\assets\public'
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue }
# Only the web app itself may be packaged. Everything else (android project,
# previous APKs in release/, dev tools, node_modules, temp probe dirs) must be excluded,
# otherwise the new APK silently swallows the old one.
$excludeDirs = @(
    "$app\android", "$app\node_modules", "$app\tools", "$app\release",
    "$app\.verify", "$app\.chrome-profile"
)
$excludeDirs += @(Get-ChildItem -LiteralPath $app -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '.verify-profile-*' -or $_.Name -like '.probe-*' -or $_.Name -like '.p-*' } |
    ForEach-Object { $_.FullName })
robocopy $app $dest /E /XD @excludeDirs `
    /XF README.md package.json capacitor.config.json .gitignore .gitattributes /NFL /NDL /NJH /NJS /NP | Out-Null
# robocopy: exit codes 0-7 mean success, >=8 means failure
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with code $LASTEXITCODE" }
Step '  web files copied'

# ------------------------------------------------------------- 2/5 gradle build
Step '=== 2/5 gradle assembleRelease (offline) ==='
Push-Location $androidDir
try {
    & .\gradlew.bat --no-daemon --offline --console=plain assembleRelease 2>&1 |
        Select-String -Pattern 'BUILD|FAILED|error:|warning:|What went wrong|> Task :app:assemble' |
        ForEach-Object { Step "  $_" }
    $gradleExit = $LASTEXITCODE
    if ($gradleExit -ne 0) { throw "gradle assembleRelease failed (exit $gradleExit)" }
} finally { Pop-Location }

# ------------------------------------------------------------------- 3/5 verify
Step '=== 3/5 verify the APK ==='
$apk = Join-Path $androidDir 'app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apk)) { throw "APK not found: $apk" }
$apkItem = Get-Item $apk
Step ("  APK:  {0}" -f $apkItem.FullName)
Step ("  size: {0:N2} MB" -f ($apkItem.Length / 1MB))

$apksigner = Join-Path $sdk 'build-tools\36.0.0\apksigner.bat'
$certSha = ''
if (Test-Path $apksigner) {
    $verify = & $apksigner verify --print-certs $apk 2>&1 | Out-String
    $certSha = ([regex]::Match($verify, 'certificate SHA-256 digest:\s*([0-9a-fA-F]+)')).Groups[1].Value
    if ($verify -match 'DOES NOT VERIFY' -or $verify -notmatch 'Signer #1 certificate DN') {
        throw "APK signature verification FAILED:`n$verify"
    }
    Step '  OK   APK is signed'
    Step "  signer SHA-256: $certSha"
} else {
    Step '  (apksigner not found, skip signature check)'
}

# ------------------------------------------- 4/5 packaged assets must be current
Step '=== 4/5 packaged web assets match the repo ==='
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($apk)
try {
    $names = $zip.Entries | ForEach-Object { $_.FullName }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    foreach ($rel in @('index.html', 'js\reminder.js', 'js\app.js', 'js\reminder-core.js', 'css\styles.css')) {
        $entryName = 'assets/public/' + ($rel -replace '\\', '/')
        $entry = $zip.Entries | Where-Object { $_.FullName -eq $entryName }
        if (-not $entry) { throw "APK is missing $entryName (stale assets?)" }
        $stream = $entry.Open()
        try { $apkHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
        finally { $stream.Dispose() }
        $repoHash = (Get-FileHash (Join-Path $app $rel) -Algorithm SHA256).Hash
        if ($apkHash -ne $repoHash) {
            throw "APK contains a STALE $rel -- the asset sync / cap sync step did not run"
        }
        Step "  OK   $rel  (sha256 matches repo)"
    }
    foreach ($required in @(
            'assets/capacitor.config.json',
            'assets/native-bridge.js',
            'assets/public/js/store.js',
            'classes.dex',
            'resources.arsc')) {
        if ($names -contains $required) { Step "  OK   $required" }
        else { throw "APK is missing $required" }
    }

    # Guard: nothing but the web app may live in assets/public
    # (this is what catches "the previous APK got packaged into the new one").
    foreach ($e in $zip.Entries) {
        if ($e.FullName -notlike 'assets/public/*') { continue }
        if ($e.FullName -match '\.(apk|zip|jar|ps1|mjs|md|keystore|properties|gitignore|gitattributes)$') {
            throw "unexpected file packaged into assets/public: $($e.FullName) -- check the robocopy exclude list"
        }
    }
    $webCount = ($zip.Entries | Where-Object { $_.FullName -like 'assets/public/*' }).Count
    Step "  OK   assets/public holds exactly $webCount web files"
} finally { $zip.Dispose() }

# --------------------------------------------- 5/5 badging: package / label / perms
Step '=== 5/5 badging ==='
$aapt = Join-Path $sdk 'build-tools\36.0.0\aapt2.exe'
if (Test-Path $aapt) {
    $badging = & $aapt dump badging $apk 2>&1 | Out-String
    $label = ([regex]::Match($badging, "application-label:'([^']*)'")).Groups[1].Value
    # "ji zhang ri zhi" = captain log, built from code points so this file stays ASCII
    $expected = [string]([char]0x673A) + [char]0x957F + [char]0x65E5 + [char]0x5FD7
    if ($label -eq $expected) { Step "  OK   label = $label" }
    else { throw "App label wrong or mojibake: got '$label', expected '$expected'" }

    $pkg = ([regex]::Match($badging, "package: name='([^']*)'")).Groups[1].Value
    $vname = ([regex]::Match($badging, "versionName='([^']*)'")).Groups[1].Value
    $vcode = ([regex]::Match($badging, "versionCode='([^']*)'")).Groups[1].Value
    $target = ([regex]::Match($badging, "targetSdkVersion:'([^']*)'")).Groups[1].Value
    Step "  OK   package=$pkg  version=$vname($vcode)  targetSdk=$target"

    $perms = [regex]::Matches($badging, "uses-permission: name='([^']*)'") | ForEach-Object { $_.Groups[1].Value }
    Step ("  permissions: " + ($perms -join ', '))
    foreach ($need in @('android.permission.POST_NOTIFICATIONS', 'android.permission.RECEIVE_BOOT_COMPLETED')) {
        if ($perms -contains $need) { Step "  OK   $need" } else { throw "missing permission $need" }
    }

    # The native reminder must really be wired into the shipped manifest.
    $tree = & $aapt dump xmltree --file AndroidManifest.xml $apk 2>&1 | Out-String
    foreach ($need in @('com.captainlog.app.ReminderReceiver', 'com.captainlog.app.BootReceiver', 'android.intent.action.BOOT_COMPLETED')) {
        if ($tree -match [regex]::Escape($need)) { Step "  OK   manifest has $need" }
        else { throw "manifest is missing $need" }
    }
}

Step 'APK_READY'
Step $apk

# --------------------------------------------------- copy out with a nice name
# "ji zhang ri zhi" built from code points so this script stays ASCII-only
$cnName = [string]([char]0x673A) + [char]0x957F + [char]0x65E5 + [char]0x5FD7
$outDir = Join-Path $app 'release'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$ver = if ($vname) { $vname } else { '1.0.0' }
$final = Join-Path $outDir ("$cnName-v$ver-release.apk")
Copy-Item -LiteralPath $apk -Destination $final -Force
Step ("release copy: {0}" -f $final)
