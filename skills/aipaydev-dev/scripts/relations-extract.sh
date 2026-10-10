#!/usr/bin/env bash
# relations-extract.sh — 机器可读关系边集提取（核心链条①"结构关系认知"的索引层）
# 机械提取确定性依赖边 → <skill>/references/relations.jsonl（每行 {"from","to","kind","evidence"}），
# AI 在此初稿上补语义边（kind: call/route/message/ipc/export/job-flow——调用/路由/消息/IPC/库导出/批处理装配）。
# 注意：HTTP/JSON 契约面不在机械提取面——字段改名的契约面反查见 spec 四查④（前端调用点/契约测试）。
# 消费方：--stable-diff 1 跳下游传播（gates-warn 优先读边集）、流B ②探查查边集替代读 mermaid 图。
#
# 提取范围（确定性 grep+相对路径解析，零外部依赖全平台可用——madge/graphify 深度层由 AI
# 按 exploration-guide §D 工具矩阵富化，本脚本不假装接线未装工具）：
#   TS/JS/Vue: import/require/export-from 的相对说明符（./ ../），扩展名/index 解析
#   Python:    from .x / from ..x 相对导入（绝对导入按根目录+同目录 best-effort）
#   Go:        go.mod module 前缀的工程内 import → 目录
#   Java:      import a.b.C; → src/{main,test}/java/a/b/C.java
#   MyBatis:   *Mapper.xml 的 namespace→Mapper 接口（mapper-binding 边）、
#              resultMap type/resultType/parameterType→实体（data-mapping 边）、
#              resultMap 内 <result column= property=→实体字段明细（field-mapping 边，
#              evidence 带 column=property 与行号——改字段的影响面反查定位到行）——
#              字符串耦合点编译不报错（漏改字段即静默缺陷），必须进边集供影响面反查
#   Spring:    beans XML 的 <bean class="a.b.C">→Java 类（bean-wiring 边）
#   JPA/Hib:   orm.xml <entity class=> / *.hbm.xml <class name=>→实体（data-mapping 边）
#              ——同属 XML↔Java 字符串耦合，同款补齐
#
# 用法:
#   bash relations-extract.sh <PROJECT_DIR> [--skill-dir <dir>] [--out <file>] [--max-edges <N>]
#   bash relations-extract.sh <PROJECT_DIR> --verify [--skill-dir <dir>]   # 边抽样核验（advisory）
#     --skill-dir  目标技能根（缺省 --out 无效时默认 <skill>/references/relations.jsonl 的推导路径）
#     --out        输出路径（缺省 <skill-dir>/references/relations.jsonl；无 --skill-dir 则报错）
#     --max-edges  边数上限（默认 2000，超出截断并在 stderr 披露）
# 输出: JSONL 边行（from/to 为项目相对路径，确定性排序）；--verify 输出 RELATION_MISS 行（advisory，exit 0 fail-open）。
# 红线：机械层只出确定性边（证据=说明符原文+行号）；短名映射多命中不出边、语义边（call/route/job-flow/...）AI 补——机械不猜。
set -uo pipefail

PROJ=""; SKILL_DIR=""; OUT=""; VERIFY=0; MAXE=2000
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill-dir)  SKILL_DIR="${2:?--skill-dir 需要路径}"; shift 2 ;;
    --out)        OUT="${2:?--out 需要路径}"; shift 2 ;;
    --verify)     VERIFY=1; shift ;;
    --max-edges)  MAXE="${2:?--max-edges 需要数值}"; shift 2 ;;
    -h|--help)    sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) [[ -z "$PROJ" ]] && PROJ="$1" || { echo "未知参数: $1" >&2; exit 1; }; shift ;;
  esac
done
[[ -n "$PROJ" && -d "$PROJ" ]] || { echo "✗ PROJECT_DIR 缺失或不存在: ${PROJ:-（空）}" >&2; exit 1; }
PROJ=$(cd "$PROJ" && pwd)
if [[ -z "$OUT" ]]; then
  [[ -n "$SKILL_DIR" ]] || { echo "✗ 需 --skill-dir 或 --out 之一" >&2; exit 1; }
  OUT="$SKILL_DIR/references/relations.jsonl"
fi

# --- --verify：边抽样核验（from/to 路径存在性 + 最多 20 条抽样）---
if [[ "$VERIFY" -eq 1 ]]; then
  [[ -f "$OUT" ]] || { echo "ℹ 无 relations.jsonl（边集未生成——探查期可选产物，跳过核验）"; exit 0; }
  _total=$(LC_ALL=C grep -c . "$OUT" 2>/dev/null || true); _total="${_total:-0}"
  [[ "$_total" -eq 0 ]] && { echo "ℹ relations.jsonl 为空（无边可核）"; exit 0; }
  _miss=0 _checked=0
  # 均匀抽样 ≤20 条（步长 = total/20 向上取整），bash 3.2 安全
  _step=$(( (_total + 19) / 20 )); [[ "$_step" -lt 1 ]] && _step=1
  _i=0
  while IFS= read -r _line; do
    [[ -z "$_line" ]] && continue
    _i=$((_i + 1))
    [[ $(( _i % _step )) -eq 0 || "$_i" -eq 1 ]] || continue
    _checked=$((_checked + 1))
    _from=$(printf '%s' "$_line" | sed -n 's/.*"from":"\([^"]*\)".*/\1/p')
    _to=$(printf '%s' "$_line" | sed -n 's/.*"to":"\([^"]*\)".*/\1/p')
    if [[ -n "$_from" && ! -f "$PROJ/$_from" ]]; then
      echo "RELATION_MISS	from 路径不存在: ${_from}（relations.jsonl 边集失锚，重跑 relations-extract.sh）"
      _miss=$((_miss + 1))
    fi
    if [[ -n "$_to" && ! -f "$PROJ/$_to" && ! -d "$PROJ/$_to" ]]; then
      echo "RELATION_MISS	to 路径不存在: ${_to}（relations.jsonl 边集失锚，重跑 relations-extract.sh）"
      _miss=$((_miss + 1))
    fi
  done < "$OUT"
  if [[ "$_miss" -eq 0 ]]; then
    echo "✓ 关系边集抽样核验通过（${_checked}/${_total} 条，0 失锚）"
  else
    echo "⚠ 关系边集抽样 ${_checked} 条中 ${_miss} 处失锚（advisory：重跑 relations-extract.sh 重建）"
  fi
  exit 0
