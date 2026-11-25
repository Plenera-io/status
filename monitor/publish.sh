#!/bin/bash
set -euo pipefail

remote=git@github.com:joelstahre/plenera-status-readings.git
ref=refs/heads/main
export GIT_SSH_COMMAND="ssh -F /dev/null -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/etc/plenera-status/github-known-hosts -i ${CREDENTIALS_DIRECTORY}/github-key"

cd "$RUNTIME_DIRECTORY"
git init --quiet --initial-branch=main
previous=$(git ls-remote --refs "$remote" "$ref" | cut -f1)
/usr/bin/node /opt/plenera-status/monitor/probe.mjs > status.json
git add status.json
git -c user.name='Plenera Status Monitor' -c user.email='status-monitor@plenera.io' \
  commit --quiet -m 'Publish current availability'
# Keep only the latest generated snapshot and refuse to overwrite a concurrent publication.
git push --quiet --force-with-lease="$ref:$previous" "$remote" "HEAD:$ref"
printf 'Published %s %s\n' "$(git rev-parse HEAD)" "$(cat status.json)"
