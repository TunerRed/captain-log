# ============================================================================
# captain-log / render self-check (headless Chrome or Edge DOM dump)
#
# NOTE: this file is intentionally ASCII-only. Windows PowerShell 5.1 reads
#       .ps1 sources as ANSI (GBK on zh-CN), so any non-ASCII byte can break
#       parsing or swallow the following line. Keep new lines ASCII too.
#
# prerequisite: node tools/serve.mjs 4380
# run:          powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify-render.ps1
#
# covers: calendar / 5 stats sub-views / settings / day sheet / record editor /
#         reminder bar (on and off)
# asserts: key nodes exist, no leftover NaN-undefined output, no JS console error
# ============================================================================
param(
  [int]$Port = 4380,
  [string]$Browser = ''
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path $root '.verify'
New-Item -ItemType Directory -Force -Path $out | Out-Null

# Fresh browser profile every run: localStorage and Service Worker caches must
# start clean, otherwise settings from the previous run (e.g. reminder enabled)
# change the outcome of this run's assertions.
foreach ($d in @(Get-ChildItem -LiteralPath $root -Directory -Filter '.verify-profile-*' -ErrorAction SilentlyContinue)) {
  Remove-Item -LiteralPath $d.FullName -Recurse -Force -ErrorAction SilentlyContinue
}
$profile = Join-Path $root ('.verify-profile-' + ([guid]::NewGuid().ToString('N').Substring(0, 8)))

# Any occurrence of undefined/NaN in a rendered page is a bug worth failing on:
# the app has no inline JS, so these words can only come from a bad template value
# (a real case: "undefined ge biaoqian" in the stats category list).
$DIRTY = 'undefined|NaN'

function Find-Browser {
  if ($Browser) { return $Browser }
  $cands = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($c in $cands) { if (Test-Path $c) { return $c } }
  throw 'chrome.exe / msedge.exe not found'
}

$exe = Find-Browser
$base = "http://127.0.0.1:$Port/index.html"

function Invoke-Dump([string]$name, [string]$hash) {
  $file = Join-Path $out "$name.html"
  $errFile = Join-Path $out "$name.err.txt"
  $cli = @(
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    "--user-data-dir=$profile",
    '--enable-logging=stderr', '--log-level=0',
    '--virtual-time-budget=6000',
    '--dump-dom', "$base$hash"
  )
  Start-Process -FilePath $exe -ArgumentList $cli -NoNewWindow -Wait `
    -RedirectStandardOutput $file -RedirectStandardError $errFile | Out-Null
  if (-not (Test-Path $file)) { return '' }
  return (Get-Content $file -Raw -Encoding UTF8)
}

function Get-SampleDay([string]$html) {
  $m = [regex]::Match($html, 'class="cal-cell[^"]*has[^"]*"[^>]*data-date="([\d-]+)"')
  if ($m.Success) { return $m.Groups[1].Value }
  return (Get-Date).ToString('yyyy-MM-dd')
}

function Test-Case([string]$name, [string]$hash, [string[]]$want, [string[]]$notWant) {
  $html = Invoke-Dump $name $hash
  $missing = @()
  foreach ($w in $want) { if ($html -notmatch [regex]::Escape($w)) { $missing += $w } }
  foreach ($n in $notWant) { if ($html -match [regex]::Escape($n)) { $missing += "NOT(" + $n + ")" } }
  $dirty = [regex]::Match($html, $DIRTY)
  if ($dirty.Success) {
    $from = [Math]::Max(0, $dirty.Index - 45)
    $len = [Math]::Min(100, $html.Length - $from)
    $ctx = ($html.Substring($from, $len) -replace '\s+', ' ')
    $missing += ('[dirty ' + $dirty.Value + ' near: ' + $ctx + ']')
  }
  $errPath = Join-Path $out "$name.err.txt"
  if (Test-Path $errPath) {
    $errText = Get-Content $errPath -Raw -Encoding UTF8
    if ($errText -match 'Uncaught|Unhandled|SyntaxError|TypeError|ReferenceError') { $missing += '[JS error]' }
  }
  $status = 'PASS'
  if ($missing.Count -gt 0) { $status = 'FAIL' }
  [pscustomobject]@{ view = $name; bytes = $html.Length; result = $status; missing = ($missing -join ', ') }
}

$cases = @(
  @{ name = 'calendar';    hash = '#demo';                     want = @('cal-grid', 'cal-cell', 'cal-count', 'cal-bars', 'insight-block', 'tabbar', 'fab', 'reminder-bar'); notWant = @('reminder-bar on') },
  @{ name = 'stats-rank';  hash = '#demo&tab=stats&sub=rank';  want = @('kpi-grid', 'stat-card', 'preset-row', 'bar-row', 'rank-no', 'segmented') },
  @{ name = 'stats-cat';   hash = '#demo&tab=stats&sub=cat';   want = @('cat-block', 'cat-head', 'bar-row', 'bar-fill') },
  @{ name = 'stats-time';  hash = '#demo&tab=stats&sub=time';  want = @('bucket-card', 'bar-chart', 'bar-col', 'wb-grid', 'wb-cell') },
  @{ name = 'stats-heat';  hash = '#demo&tab=stats&sub=heat';  want = @('heat-grid', 'heat-cell', 'heat-legend', 'day-chip') },
  @{ name = 'stats-cross'; hash = '#demo&tab=stats&sub=cross'; want = @('matrix', 'mx-name', 'mx-dot', 'mx-total') },
  @{ name = 'settings';    hash = '#demo&tab=settings';        want = @('card', 'pref-row', 'manage-row', 'manage-tag', 'tag-pill', 'btn-row', 'switch', 'perm-state', 'reminder-bar') },
  @{ name = 'reminder';    hash = '#demo&reminder=1';          want = @('reminder-bar on', 'rb-title', 'rb-sub', 'rb-bell', 'rb-actions') }
)

$results = @()
foreach ($c in $cases) { $results += Test-Case $c.name $c.hash $c.want $c.notWant }

# Day sheet uses a real recorded day taken from the calendar dump; then the editor.
$calHtml = Get-Content (Join-Path $out 'calendar.html') -Raw -Encoding UTF8
$sampleDay = Get-SampleDay $calHtml
$results += Test-Case 'day-sheet' "#demo&date=$sampleDay" @('sheet-layer', 'sheet-title', 'day-summary', 'rec-card', 'rec-time', 'rec-tags', 'day-foot')
$results += Test-Case 'editor' '#demo&add=1' @('sheet-layer', 'editor', 'chip', 'tag-group', 'tag-area', 'inline-create', 'stepper', 'editor-foot', 'time-wrap')
# Reminder off -> bar must stay hidden (forced off via hash so the check does not
# depend on the default value of the toggle).
$results += Test-Case 'reminder-off' '#demo&reminder=0&tab=settings' @('reminder-bar', 'switch') @('reminder-bar on')

$results | Format-Table -AutoSize
Write-Host "sample day used for day-sheet: $sampleDay"

Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue

$failed = @($results | Where-Object { $_.result -eq 'FAIL' })
if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Host "$($failed.Count) view(s) FAILED:" -ForegroundColor Red
  $failed | ForEach-Object { Write-Host ("  x " + $_.view + " -> " + $_.missing) }
  exit 1
}
Write-Host ""
Write-Host "all views rendered OK" -ForegroundColor Green