fi

# --- 提取模式 ---
mkdir -p "$(dirname "$OUT")"
TMPF=$(mktemp /tmp/relx.XXXXXX)
trap 'rm -f "$TMPF"' EXIT

# 规范化项目相对路径（去掉 ./、解析 ../）——bash 3.2 安全的字符串处理
_norm_rel() { # $1=基准目录(相对根) $2=说明符 → stdout 相对路径（未验证存在）
  local base="$1" spec="$2"
  local dir="$base"
  local rest="$spec"
  # 逐段消化 ./ 与 ../
  while [[ "$rest" == .* ]]; do
    case "$rest" in
      ./*)  rest="${rest#./}" ;;
      ../*) base=$(dirname "$base"); dir="$base"; rest="${rest#../}" ;;
      *)    break ;;
    esac
  done
  # 单层 ../ 场景 dir 归为 "."，
  # 原输出拼成 "./src/x"——与 src/ 下同目标边的 to 键失配（stable-diff 反查/查边集
  # 按路径对账时断链）。顶层前缀不进输出；多级 ../ 语义不变。
  [[ "$dir" == "." ]] && dir=""
  printf '%s' "${dir:+$dir/}${rest}"
}

# 相对说明符解析：尝试扩展名/index 候选，存在即输出首个命中（相对项目根的规范串）
_resolve() { # $1=规范化路径前缀（无扩展名） → stdout 命中路径 或 空
  local p="$1" c cand
  for c in "" ".ts" ".tsx" ".js" ".jsx" ".mjs" ".cjs" ".vue" ".py" "/index.ts" "/index.tsx" "/index.js" "/index.jsx" "/index.vue" "/__init__.py"; do
    cand="${p}${c}"
    [[ -f "$PROJ/$cand" ]] && { printf '%s' "$cand"; return 0; }
  done
  return 1
}

_emit() { # $1=from $2=to $3=evidence → 追加到 TMPF
  printf '{"from":"%s","to":"%s","kind":"import","evidence":"%s"}\n' "$1" "$2" "$3" >> "$TMPF"
}

# Go module 清单（前后端同仓形态 go.mod 在 server/ 等子目录，原单点 "$PROJ/go.mod"
# 发现让 GO_MODULE 恒空、Go 工程内边全漏——与 Java 源根发现同族「解析基准假设 PROJ 根」。
# 多 go.mod 各自带 module 名与基准目录（go.mod 所在目录），确定性排序逐个匹配）
_GOMODS_T=$(mktemp /tmp/relx.gomods.XXXXXX)
find "$PROJ" \( -type d \( -name node_modules -o -name target -o -name .git -o -name dist -o -name .venv -o -name venv -o -name __pycache__ -o -name .tox -o -name vendor -o -name .swarm-yuan \) -prune \) -o -type f -name go.mod -print 2>/dev/null \
  | LC_ALL=C sort > "${_GOMODS_T}.abs"
while IFS= read -r _gm; do
  [[ -z "$_gm" ]] && continue
  _mod=$(sed -n 's/^module[[:space:]][[:space:]]*\([^[:space:]][^[:space:]]*\).*/\1/p' "$_gm" | head -1)
  [[ -z "$_mod" ]] && continue
  _base="${_gm#"$PROJ"/}"
  _base="${_base%go.mod}"; _base="${_base%/}"   # 根级 go.mod 剥后为空串；子目录为 server
      printf '%s %s\n' "$_mod" "$_base" >> "$_GOMODS_T"   # 空格分隔：module 名/路径均不含空格，read -r 双字段安全拆
done < "${_GOMODS_T}.abs"
rm -f "${_GOMODS_T}.abs"

# --- 逐文件提取（bash 循环 + grep；上限保护由 find | head 承担）---
_src_files=$(find "$PROJ" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.mjs' -o -name '*.vue' -o -name '*.py' -o -name '*.php' -o -name '*.rb' \) \
  -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/vendor/*' -not -path '*/__pycache__/*' -not -path '*/.tox/*' -not -path '*/.swarm-yuan/*' \
  -print 2>/dev/null | LC_ALL=C sort | head -3000)

while IFS= read -r f_abs; do
  [[ -z "$f_abs" ]] && continue
  f_rel="${f_abs#"$PROJ"/}"
  f_dir=$(dirname "$f_rel")
  case "$f_rel" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.vue)
      # import ... from './x' / require('./x') / export ... from './x' / import './x'
      # 说明符提取：行内最后一个引号串（BSD sed 无交替，取通用引号串后由 case 过滤相对前缀）
      while IFS= read -r hit; do
        [[ -z "$hit" ]] && continue
        ln="${hit%%:*}"; stmt="${hit#*:}"
        # 行内最后一个引号串 = 说明符（贪婪 .* 取最右；字符类含单/双引号，BSD sed 安全）
        spec=$(printf '%s' "$stmt" | sed -n "s/.*['\"]\([^'\"]*\)['\"].*/\1/p")
        case "$spec" in
          ./*|../*) ;;
          *) continue ;;
        esac
        norm=$(_norm_rel "$f_dir" "$spec")
        resolved=$(_resolve "$norm") || continue
        [[ "$resolved" == "$f_rel" ]] && continue
        _emit "$f_rel" "$resolved" "import@${f_rel}:${ln}"
      # 回归 2026-09-10：原模式要求引号紧跟 require/from/import，
      # CommonJS 的 require('./x') 带左括号永不命中——CommonJS 项目 0 边。加 \(? 容许括号。
      done < <(grep -nE "(from|require|import)[[:space:]]*\(?[[:space:]]*[\"'][.][./][^\"']*[\"']" "$f_abs" 2>/dev/null || true)
      ;;
    *.py)
      # from .x import y / from ..x import y（相对导入机械可靠；绝对导入见下方分支）
      while IFS= read -r hit; do
        [[ -z "$hit" ]] && continue
        ln="${hit%%:*}"; stmt="${hit#*:}"
        spec=$(printf '%s' "$stmt" | sed -n 's/^[[:space:]]*from[[:space:]][[:space:]]*\(\.[.A-Za-z_][.A-Za-z_0-9]*\)[[:space:]][[:space:]]*import.*/\1/p')
        [[ -z "$spec" ]] && continue
        # 点段消化：. → 本目录；.. → 上级；模块名 → <dir>/<mod>.py 或 <dir>/<mod>/__init__.py
        dir="$f_dir"; mod=""
        dots="${spec%%[!.]*}"; rest="${spec#"$dots"}"
        ndots=${#dots}
        i=1
        while [[ $i -lt $ndots ]]; do dir=$(dirname "$dir"); i=$((i+1)); done
        [[ -n "$rest" ]] && mod=$(printf '%s' "$rest" | tr '.' '/')
        base="$dir"; [[ -n "$mod" ]] && base="$dir/$mod"
        resolved=$(_resolve "$base") || continue
        [[ "$resolved" == "$f_rel" ]] && continue
        _emit "$f_rel" "$resolved" "import@${f_rel}:${ln}"
      done < <(grep -nE '^[[:space:]]*from[[:space:]]+\.[.A-Za-z_][.A-Za-z_0-9]*[[:space:]]+import' "$f_abs" 2>/dev/null || true)
      # 绝对导入提取。
      # 原实现只认相对导入（原注释声称「绝对导入 best-effort 根解析」但无对应分支）——
      # FastAPI/Django 等绝对导入主流项目（PEP 8 推荐）import 边恒 0。
      # 机械可靠版与 Go module 前缀剥离同构：包路径 a.b → a/b，_resolve 试探
      # a/b.py 与 a/b/__init__.py，存在即边；项目外顶层包（标准库/第三方）自然 miss 不误报。
      while IFS= read -r hit; do
        [[ -z "$hit" ]] && continue
        ln="${hit%%:*}"; stmt="${hit#*:}"
        spec=$(printf '%s' "$stmt" | sed -n 's/^[[:space:]]*from[[:space:]][[:space:]]*\([A-Za-z_][A-Za-z_0-9.]*\)[[:space:]][[:space:]]*import.*/\1/p')
        if [[ -n "$spec" ]]; then
          # from X.Y import A：候选 X/Y（模块本身）与 X/Y/A（A 为子模块时）
          modpath=$(printf '%s' "$spec" | tr '.' '/')
          resolved=$(_resolve "$modpath") || resolved=""
          if [[ -n "$resolved" && "$resolved" != "$f_rel" ]]; then
            _emit "$f_rel" "$resolved" "import@${f_rel}:${ln}"
          fi
          first=$(printf '%s' "$stmt" | sed -n 's/^[[:space:]]*from[[:space:]][[:space:]]*[A-Za-z_][A-Za-z_0-9.]*[[:space:]][[:space:]]*import[[:space:]][[:space:]]*\([A-Za-z_][A-Za-z_0-9]*\).*/\1/p')
          # 子模块候选须磁盘精确名命中（find -name 大小写敏感，不吃 FS case-insensitive 红利）——
          # macOS/APFS 下 `from app.models import User` 不得误命中 user.py 并 emit 失真大写路径。
          if [[ -n "$first" && "$first" != "*" && -d "$PROJ/$modpath" ]]; then
            resolved=$(LC_ALL=C find "$PROJ/$modpath" -maxdepth 1 -name "$first.py" 2>/dev/null | head -1)
            resolved="${resolved#"$PROJ"/}"
            [[ -n "$resolved" && "$resolved" != "$f_rel" ]] && _emit "$f_rel" "$resolved" "import@${f_rel}:${ln}"
          fi
        else
          # import X.Y[.Z]（无 from）
          spec=$(printf '%s' "$stmt" | sed -n 's/^[[:space:]]*import[[:space:]][[:space:]]*\([A-Za-z_][A-Za-z_0-9.]*\).*/\1/p')
          [[ -z "$spec" ]] && continue
          modpath=$(printf '%s' "$spec" | tr '.' '/')
          resolved=$(_resolve "$modpath") || continue
          [[ "$resolved" == "$f_rel" ]] && continue
          _emit "$f_rel" "$resolved" "import@${f_rel}:${ln}"
        fi
      done < <(grep -nE '^[[:space:]]*(from[[:space:]]+[A-Za-z_][A-Za-z_0-9.]*[[:space:]]+import|import[[:space:]]+[A-Za-z_])' "$f_abs" 2>/dev/null || true)
      ;;
    *.php)
      # PHP 提取缺位——require/include 相对
      # 引用与 use 命名空间是 PHP 的 import 等价物。机械可靠子集两支（诚实留白不猜）：
      # ① require|require_once|include|include_once 的相对/__DIR__ 路径 → 文件解析；
      # ② use Foo\Bar\ClassName; → 全项目 ClassName.php 唯一命中才发边（PSR-4 类名=文件名语义；
      #    重名/不可解不发边）；变量拼接/绝对路径/流包装不解析。
      while IFS= read -r hit; do
        [[ -z "$hit" ]] && continue
        ln="${hit%%:*}"; stmt="${hit#*:}"
        spec=$(printf '%s' "$stmt" | sed -n "s/.*['\"]\([^'\"]*\.php\)['\"].*/\1/p")
        [[ -z "$spec" ]] && continue
        case "$spec" in
          \$*) continue ;;
        esac
        # PHP 语义：`__DIR__ . '/x.php'` 的前导 / 是相对本目录拼接段，先剥再判绝对路径
        case "$stmt" in *__DIR__*) spec="${spec#/}" ;; esac
        case "$spec" in
          /*) continue ;;
        esac
        spec="${spec#./}"
        norm=$(_norm_rel "$f_dir" "$spec")
        resolved=$(_resolve "$norm") || continue
        [[ "$resolved" == "$f_rel" ]] && continue
        _emit "$f_rel" "$resolved" "import@${f_rel}:${ln}"
      done < <(grep -nE "(require|require_once|include|include_once)[^;]*[\"'][^\"']*\.php[\"']" "$f_abs" 2>/dev/null || true)
      while IFS= read -r hit; do
        [[ -z "$hit" ]] && continue
        ln="${hit%%:*}"; stmt="${hit#*:}"
        ns=$(printf '%s' "$stmt" | sed -n 's/^[[:space:]]*use[[:space:]][[:space:]]*\([A-Za-z_][A-Za-z_0-9\\]*\);.*/\1/p')
        [[ -z "$ns" ]] && continue
        cls="${ns##*\\}"
        [[ -z "$cls" ]] && continue
        cand=$(LC_ALL=C find "$PROJ" -type f -name "${cls}.php" -not -path '*/vendor/*' -not -path '*/.git/*' 2>/dev/null)
        cnt=$(printf '%s\n' "$cand" | grep -c . || true)
        [[ "$cnt" == "1" ]] || continue
        resolved="${cand#"$PROJ"/}"
        [[ "$resolved" == "$f_rel" || -z "$resolved" ]] && continue
        _emit "$f_rel" "$resolved" "import@${f_rel}:${ln}"
      done < <(grep -nE '^[[:space:]]*use[[:space:]]+[A-Za-z_]' "$f_abs" 2>/dev/null || true)
      ;;
    *.rb)
      # Ruby 提取缺位——require_relative 与
      # require './x' 是 Ruby 的相对引用等价物（镜像 PHP 分支语义）。绝对 gem require（如
      # require 'rack'）是第三方依赖不发边；vendor/（bundle install --path）已由排除链剪掉。
      # require_relative 无扩展名语义：'x' → x.rb 或 x/x.rb（Ruby autoload 目录约定）
      while IFS= read -r hit; do
        [[ -z "$hit" ]] && continue
        ln="${hit%%:*}"; stmt="${hit#*:}"
        spec=$(printf '%s' "$stmt" | sed -n "s/.*['\"]\([^'\"]*\)['\"].*/\1/p")
        [[ -z "$spec" ]] && continue
        case "$spec" in
          ./*|../*) ;;
          *) continue ;;
        esac
        resolved=""
        norm=$(_norm_rel "$f_dir" "$spec")
        resolved=$(_resolve "$norm") || resolved=""
        if [[ -z "$resolved" ]]; then
          # Ruby 无扩展名：试 <norm>.rb 与 <norm>/<basename>.rb（目录约定）
          if [[ -f "$PROJ/$norm.rb" ]]; then
            resolved="$norm.rb"
          elif [[ -d "$PROJ/$norm" ]]; then
            _rb_base=$(basename "$norm")
            if [[ -f "$PROJ/$norm/$_rb_base.rb" ]]; then
              resolved="$norm/$_rb_base.rb"
            fi
          fi
        fi
        [[ -z "$resolved" || "$resolved" == "$f_rel" ]] && continue
        _emit "$f_rel" "$resolved" "import@${f_rel}:${ln}"
      done < <(grep -nE "(require_relative|require)[[:space:]]*\(?[[:space:]]*[\"'][.][./][^\"']*[\"']" "$f_abs" 2>/dev/null || true)
      # require_relative 裸名（'helper' 无 ./ 前缀）是 Ruby 最常见形态——单独提桶
      while IFS= read -r hit; do
        [[ -z "$hit" ]] && continue
        ln="${hit%%:*}"; stmt="${hit#*:}"
        spec=$(printf '%s' "$stmt" | sed -n "s/.*['\"']\([^'\"]*\)['\"'].*/\1/p")
        [[ -z "$spec" ]] && continue
        case "$spec" in
          ./*|../*|/*|*) ;;
        esac
        # 裸名=相对当前文件目录（require_relative 语义）
        norm=$(_norm_rel "$f_dir" "$spec")
        resolved=""
        if [[ -f "$PROJ/$norm.rb" ]]; then
          resolved="$norm.rb"
        elif [[ -d "$PROJ/$norm" ]]; then
          _rb_b=$(basename "$norm")
          if [[ -f "$PROJ/$norm/$_rb_b.rb" ]]; then resolved="$norm/$_rb_b.rb"; fi
        fi
        [[ -z "$resolved" || "$resolved" == "$f_rel" ]] && continue
        _emit "$f_rel" "$resolved" "import@${f_rel}:${ln}"
      done < <(grep -nE "require_relative[[:space:]]*[[:space:]]*[\"'][A-Za-z_][^\"']*[\"']" "$f_abs" 2>/dev/null | grep -v '\./' || true)
      ;;
  esac
done <<< "$_src_files"

# Go 工程内 import（module 前缀剥离 → go.mod 基准目录下目录存在即边；多模块遍历）
if [[ -s "$_GOMODS_T" ]]; then
  while IFS= read -r f_abs; do
    [[ -z "$f_abs" ]] && continue
    f_rel="${f_abs#"$PROJ"/}"
    while read -r _mod _base; do   # 双字段拆分读取——不可置空 IFS（IFS= 会禁用字段的空格拆分）
      [[ -z "${_mod:-}" ]] && continue
      while IFS= read -r hit; do
        [[ -z "$hit" ]] && continue
        ln="${hit%%:*}"; stmt="${hit#*:}"
        spec=$(printf '%s' "$stmt" | sed -n "s|.*\"${_mod}/\([^\"]*\)\".*|\\1|p")
        [[ -z "$spec" ]] && continue
        target="${_base:+${_base}/}${spec}"
        [[ -d "$PROJ/$target" ]] || continue
        [[ "$target" == "$f_rel" ]] && continue
        _emit "$f_rel" "$target" "import@${f_rel}:${ln}"
      done < <(grep -nF "\"${_mod}/" "$f_abs" 2>/dev/null || true)
    done < "$_GOMODS_T"
  done < <(find "$PROJ" -type f -name '*.go' -not -path '*/.git/*' -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/vendor/*' -not -path '*/__pycache__/*' -not -path '*/.tox/*' -print 2>/dev/null | LC_ALL=C sort | head -1500)
fi

# Rust use 语句 → 工程内模块路径。
# 原实现只覆盖 TS/JS-Vue/Python/Go/Java 四族——Rust 项目实测 0 边，影响面反查空转。
# 解析（机械初稿，低估方向安全，未解析形态留给 AI 语义边）：
#   crate::a::b::C → src/a/b.rs 或 src/a/b/mod.rs（lib.rs 是 crate 根）
#   super::x       → 当前文件所在模块目录的同名兄弟（src/api/tasks.rs 的 super::conn → src/api/conn.rs）
#   self::x        → 同目录
#   crate::{a,b} / 嵌套 use 不展开（低估不虚报）
while IFS= read -r f_abs; do
  [[ -z "$f_abs" ]] && continue
  f_rel="${f_abs#"$PROJ"/}"
  f_dir="${f_rel%/*}"
  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    ln="${hit%%:*}"; stmt="${hit#*:}"
    # G22 铁律：BSD sed BRE 不认 \|交替——一律 sed -E + (crate|super|self)
    use_path=$(printf '%s' "$stmt" | sed -E -n 's/^[[:space:]]*use[[:space:]][[:space:]]*(crate|super|self)::([A-Za-z_][A-Za-z_0-9:]*).*/\1|\2/p')
    [[ -z "$use_path" ]] && continue
    use_kind="${use_path%%|*}"
    use_mod="${use_path#*|}"
    use_mod="${use_mod%%::*}"        # 首段模块（a::b::C → a）
    [[ -z "$use_mod" ]] && continue
    # crate 根=文件所在 src/ 目录（backend/src/main.rs → backend/src）——
    # 原硬编码 PROJ 根 src/ 使同仓形态 Rust 边全漏（与 Java 源根/Go module 清单同族）。
    # 根级形态（src/ 直接在项目根）保持原行为。
    case "$f_rel" in
      */src/*) _crate_src="${f_rel%%/src/*}/src" ;;
      *)       _crate_src="src" ;;
    esac
    case "$use_kind" in
      crate) cands="${_crate_src}/${use_mod}.rs ${_crate_src}/${use_mod}/mod.rs" ;;
      super) cands="${f_dir}/${use_mod}.rs ${f_dir}/${use_mod}/mod.rs" ;;
      self)  cands="${f_dir}/${use_mod}.rs ${f_dir}/${use_mod}/mod.rs" ;;
    esac
    for cand in $cands; do
      [[ -f "$PROJ/$cand" ]] || continue
      [[ "$cand" == "$f_rel" ]] && break
      _emit "$f_rel" "$cand" "import@${f_rel}:${ln}"
      break
    done
  done < <(grep -nE '^[[:space:]]*use[[:space:]][[:space:]]*(crate|super|self)::' "$f_abs" 2>/dev/null || true)
done < <(find "$PROJ" -type f -name '*.rs' -not -path '*/.git/*' -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/vendor/*' -not -path '*/__pycache__/*' -not -path '*/.tox/*' -not -path '*/target/*' -print 2>/dev/null | LC_ALL=C sort | head -1500)

# Java 源根发现（前后端同仓形态下 Java 根在 backend/ 等子目录，
# 硬编码 src/main/java 会让 Java import/mapper-binding/data-mapping 全链边集为零）。
# 发现规则：*/src/{main,test}/java 目录，剪掉 node_modules/target/.git/dist/venv/.venv/build 噪音，
# 相对路径确定性排序——首个命中即用（FQCN 已全限定，无猜测成分）。
_JAVA_ROOTS_T=$(mktemp /tmp/relx.jroots.XXXXXX)
find "$PROJ" \( -type d \( -name node_modules -o -name target -o -name .git -o -name dist -o -name .venv -o -name venv -o -name __pycache__ -o -name .tox -o -name venv -o -name .venv -o -name build -o -name .swarm-yuan \) -prune \) -o -type d -path '*/src/*/java' -print 2>/dev/null \
  | LC_ALL=C sort | sed "s|^$PROJ/||" > "$_JAVA_ROOTS_T"

