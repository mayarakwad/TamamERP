#!/usr/bin/env bash
# Tamam · تمام: one-step installer for macOS and Linux.
#
#   curl -fsSL https://github.com/mayarakwad/TamamERP/releases/latest/download/install.sh | bash
#
# or, from a downloaded copy of Tamam:   bash install/install.sh
#
# Options:
#   --demo           start with the demo workspaces instead of the setup wizard
#   --dir <folder>   where to put Tamam when downloading it (default: ./tamam)
#   --version <tag>  which release to download (default: the latest)
#   --port <number>  port for the web server (default: 3000)
#   --no-pdf         skip downloading the browser used to make PDFs
#   --no-start       install only; don't start the server
#   --background     start the server in the background and return
set -euo pipefail
export PRISMA_HIDE_UPDATE_MESSAGE=1 NEXT_TELEMETRY_DISABLED=1

REPO="mayarakwad/TamamERP"
DIR="tamam"
VERSION=""
PORT="3000"
MODE="wizard"
PDF=1
START=1
BACKGROUND=0

while [ $# -gt 0 ]; do
  case "$1" in
    --demo) MODE="demo" ;;
    --dir) DIR="$2"; shift ;;
    --version) VERSION="$2"; shift ;;
    --port) PORT="$2"; shift ;;
    --no-pdf) PDF=0 ;;
    --no-start) START=0 ;;
    --background) BACKGROUND=1 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)"; exit 1 ;;
  esac
  shift
done

bold() { printf '\033[1m%s\033[0m' "$1"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\n  \033[31m✗ %s\033[0m\n\n' "$1"; exit 1; }

printf '\n%s  installer\n' "$(bold 'Tamam · تمام')"

# 1. Node.js 22 or newer
step "Checking your computer"
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js isn't installed. Install Node.js 22 or newer from https://nodejs.org (or: brew install node), then run this again."
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  fail "Node.js $(node -v) is too old. Tamam needs Node.js 22 or newer: https://nodejs.org"
fi
ok "Node.js $(node -v)"
command -v npm >/dev/null 2>&1 || fail "npm isn't available. It comes with Node.js: https://nodejs.org"
ok "npm $(npm -v)"

# 2. The code: use this folder if it's Tamam, otherwise download a release.
is_tamam() { [ -f "$1/package.json" ] && grep -q '"name": "tamam"' "$1/package.json"; }
if is_tamam "."; then
  ROOT="$(pwd)"
elif is_tamam ".."; then
  ROOT="$(cd .. && pwd)"
else
  step "Downloading Tamam"
  command -v curl >/dev/null 2>&1 || fail "curl is needed to download Tamam."
  command -v tar >/dev/null 2>&1 || fail "tar is needed to unpack Tamam."
  if [ -z "$VERSION" ]; then
    VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1 || true)"
  fi
  if [ -e "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
    is_tamam "$DIR" || fail "The folder '$DIR' already exists and isn't Tamam. Choose another with --dir."
    ok "Using the existing copy in $DIR"
  else
    mkdir -p "$DIR"
    if [ -n "$VERSION" ]; then URL="https://github.com/$REPO/archive/refs/tags/$VERSION.tar.gz"; else URL="https://github.com/$REPO/archive/refs/heads/main.tar.gz"; VERSION="main"; fi
    curl -fsSL "$URL" | tar -xz -C "$DIR" --strip-components=1 || fail "Couldn't download $URL"
    ok "Tamam $VERSION downloaded to $DIR"
  fi
  ROOT="$(cd "$DIR" && pwd)"
fi
cd "$ROOT"

# 3. Dependencies
step "Installing (this takes a few minutes the first time)"
npm ci --no-audit --no-fund --loglevel=error
ok "Dependencies installed"

# 4. Secret, folders, database, and the setup key or demo data
step "Preparing Tamam"
npm run --silent setup -- "--$MODE" --installer

# 5. A local install is opened at http://localhost, so session cookies can't require HTTPS.
if ! grep -q '^INSECURE_COOKIES=' .env; then
  printf '\n# Local install: the app is opened over http://localhost. Remove this line when serving over HTTPS.\nINSECURE_COOKIES=1\n' >> .env
fi
if ! grep -q '^PORT=' .env; then printf 'PORT=%s\n' "$PORT" >> .env; fi

# 6. The browser used to make Arabic PDFs (optional)
if [ "$PDF" = "1" ]; then
  if npx --yes playwright install chromium >/dev/null 2>&1; then ok "PDF support is ready"; else printf '  \033[33m!\033[0m %s\n' "Couldn't download the browser used for PDFs. Everything else works; see README → Deploying."; fi
fi

# 7. Production build
step "Building"
npm run --silent build >/dev/null
ok "Built"

URL="http://localhost:$PORT"
if [ "$MODE" = "wizard" ] && [ -f data/setup-key.txt ]; then URL="$URL/setup?key=$(tr -d '[:space:]' < data/setup-key.txt)"; fi

open_browser() {
  for _ in $(seq 1 60); do
    if curl -fs -o /dev/null "http://localhost:$PORT/login" 2>/dev/null || curl -fs -o /dev/null "http://localhost:$PORT/setup" 2>/dev/null; then break; fi
    sleep 1
  done
  if command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true; fi
}

LINE="────────────────────────────────────────────────────────────────"
if [ "$START" = "0" ]; then
  printf '\n%s\n  \033[32mInstalled.\033[0m Start it with:  cd "%s" && npm start\n  Then open:  %s\n%s\n\n' "$LINE" "$ROOT" "$URL" "$LINE"
  exit 0
fi

if [ "$BACKGROUND" = "1" ]; then
  nohup npm start -- -p "$PORT" > data/server.log 2>&1 &
  echo $! > data/server.pid
  open_browser
  printf '\n%s\n  \033[32mTamam is running.\033[0m Open:  %s\n  Logs: %s/data/server.log   Stop: kill $(cat "%s/data/server.pid")\n%s\n\n' "$LINE" "$URL" "$ROOT" "$ROOT" "$LINE"
  exit 0
fi

printf '\n%s\n  \033[32mStarting Tamam.\033[0m Your browser will open at:\n\n    %s\n\n  Press Ctrl+C to stop. Start it again any time with:  cd "%s" && npm start\n%s\n\n' "$LINE" "$URL" "$ROOT" "$LINE"
open_browser &
exec npm start -- -p "$PORT"
