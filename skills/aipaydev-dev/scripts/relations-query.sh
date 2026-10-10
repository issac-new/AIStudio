#!/usr/bin/env bash
# relations-query.sh — 关系边集查询器（执勤侧影响面反查的可执行入口）
#
# 设计动机：relations.jsonl 是机器可查边集（机械 import/声明式映射边 + AI 语义边），
# 但研发期"改实体字段 X 影响哪些 mapper XML / job"只能靠 grep 字符串——没有结构化反查入口。
# 本脚本把边集反查脚本化：按实体类/字段名/mapper XML 反查引用点，输出定位到 file:line。
#
# 用法:
#   bash relations-query.sh <SKILL_DIR> <PROJECT_DIR> [查询模式]
#     --entity <ClassName>        反查：哪些 XML/文件引用了实体 ClassName（data-mapping/mapper-binding 边）
#     --field <property>          反查：哪些 XML 的 resultMap 引用了字段 property（field-mapping 边，改字段影响面）
#     --file <relative-path>      反查：哪些文件依赖该文件（to=该文件 的 from 集）
#     --mapper-xml <path>         反查：该 XML 引用了哪些实体/字段（from=该 XML 的 to 集 + field-mapping 明细）
# 输出: 命中的边行（from/to/kind/evidence 列对齐人读），无命中 exit 0 提示（fail-open）。
# 消费方：流B ②探查（改实体字段/重命名类前查影响面）、spec 影响分析段、数据模型变更配方三查。
# 红线：本脚本只读 relations.jsonl，不重跑提取（提取用 relations-extract.sh）；不猜语义（只查机械边）。
set -uo pipefail

SKILL_DIR=""; PROJ=""; ENTITY=""; FIELD=""; FILE=""; MXML=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --entity)     ENTITY="${2:?--entity 需要类名}"; shift 2 ;;
    --field)      FIELD="${2:?--field 需要字段名}"; shift 2 ;;
    --file)       FILE="${2:?--file 需要相对路径}"; shift 2 ;;
    --mapper-xml) MXML="${2:?--mapper-xml 需要路径}"; shift 2 ;;
    -h|--help)    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) [[ -z "$SKILL_DIR" ]] && SKILL_DIR="$1" || { [[ -z "$PROJ" ]] && PROJ="$1"; }; shift ;;
  esac
done
[[ -n "$SKILL_DIR" && -d "$SKILL_DIR" ]] || { echo "✗ SKILL_DIR 缺失或不存在（目标技能根，含 references/relations.jsonl）" >&2; exit 1; }
E="$SKILL_DIR/references/relations.jsonl"
[[ -f "$E" ]] || { echo "ℹ 无 relations.jsonl（边集未生成——跑 scripts/relations-extract.sh <proj> --skill-dir <skill> 先建边集）"; exit 0; }

# JSONL 行 → 人读行（from → to（kind，evidence））——确定性 sed，零外部依赖
_pretty() {
  sed -E 's/.*"from":"([^"]+)","to":"([^"]+)","kind":"([^"]+)","evidence":"([^"]+)".*/\1 → \2（\3；\4）/'
}

MODE=""
[[ -n "$ENTITY" ]] && MODE="entity"
[[ -n "$FIELD" ]]  && MODE="field"
[[ -n "$FILE" ]]   && MODE="file"
[[ -n "$MXML" ]]   && MODE="mapper-xml"
[[ -n "$MODE" ]] || { echo "✗ 须给一种查询模式（--entity/--field/--file/--mapper-xml 之一）" >&2; sed -n '11,17p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 1; }

case "$MODE" in
  entity)
    # 引用该实体的边（to 尾段是实体类名，或 data-mapping/mapper-binding 的 to 指向该类 .java）
    hits=$(grep -E "\"to\":\"[^\"]*${ENTITY}\\.java\"" "$E" 2>/dev/null | grep -E 'data-mapping|mapper-binding' || true)
    [[ -n "$hits" ]] && { echo "▶ 实体 ${ENTITY} 被以下声明式映射引用（改该类须同步这些 XML）："; printf '%s\n' "$hits" | _pretty; } \
      || echo "ℹ 无边命中实体 ${ENTITY}（无 data-mapping/mapper-binding 边指向它；或是语义边/未被 XML 引用）"
    ;;
  field)
    # field-mapping 边按 property 精确反查（改字段的影响面：哪些 resultMap 引用了该字段；
    # API JSON 暴露字段的契约面=前端调用点/契约测试——spec 四查④）
    hits=$(grep "\"property\":\"${FIELD}\"" "$E" 2>/dev/null || true)
    [[ -n "$hits" ]] && { echo "▶ 字段 ${FIELD} 被以下 resultMap 引用（改该字段须同步这些行）："; printf '%s\n' "$hits" | _pretty; } \
      || echo "ℹ 无边命中字段 ${FIELD}——三支判别：①字段不在实体/schema（拼写？）②字段不在 resultMap（property 列名差异？）③知识缺漏（该 mapper 未提取/边集旧）——先 grep 实体确认字段存在再判缺漏"
    ;;
  file)
    # 依赖该文件的边（to=该文件 的 from 集——"谁依赖我"）
    hits=$(grep "\"to\":\"${FILE}\"" "$E" 2>/dev/null || true)
    [[ -n "$hits" ]] && { echo "▶ 以下文件依赖 ${FILE}（改它须评估这些消费方）："; printf '%s\n' "$hits" | _pretty; } \
      || echo "ℹ 无边命中 ${FILE}（无依赖边指向它；或路径拼写/相对根差异）"
    ;;
  mapper-xml)
    # 该 XML 引用的实体与字段明细（from=该 XML 的 to 集 + field-mapping 的 column=property）
    hits=$(grep "\"from\":\"${MXML}\"" "$E" 2>/dev/null || true)
    [[ -n "$hits" ]] && { echo "▶ ${MXML} 引用的实体/字段（XML 的声明式依赖明细）："; printf '%s\n' "$hits" | _pretty; } \
      || echo "ℹ 无边命中 ${MXML}（该 XML 无提取边；或路径拼写差异）"
    ;;
esac
exit 0