# Java 包路径映射 import（任一 Java 源根下 <pkg>/<Class>.java 存在即边）
while IFS= read -r hit; do
  [[ -z "$hit" ]] && continue
  f_rel="${hit%%|*}"
  rest="${hit#*|}"                       # 绝对路径:行号:内容
  ln=$(printf '%s' "$rest" | cut -d: -f2)
  imp=$(printf '%s' "$rest" | sed -n 's/.*import[[:space:]][[:space:]]*\([a-z][a-zA-Z0-9_.]*\);.*/\1/p')
  [[ -z "$imp" ]] && continue
  pkgpath=$(printf '%s' "$imp" | tr '.' '/')
  while IFS= read -r root; do
    [[ -z "$root" ]] && continue
    if [[ -f "$PROJ/$root/$pkgpath.java" ]]; then
      _emit "$f_rel" "$root/$pkgpath.java" "import@${f_rel}:${ln}"
      break
    fi
  done < "$_JAVA_ROOTS_T"
done < <(grep -RnE '^[[:space:]]*import[[:space:]]+[a-z][a-zA-Z0-9_.]*;' "$PROJ" --include='*.java' 2>/dev/null \
  | LC_ALL=C awk -F: -v proj="$PROJ" '{ f=substr($1, length(proj)+2); print f "|" $0 }' | LC_ALL=C sort -u | head -2000)

