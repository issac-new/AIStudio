#!/bin/sh
# macOS 双击入口：只启动本地交互培训页，不启动业务服务。
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT"
exec npm run training
