# Tamam · تمام: one-step installer for Windows (PowerShell 5.1 or newer).
#
#   irm https://github.com/mayarakwad/TamamERP/releases/latest/download/install.ps1 | iex
#
# or, from a downloaded copy of Tamam:   powershell -ExecutionPolicy Bypass -File install\install.ps1
#
# Options (when run as a file):  -Demo  -Dir <folder>  -Version <tag>  -Port <number>  -NoPdf  -NoStart
param(
  [switch]$Demo,
  [string]$Dir = "tamam",
  [string]$Version = "",
  [int]$Port = 3000,
  [switch]$NoPdf,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"
$env:PRISMA_HIDE_UPDATE_MESSAGE = "1"
$env:NEXT_TELEMETRY_DISABLED = "1"
$Repo = "mayarakwad/TamamERP"
$Mode = if ($Demo) { "demo" } else { "wizard" }

function Ok($text) { Write-Host "  [OK] $text" -ForegroundColor Green }
function Step($text) { Write-Host ""; Write-Host $text -ForegroundColor White }
function Fail($text) { Write-Host ""; Write-Host "  [X] $text" -ForegroundColor Red; Write-Host ""; exit 1 }

Write-Host ""
Write-Host "Tamam  installer" -ForegroundColor White

# 1. Node.js 22 or newer
Step "Checking your computer"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Node.js isn't installed. Install Node.js 22 or newer from https://nodejs.org (or: winget install OpenJS.NodeJS.LTS), then open a new PowerShell window and run this again."
}
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 22) { Fail "Node.js $(node -v) is too old. Tamam needs Node.js 22 or newer: https://nodejs.org" }
Ok "Node.js $(node -v)"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "npm isn't available. It comes with Node.js: https://nodejs.org" }
Ok "npm $(npm -v)"

# 2. The code: use this folder if it's Tamam, otherwise download a release.
function Test-Tamam($path) { (Test-Path (Join-Path $path "package.json")) -and ((Get-Content (Join-Path $path "package.json") -Raw) -match '"name": "tamam"') }
if (Test-Tamam ".") { $Root = (Get-Location).Path }
elseif (Test-Tamam "..") { $Root = (Resolve-Path "..").Path }
else {
  Step "Downloading Tamam"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  if (-not $Version) {
    try { $Version = (Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest").tag_name } catch { $Version = "" }
  }
  if ((Test-Path $Dir) -and (Get-ChildItem $Dir -Force | Select-Object -First 1)) {
    if (-not (Test-Tamam $Dir)) { Fail "The folder '$Dir' already exists and isn't Tamam. Choose another with -Dir." }
    Ok "Using the existing copy in $Dir"
  } else {
    $url = if ($Version) { "https://github.com/$Repo/archive/refs/tags/$Version.zip" } else { "https://github.com/$Repo/archive/refs/heads/main.zip" }
    if (-not $Version) { $Version = "main" }
    $zip = Join-Path $env:TEMP "tamam-$([guid]::NewGuid()).zip"
    $tmp = Join-Path $env:TEMP "tamam-$([guid]::NewGuid())"
    Invoke-WebRequest $url -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $tmp
    $inner = Get-ChildItem $tmp | Select-Object -First 1
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    Get-ChildItem $inner.FullName -Force | Move-Item -Destination $Dir
    Remove-Item $zip, $tmp -Recurse -Force
    Ok "Tamam $Version downloaded to $Dir"
  }
  $Root = (Resolve-Path $Dir).Path
}
Set-Location $Root

# 3. Dependencies
Step "Installing (this takes a few minutes the first time)"
npm ci --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { Fail "npm ci failed (see above)." }
Ok "Dependencies installed"

# 4. Secret, folders, database, and the setup key or demo data
Step "Preparing Tamam"
npm run --silent setup -- "--$Mode" --installer
if ($LASTEXITCODE -ne 0) { Fail "Setup failed (see above)." }

# 5. A local install is opened at http://localhost, so session cookies can't require HTTPS.
$envText = Get-Content ".env" -Raw
if ($envText -notmatch "(?m)^INSECURE_COOKIES=") { Add-Content ".env" "`n# Local install: the app is opened over http://localhost. Remove this line when serving over HTTPS.`nINSECURE_COOKIES=1" }
if ($envText -notmatch "(?m)^PORT=") { Add-Content ".env" "PORT=$Port" }

# 6. The browser used to make Arabic PDFs (optional)
if (-not $NoPdf) {
  npx --yes playwright install chromium *> $null
  if ($LASTEXITCODE -eq 0) { Ok "PDF support is ready" } else { Write-Host "  [!] Couldn't download the browser used for PDFs. Everything else works." -ForegroundColor Yellow }
}

# 7. Production build
Step "Building"
npm run --silent build *> $null
if ($LASTEXITCODE -ne 0) { Fail "The build failed. Run 'npm run build' in $Root to see why." }
Ok "Built"

$url = "http://localhost:$Port"
if ($Mode -eq "wizard" -and (Test-Path "data\setup-key.txt")) { $url = "$url/setup?key=$((Get-Content 'data\setup-key.txt' -Raw).Trim())" }

if ($NoStart) {
  Write-Host ""
  Write-Host "  Installed. Start it with:  cd `"$Root`"; npm start" -ForegroundColor Green
  Write-Host "  Then open:  $url"
  Write-Host ""
  exit 0
}

Write-Host ""
Write-Host "  Starting Tamam. Your browser will open at:" -ForegroundColor Green
Write-Host ""
Write-Host "    $url"
Write-Host ""
Write-Host "  Press Ctrl+C to stop. Start it again any time with:  cd `"$Root`"; npm start"
Write-Host ""
Start-Job -ScriptBlock {
  param($p, $u)
  for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-WebRequest "http://localhost:$p/login" -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Seconds 1 }
  }
  Start-Process $u
} -ArgumentList $Port, $url | Out-Null
npm start -- -p $Port
