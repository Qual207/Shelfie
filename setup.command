#!/bin/bash
# Shelfie one-shot setup: installs tools, fills .env, sets up Band, starts everything on http://localhost:3000
# Double-click in Finder, or run ./setup.command. Safe to re-run: finished steps are skipped.
set -e
cd "$(dirname "$0")"

# 1. Homebrew + tools
if ! command -v brew >/dev/null; then
  echo "Installing Homebrew (asks for your Mac password)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi
node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a==22&&b>=12)?0:1)'; }
node_ok || { brew install node@22 && brew link --overwrite --force node@22; }
command -v pnpm   >/dev/null || { brew install pnpm@11 && brew link --force pnpm@11; }  # lockfile is pnpm 11
command -v ffmpeg >/dev/null || brew install ffmpeg
echo "node $(node -v), pnpm $(pnpm -v), $(ffmpeg -version | head -1)"

# 2. Dependencies
pnpm install

# 3. .env: prompt (hidden) for any empty value. BAND_API_KEY is only needed until the agents exist.
[ -f .env ] || cp .env.example .env
has() { grep -qE "^$1=.+" .env; }
ask() {
  has "$1" && return 0
  read -rsp "$1 (paste, then Enter; Enter alone skips): " val; echo
  [ -z "$val" ] && return 0
  grep -qE "^$1=" .env || echo "$1=" >> .env
  sed -i '' "s|^$1=.*|$1=$val|" .env
}
ask ZOOWORK_API_KEY
if ! { has STORE_API_KEY && has SHOPPER_API_KEY; }; then
  ask BAND_API_KEY
  has BAND_API_KEY && pnpm band-setup
fi

# 4. Smoke test + start
if has ZOOWORK_API_KEY; then
  pnpm test:zoowork || echo "!! ZooWork test failed (credits/key?) - continuing"
  pnpm test:zoowork litellm/claude-sonnet-5-5 || echo "!! ZooWork vision model test failed - scans need this model (see SETUP.md)"
fi
(sleep 12; open http://localhost:3000/scan) &
if has SHOPPER_API_KEY && has STORE_API_KEY; then
  pnpm demo:dev        # web + store agent + shopper agent
else
  echo "Band keys missing: starting the website only."
  pnpm dev
fi
