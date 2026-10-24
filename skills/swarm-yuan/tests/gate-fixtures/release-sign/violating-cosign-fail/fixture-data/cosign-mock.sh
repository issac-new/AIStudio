#!/usr/bin/env bash
# cosign mock（验签失败态）：按门禁契约（cosign verify-blob [--signature <sig>|--bundle <b>]
# <artifact>）解析子命令后恒返回失败，模拟签名无效/密钥不匹配场景。
# 本机无真实 cosign，工具路径一律用 fixture 内 mock 验证（铁律⑤）。
set -u
sub="${1:-}"
[[ "$sub" == "verify-blob" ]] || exit 2
echo "mock-cosign: signature verification failed (invalid signature)" >&2
exit 1