# MyBatis mapper XML 声明式边（字符串耦合点编译不报错——漏改字段即静默缺陷，须进边集）
#   mapper-binding: <mapper namespace="a.b.C">  → src/main/java/a/b/C.java（Mapper 接口）
#   data-mapping:   resultMap type=/resultType=/parameterType="a.b.E" → src/main/java/a/b/E.java（实体）
# 短名（typeAliases）解析：mybatis-config.xml <typeAlias alias> 映射优先；无映射按
# src 下同名 .java 唯一命中（多命中不猜，AI 按 exploration-guide §D.2.5 补）。
# Spring Batch/Quartz job→数据资产依赖为语义耦合（reader SQL 列↔实体字段无确定性映射），
# 机械层不猜——AI 补 kind=job-flow 边（exploration-guide §D.2-J 链路模型）。
_fq_resolve() { # $1=完全限定名 a.b.C → stdout 项目相对 .java 路径 或 空（遍历发现的 Java 源根）
  local pkgpath="$1"; pkgpath=$(printf '%s' "$pkgpath" | tr '.' '/')
  local root
  while IFS= read -r root; do
    [[ -z "$root" ]] && continue
    if [[ -f "$PROJ/$root/$pkgpath.java" ]]; then printf '%s/%s.java' "$root" "$pkgpath"; return 0; fi
  done < "$_JAVA_ROOTS_T"
  return 1
}

