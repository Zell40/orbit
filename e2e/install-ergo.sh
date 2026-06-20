#!/usr/bin/env bash
# Fetch the Ergo IRCv3 server used by the E2E tests (single static binary).
# Idempotent: does nothing if the pinned version is already present.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)/.bin"
VER="${ERGO_VERSION:-2.18.0}"
BIN="$DIR/ergo-${VER}-linux-x86_64/ergo"
if [ -x "$BIN" ]; then
  echo "ergo ${VER} already installed"
  exit 0
fi
mkdir -p "$DIR"
URL="https://github.com/ergochat/ergo/releases/download/v${VER}/ergo-${VER}-linux-x86_64.tar.gz"
echo "downloading ergo ${VER} ..."
curl -fsSL "$URL" | tar xz -C "$DIR"
echo "ergo ready at ${BIN}"
