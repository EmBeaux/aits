#!/bin/sh
set -eu
node /opt/aits-lab/bootstrap.mjs
exec /docker-entrypoint.sh "$@"
