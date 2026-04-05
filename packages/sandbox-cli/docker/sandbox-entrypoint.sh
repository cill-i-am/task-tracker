#!/bin/sh
set -eu

exec node /usr/local/bin/sandbox-bootstrap.mjs "$@"
