#!/usr/bin/env bash
# Pull-based deploy for Orbit. Run on the server (manually, or from cron/systemd).
#
# It only rebuilds when origin/main has advanced, and only publishes if the
# correctness gates (tests + typecheck/build) pass — so a broken commit never
# reaches the live site. The previous build is backed up for instant rollback.
#
#   ./deploy.sh            # deploy origin/main if there's something new
#   ./deploy.sh --force    # rebuild + deploy even if already up to date
#
# Cron (every 5 min):  */5 * * * * /home/debian/irc/orbit/deploy.sh >> /var/log/orbit-deploy.log 2>&1
set -euo pipefail

REPO="/home/debian/irc/orbit"
WEBROOT="/var/www/tchatou/app"
BRANCH="main"

cd "$REPO"
git fetch --quiet origin "$BRANCH"
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ] && [ "${1:-}" != "--force" ]; then
  echo "$(date -Is) up to date at ${LOCAL:0:8}"
  exit 0
fi

echo "$(date -Is) deploying ${LOCAL:0:8} -> ${REMOTE:0:8}"
git checkout "$BRANCH" --quiet
git pull --ff-only --quiet
npm ci --silent

# Correctness gates — abort the deploy (live site untouched) if anything fails.
npm run test
npm run build

# Publish: keep a one-deep backup, then mirror dist/ into the web root.
sudo rsync -a --delete --backup --backup-dir="${WEBROOT}.bak" dist/ "$WEBROOT/"
echo "$(date -Is) deployed $(git rev-parse --short HEAD)"