# typeAlias 映射表（alias<TAB>完全限定名），mybatis-config.xml 存在时构建
_ALIAS_T=$(mktemp /tmp/relx.alias.XXXXXX)
grep -RhoE '<typeAlias[^>]*alias="[^"]*"[^>]*type="[^"]*"' "$PROJ" --include='mybatis-config.xml' 2>/dev/null \
  | sed -n 's/.*alias="\([^"]*\)".*type="\([^"]*\)".*/\1\t\2/p' > "$_ALIAS_T"

_SHORT_T=$(mktemp /tmp/relx.short.XXXXXX)

_short_resolve() { # $1=短类名 → stdout 唯一命中的项目相对 .java 路径 或 空（全源根扫，非仅根 src/）
  local name="$1" fq hits
  fq=$(awk -F'\t' -v n="$name" '$1 == n { print $2; exit }' "$_ALIAS_T")
  if [[ -n "$fq" ]]; then _fq_resolve "$fq" && return 0 || return 1; fi
  while IFS= read -r root; do
    [[ -z "$root" ]] && continue
    find "$PROJ/$root" -type f -name "${name}.java" -not -path '*/target/*' 2>/dev/null
  done < "$_JAVA_ROOTS_T" | LC_ALL=C sort -u > "$_SHORT_T"
  hits=$(head -2 "$_SHORT_T")
  [[ $(printf '%s' "$hits" | LC_ALL=C grep -c .) -eq 1 ]] || return 1
  printf '%s' "$hits" | sed "s|^$PROJ/||"
  return 0
}

