#!/usr/bin/env bash
# extract-feature-cards.sh — 特征卡机械类提取脚本
# 从项目目录自动提取 P0 六项特征卡中机械可提取的 4 项：
#   1. 项目类型（文件类型分布 → 前端/后端/全栈/移动/库）
#   4. 框架列表（复用 detect-frameworks.sh 输出）
#   5. 接口端点数（REST/GraphQL/gRPC/MQ 路由数）
#   11. 可复用稳定单元（导出函数/类/组件计数，按文件类型分组）
# 输出 JSON 到 stdout，供 conf-render.sh 消费或 AI 参考。
# 用法: bash extract-feature-cards.sh <项目目录> [--format json|tsv]
set -u

PROJ="."
FORMAT="json"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --format) FORMAT="${2:?--format 需要 json|tsv}"; shift 2 ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) PROJ="$1"; shift ;;
  esac
done
[[ -d "$PROJ" ]] || { echo "✗ 项目目录不存在: $PROJ" >&2; exit 1; }

BASE="$(cd "$(dirname "${0}")/.." && pwd)"

# ---- 0. 扫描排除链（本脚本全部计数器共用；bash 3.2 数组，免 eval）----
# 原排除只有 node_modules——
# 项目 .venv 的 site-packages 1493 个 .py 全部计入（backend_files 1510 vs 真实 17、
# rest 端点 47 vs 真实 10、units 3326），特征卡→conf 阈值链整链污染。
# 排除链纪律的 Python 形态补齐（node_modules 同族漏修先例）。
FIND_PRUNE=(-not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/site-packages/*' -not -path '*/__pycache__/*' -not -path '*/.tox/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/target/*' -not -path '*/vendor/*')
GREP_EXCLUDES=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=venv --exclude-dir=site-packages --exclude-dir=__pycache__ --exclude-dir=.tox --exclude-dir=dist --exclude-dir=build --exclude-dir=target --exclude-dir=vendor)

# ---- 1. 项目类型判定（文件类型分布）----
vue_files=$(find "$PROJ" -type f -name "*.vue" "${FIND_PRUNE[@]}" 2>/dev/null | wc -l | xargs)
react_files=$(find "$PROJ" -type f \( -name "*.jsx" -o -name "*.tsx" \) "${FIND_PRUNE[@]}" 2>/dev/null | wc -l | xargs)
backend_files=$(find "$PROJ" -type f \( -name "*.py" -o -name "*.java" -o -name "*.go" -o -name "*.rb" -o -name "*.php" \) "${FIND_PRUNE[@]}" 2>/dev/null | wc -l | xargs)
mobile_files=$(find "$PROJ" -type d \( -name "android" -o -name "ios" \) "${FIND_PRUNE[@]}" 2>/dev/null | wc -l | xargs)

project_type="unknown"
if [[ "$vue_files" -gt 0 && "$backend_files" -gt 0 ]]; then
  project_type="fullstack-vue"
elif [[ "$react_files" -gt 0 && "$backend_files" -gt 0 ]]; then
  project_type="fullstack-react"
elif [[ "$vue_files" -gt 0 ]]; then
  project_type="frontend-vue"
elif [[ "$react_files" -gt 0 ]]; then
  project_type="frontend-react"
elif [[ "$backend_files" -gt 0 ]]; then
  project_type="backend"
elif [[ "$mobile_files" -gt 0 ]]; then
  project_type="mobile"
fi

# ---- 4. 框架列表（复用 detect-frameworks.sh）----
frameworks=""
if [[ -f "$BASE/scripts/detect-frameworks.sh" ]]; then
  frameworks=$(bash "$BASE/scripts/detect-frameworks.sh" "$PROJ" 2>/dev/null | grep '^ACTIVE_FRAMEWORKS=' | sed 's/ACTIVE_FRAMEWORKS=(\(.*\))/\1/' | tr -d '"' || true)
fi

# ---- 5. 接口端点数 ----
# REST: @GetMapping/@PostMapping/@RequestMapping/router.get/router.post
rest_endpoints=$(grep -rnE '@GetMapping|@PostMapping|@PutMapping|@DeleteMapping|@RequestMapping|router\.(get|post|put|delete)|app\.(get|post|put|delete)' "$PROJ" \
  --include='*.java' --include='*.kt' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' "${GREP_EXCLUDES[@]}" 2>/dev/null \
  | grep -viE 'example|mock|node_modules|test|Test' | wc -l | xargs || true)
# GraphQL: type Query/Mutation
graphql_ops=$(grep -rnE 'type Query|type Mutation' "$PROJ" --include='*.graphql' --include='*.ts' --include='*.js' "${GREP_EXCLUDES[@]}" 2>/dev/null | wc -l | xargs || true)
# gRPC: rpc 方法
grpc_methods=$(grep -rnE '^[[:space:]]*rpc[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*\(' "$PROJ" --include='*.proto' "${GREP_EXCLUDES[@]}" 2>/dev/null | wc -l | xargs || true)
# MQ: queue/topic 消费
mq_consumers=$(grep -rnE '@KafkaListener|@RabbitListener|@RocketMQMessageListener|@JmsListener|@SqsListener' "$PROJ" --include='*.java' --include='*.kt' "${GREP_EXCLUDES[@]}" 2>/dev/null | wc -l | xargs || true)
total_endpoints=$((rest_endpoints + graphql_ops + grpc_methods + mq_consumers))

# ---- 11. 可复用稳定单元（导出函数/类/组件计数）----
# 前端组件：.vue 文件按文件计（SFC 即组件——script setup 无顶层 export，旧 export 计数法
# 在纯 script-setup Vue3 项目恒 0，nest-forge 实证 4 组件报 0）+ .jsx/.tsx 按导出计
# （export default / export const / export function）
_vue_count=$(find "$PROJ" -name '*.vue' -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' 2>/dev/null | wc -l | xargs || true)
_jsx_count=$(grep -rnE '^export[[:space:]]+(default[[:space:]]+)?(const|function|class|let)' "$PROJ" \
  --include='*.jsx' --include='*.tsx' "${GREP_EXCLUDES[@]}" 2>/dev/null | wc -l | xargs || true)
frontend_components=$((_vue_count + _jsx_count))
# 后端服务/工具：export class/function/def/func（.py/.java/.go）
backend_units=$(grep -rnE '^export[[:space:]]+(class|function|def|func)|^public[[:space:]]+(class|interface)|^def[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*|^func[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*' "$PROJ" \
  --include='*.py' --include='*.java' --include='*.go' --include='*.ts' --include='*.js' "${GREP_EXCLUDES[@]}" 2>/dev/null \
  | grep -viE 'example|mock|node_modules|test|Test' | wc -l | xargs || true)
total_units=$((frontend_components + backend_units))

# ---- 输出 ----
if [[ "$FORMAT" == "json" ]]; then
  cat << EOF
{
  "feature_card_1_project_type": "$project_type",
  "feature_card_1_detail": {
    "vue_files": $vue_files,
    "react_files": $react_files,
    "backend_files": $backend_files,
    "mobile_files": $mobile_files
  },
  "feature_card_4_frameworks": [${frameworks:+"$(echo "$frameworks" | sed 's/ /","/g; s/^/"/; s/$/"/')"}],
  "feature_card_5_endpoints": {
    "rest": $rest_endpoints,
    "graphql": $graphql_ops,
    "grpc": $grpc_methods,
    "mq_consumers": $mq_consumers,
    "total": $total_endpoints
  },
  "feature_card_11_stable_units": {
    "frontend_components": $frontend_components,
    "backend_units": $backend_units,
    "total": $total_units
  }
}
EOF
else
  # TSV 格式（conf-render.sh 消费）
  printf "feature_card_1_project_type\t%s\n" "$project_type"
  printf "feature_card_4_frameworks\t%s\n" "${frameworks:-}"
  printf "feature_card_5_endpoints_total\t%s\n" "$total_endpoints"
  printf "feature_card_11_stable_units_total\t%s\n" "$total_units"
fi
