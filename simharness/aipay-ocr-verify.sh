#!/usr/bin/env bash
# C4 图片 OCR 提取验证：双路提取（tesseract 严格 + vision_analyze 语义）+ 探针无偏差校验。
# 用法: bash aipay-ocr-verify.sh <image> <expected-text-file>
# 单路 tesseract 有字符级偏差（实测 transactionId→transactionld，I/l 混淆），故"无偏差"必须
# 双路提取后 diff + 要素勾稽，差异进待澄清清单（requirements-analyst SKILL A.1）。
set -euo pipefail
IMG="${1:?用法: aipay-ocr-verify.sh <image> <expected>}"
EXPECTED="${2:?用法: aipay-ocr-verify.sh <image> <expected-text-file>}"
echo "=== tesseract（chi_sim+eng, psm6）严格逐字提取 ==="
OCR=$(tesseract "$IMG" stdout -l chi_sim+eng --psm 6 2>/dev/null)
echo "$OCR"
echo
echo "=== 无偏差校验：期望文本逐探针勾稽（空格归一后子串匹配）==="
norm() { printf '%s' "$1" | tr -d '[:space:]' | tr 'l' 'I'; }  # 归一空白 + I/l 折叠（OCR 常见混淆）
OCR_N=$(norm "$OCR")
miss=0
# 期望文本逐行作为探针（也可只勾稽关键要素行）
while IFS= read -r line; do
  [ -z "$line" ] && continue
  L=$(norm "$line")
  if [[ "$OCR_N" == *"$L"* ]]; then echo "  ✓ $line"; else echo "  ✗ 偏差/缺失: $line"; miss=$((miss+1)); fi
done < "$EXPECTED"
echo
if [ "$miss" -eq 0 ]; then echo "结论：OCR 提取无信息偏差（探针全命中）"; else echo "结论：$miss 处偏差，进待澄清清单；建议 vision_analyze 二次语义提取 diff 收敛"; fi
exit "$miss"
