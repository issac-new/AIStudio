#!/usr/bin/env bash
# cosign mock（验签成功态）：按门禁契约（cosign verify-blob [--signature <sig>|--bundle <b>]
# <artifact>）解析子命令后恒返回成功，模拟签名有效场景。
# 本机无真实 cosign，工具路径一律用 fixture 内 mock 验证（铁律⑤）。
set -u
sub="${1:-}"
[[ "$sub" == "verify-blob" ]] || exit 2
exit 0