_xml_files=$(find "$PROJ" -type f -name '*Mapper.xml' \
  -not -path '*/target/*' -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/vendor/*' -not -path '*/__pycache__/*' -not -path '*/.tox/*' -not -path '*/.swarm-yuan/*' \
  -print 2>/dev/null | LC_ALL=C sort | head -500)
while IFS= read -r x_abs; do
  [[ -z "$x_abs" ]] && continue
  x_rel="${x_abs#"$PROJ"/}"
  # namespace → Mapper 接口
  while IFS= read -r entry; do
    [[ -z "$entry" ]] && continue
    ln="${entry%% *}"; ns="${entry#* }"
    if to=$(_fq_resolve "$ns"); then
      printf '{"from":"%s","to":"%s","kind":"mapper-binding","evidence":"namespace@%s:%s"}\n' "$x_rel" "$to" "$x_rel" "$ln" >> "$TMPF"
    fi
  done < <(grep -n '<mapper namespace=' "$x_abs" 2>/dev/null \
    | sed -n 's/^\([0-9]*\):.*namespace="\([^"]*\)".*$/\1 \2/p')
  # resultMap type= / resultType= / parameterType= → 实体（全限定名或短名）
  while IFS= read -r entry; do
    [[ -z "$entry" ]] && continue
    ln=$(printf '%s' "$entry" | cut -d' ' -f1)
    tag=$(printf '%s' "$entry" | cut -d' ' -f2)
    typ=$(printf '%s' "$entry" | cut -d' ' -f3)
    [[ -n "$typ" ]] || continue
    case "$typ" in
      map|hashmap|java.util.Map|java.util.HashMap|int|long|string|double|boolean|java.lang.*|java.math.*|java.util.Date) continue ;;
    esac
    case "$typ" in
      *.*) to=$(_fq_resolve "$typ") || continue ;;
      *)   to=$(_short_resolve "$typ") || continue ;;
    esac
    [[ -n "$to" ]] || continue
    printf '{"from":"%s","to":"%s","kind":"data-mapping","evidence":"%s@%s:%s"}\n' "$x_rel" "$to" "$tag" "$x_rel" "$ln" >> "$TMPF"
  done < <(grep -nE 'resultType=|parameterType=|<resultMap[^>]* type=' "$x_abs" 2>/dev/null \
    | sed -n -e 's/^\([0-9]*\):.*<resultMap[^>]* type="\([^"]*\)".*$/\1 resultMap \2/p' \
             -e 's/^\([0-9]*\):.*\(resultType\)="\([^"]*\)".*$/\1 resultType \3/p' \
             -e 's/^\([0-9]*\):.*\(parameterType\)="\([^"]*\)".*$/\1 parameterType \3/p')
  # 字段级明细边（v2.14.3 排查 A1：resultMap <result column property> → 实体字段的字符串耦合明细）
  # 出 kind=field-mapping 边：evidence 带 column/property/行号——改实体字段的影响面反查可定位到
  # 具体字段行（不再只到 XML 文件级）。from/to 沿用 resultMap type→实体（字段挂在实体上）。
  while IFS= read -r fentry; do
    [[ -z "$fentry" ]] && continue
    fln=$(printf '%s' "$fentry" | cut -d' ' -f1)
    fcol=$(printf '%s' "$fentry" | cut -d' ' -f2)
    fprop=$(printf '%s' "$fentry" | cut -d' ' -f3)
    fent=$(printf '%s' "$fentry" | cut -d' ' -f4)
    [[ -n "$fprop" && -n "$fent" ]] || continue
    case "$fent" in
      *.*) fto=$(_fq_resolve "$fent") || continue ;;
      *)   fto=$(_short_resolve "$fent") || continue ;;
    esac
    [[ -n "$fto" ]] || continue
    printf '{"from":"%s","to":"%s","kind":"field-mapping","evidence":"%s=%s@%s:%s","column":"%s","property":"%s"}\n' \
      "$x_rel" "$fto" "$fcol" "$fprop" "$x_rel" "$fln" "$fcol" "$fprop" >> "$TMPF"
  done < <(awk '
    # 状态机：进 <resultMap type="X"> 记实体，出 </resultMap> 清；result/id 行取 column/property
    /<resultMap[^>]* type="/ {
      match($0, /type="[^"]*"/); ent=substr($0, RSTART+6, RLENGTH-7)
    }
    /<\/resultMap>/ { ent="" }
    ent != "" && /<result |<id / && /column="/ && /property="/ {
      match($0, /column="[^"]*"/); col=substr($0, RSTART+8, RLENGTH-9)
      match($0, /property="[^"]*"/); prop=substr($0, RSTART+10, RLENGTH-11)
      print FNR " " col " " prop " " ent
    }
  ' "$x_abs" 2>/dev/null)
done <<< "$_xml_files"
rm -f "$_ALIAS_T"

# Spring/JPA/Hibernate 声明式装配边（MyBatis 之外的 XML↔Java 字符串耦合）
#   bean-wiring: Spring beans XML <bean class="a.b.C"> → src/main/java/a/b/C.java
#   data-mapping: JPA orm.xml <entity class="a.b.C"> / hbm.xml <class name="a.b.C"> → 实体
# 文件判据按根元素内容（文件名惯例不可靠）：含 <beans（Spring）/ <entity-mapping（JPA orm）/
# <hibernate-mapping（hbm）。只解析含点号全限定名——短名机械不猜（AI 按 §D.2.5 补）。
while IFS= read -r x_abs; do
  [[ -z "$x_abs" ]] && continue
  x_rel="${x_abs#"$PROJ"/}"
  _x_kind=""
  if grep -q '<beans' "$x_abs" 2>/dev/null; then _x_kind="bean-wiring"; _x_ev="beanClass"
  elif grep -q '<entity-mapping' "$x_abs" 2>/dev/null; then _x_kind="data-mapping"; _x_ev="entityClass"
  elif grep -q '<hibernate-mapping' "$x_abs" 2>/dev/null; then _x_kind="data-mapping"; _x_ev="hbmClass"
  else continue; fi
  while IFS= read -r entry; do
    [[ -z "$entry" ]] && continue
    ln=$(printf '%s' "$entry" | cut -d' ' -f1)
    fq=$(printf '%s' "$entry" | cut -d' ' -f2)
    case "$fq" in *.*) ;; *) continue ;; esac
    to=$(_fq_resolve "$fq") || continue
    printf '{"from":"%s","to":"%s","kind":"%s","evidence":"%s@%s:%s"}\n' "$x_rel" "$to" "$_x_kind" "$_x_ev" "$x_rel" "$ln" >> "$TMPF"
  done < <(grep -nE '(<bean[^>]* |<entity[^>]* |<class[^>]* )(class|name)="[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+"' "$x_abs" 2>/dev/null \
    | sed -n -e 's/^\([0-9]*\):.*<bean[^>]* class="\([^"]*\)".*$/\1 \2/p' \
             -e 's/^\([0-9]*\):.*<entity[^>]* class="\([^"]*\)".*$/\1 \2/p' \
             -e 's/^\([0-9]*\):.*<class[^>]* name="\([^"]*\)".*$/\1 \2/p')
done < <(grep -rlE '<beans\b|<entity-mapping|<hibernate-mapping' "$PROJ" --include='*.xml' 2>/dev/null \
  | grep -vE '/target/|/node_modules/|/dist/|/\.git/|/\.swarm-yuan/' | LC_ALL=C sort | head -200)

# 截断 + 确定性排序 + 落盘
# 重建时保留既有文件里 AI 补充的
# 语义边（kind 不属机械五类的行：call/route/message/ipc/export/job-flow 等）——原实现整文件
# 覆盖，AI 语义增量在每次重探查/自成长重建时被清空，补边永不持久（执勤实测 17 行→11 行）。
_n_semantic_kept=0
if [[ -f "$OUT" ]]; then
  LC_ALL=C grep -v '"kind":"\(import\|mapper-binding\|data-mapping\|bean-wiring\|field-mapping\)"' "$OUT" 2>/dev/null > "${TMPF}.semantic" || true
  _n_semantic_kept=$(LC_ALL=C grep -c . "${TMPF}.semantic" 2>/dev/null || true); _n_semantic_kept="${_n_semantic_kept:-0}"
  [[ "$_n_semantic_kept" -gt 0 ]] && cat "${TMPF}.semantic" >> "$TMPF"
  rm -f "${TMPF}.semantic"
fi
_n=$(LC_ALL=C grep -c . "$TMPF" 2>/dev/null || true); _n="${_n:-0}"
if [[ "$_n" -gt "$MAXE" ]]; then
  echo "⚠ 边数 ${_n} 超上限 ${MAXE}，截断（大仓库建议分段提取或提高 --max-edges）" >&2
fi
LC_ALL=C sort -t'"' -k4,4 -k8,8 "$TMPF" | LC_ALL=C awk '!seen[$0]++' | LC_ALL=C awk -v max="$MAXE" 'NR <= max' > "$OUT"
_n_final=$(LC_ALL=C grep -c . "$OUT" 2>/dev/null || true); _n_final="${_n_final:-0}"
_n_dm=$(grep -c '"kind":"data-mapping"' "$OUT" 2>/dev/null || true); _n_dm="${_n_dm:-0}"
_n_mb=$(grep -c '"kind":"mapper-binding"' "$OUT" 2>/dev/null || true); _n_mb="${_n_mb:-0}"
_n_bw=$(grep -c '"kind":"bean-wiring"' "$OUT" 2>/dev/null || true); _n_bw="${_n_bw:-0}"
_n_fm=$(grep -c '"kind":"field-mapping"' "$OUT" 2>/dev/null || true); _n_fm="${_n_fm:-0}"
_n_imp=$((_n_final - _n_dm - _n_mb - _n_bw - _n_fm - _n_semantic_kept))
echo "✓ 关系边集已生成: ${OUT}（${_n_final} 条 = import ${_n_imp} + mapper-binding ${_n_mb} + data-mapping ${_n_dm} + bean-wiring ${_n_bw} + field-mapping ${_n_fm} + AI 语义边保留 ${_n_semantic_kept}；语义边 call/route/message/ipc/export/job-flow 由 AI 补充，重建时自动保留，格式同款 kind 字段）"
echo "  消费方：--stable-diff 1 跳传播优先读本边集（改实体字段时 data-mapping 边反查 mapper XML）；流B ②探查查边集替代读 mermaid"
exit 0
