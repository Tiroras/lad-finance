#!/bin/sh
set -eu

export PATH="/workspace/docker/bin:$PATH"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djava.net.preferIPv4Stack=true -Dfile.encoding=UTF-8"
export MAESTRO_CLI_NO_ANALYTICS=1

exec sh /usr/local/bin/lad-entrypoint "$@"
