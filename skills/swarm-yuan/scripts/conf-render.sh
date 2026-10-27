#!/usr/bin/env bash
# conf-render.sh — precheck.conf 三件套初稿渲染
# 把 Step 8 模型手译 176 变量的机械工作脚本化：嗅探项目 → 渲染 conf 初稿
#   每变量带溯源注释: # AUTO:detected（探测所得）/ # AUTO:default（默认值未动）/ # TODO:model（语义型，须人工）
# 模型新动作: 只处理 # TODO:model 清单 + 审 diff（从「写 158 行」变「审 + 补少数」）
# 用法:
#   bash conf-render.sh <PROJECT_DIR> [--feature-card <f>] [--profile <lite|standard|compliance>] [--industry <name>] [--out <dir>]
#     --feature-card  特征卡 md（解析结构化字段补实值，可选）
#     --profile       lite(只 core) / standard(core+arch) / compliance(三件套)，默认 standard
#     --industry      行业 profile（finance|gov|medical|telecom|automotive|energy|industrial|payment）
#                     真实加载 assets/industry-profiles/<name>.conf 并渲染为 precheck.industry.conf
#                     追加到 precheck.conf 尾部 source 链（替代"手工 cat >>"伪激活）
#     --out           落盘目录（不给则 stdout 合并三件套）
# 输出: conf 初稿（每变量行带 # AUTO:* 溯源）；末尾 # TODO:model 清单汇总。
# 退出码: 0 正常（fail-open，嗅探失败用默认）；1 arg 错误。
# 红线: LAYER_DEFS/SERVICE_DIRS/STORE_DIR/WRITABLE_DIRS 等语义型变量显式留 # TODO:model，脚本不替模型做架构判断。
set -uo pipefail
BASE="$(cd "$(dirname "${0}")/.." && pwd)"

PROJ=""; CARD=""; PROFILE="standard"; INDUSTRY=""; OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --feature-card) CARD="${2:?--feature-card 需要路径}"; shift 2 ;;
    --profile) PROFILE="${2:?--profile 需要 lite|standard|compliance}"; shift 2 ;;
    --industry) INDUSTRY="${2:?--industry 需要 finance|gov|medical|telecom|automotive|energy|industrial|payment}"; shift 2 ;;
    --out) OUT="${2:?--out 需要目录}"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) [[ -z "$PROJ" ]] && PROJ="$1" || { echo "未知参数: $1" >&2; exit 1; }; shift ;;
  esac
done
[[ -n "$PROJ" && -d "$PROJ" ]] || { echo "✗ PROJECT_DIR 缺失或不存在: ${PROJ:-（空）}" >&2; exit 1; }
PROJ=$(cd "$PROJ" && pwd)
[[ -n "$OUT" ]] && { mkdir -p "$OUT"; }

# ===== 嗅探层 =====
# 根级单点嗅探对前后端同仓（backend/+frontend/ 等）全空——
# 构建/测试命令落 AUTO:default 空值。无根清单时 depth≤3 发现各工程目录
# （剪构建产物与依赖目录），供下方 poly 分支合成复合命令。有根清单则维持原单栈路径。
_mo_dirs=""
if ! [[ -f "$PROJ/package.json" || -f "$PROJ/pom.xml" || -f "$PROJ/build.gradle" \
     || -f "$PROJ/build.gradle.kts" || -f "$PROJ/go.mod" || -f "$PROJ/pyproject.toml" || -f "$PROJ/composer.json" || -f "$PROJ/Gemfile" \
     || -f "$PROJ/requirements.txt" || -f "$PROJ/Cargo.toml" ]]; then
  _mo_dirs=$(find "$PROJ" -maxdepth 3 \( -type d \( -name node_modules -o -name target -o -name .git -o -name dist -o -name .swarm-yuan -o -name vendor \) -prune \) \
    -o -type f \( -name pom.xml -o -name build.gradle -o -name build.gradle.kts -o -name package.json \
       -o -name go.mod -o -name pyproject.toml -o -name requirements.txt -o -name Cargo.toml -o -name composer.json -o -name Gemfile \) -print 2>/dev/null \
    | LC_ALL=C awk -v p="$PROJ/" 'index($0,p)==1 {print substr($0,length(p)+1)}' \
    | LC_ALL=C awk -F/ '{NF--; print}' OFS=/ | LC_ALL=C sort -u)
fi
_lang="unknown"; _pm="unknown"; _build=""; _test=""; _build_confirmed=0; _test_confirmed=0; _frameworks=""
if [[ -f "$PROJ/package.json" ]]; then
  _lang="typescript"
  if [[ -f "$PROJ/yarn.lock" ]]; then _pm="yarn"; _build="yarn build"; _test="yarn test"
  elif [[ -f "$PROJ/pnpm-lock.yaml" ]]; then _pm="pnpm"; _build="pnpm build"; _test="pnpm test"
  else _pm="npm"
  # BUILD_CMD 自指防 fork bomb——scripts.build 内再调 npm run build（如 "cd frontend
  # && npm run build" 而 frontend 无独立 package.json）会向上寻包自递归（实测 820 进程）。
  # 自指形态 → BUILD_CMD 留空（AUTO:default 空值语义），人工修正。
  _bt=$(grep -oE '"build"[[:space:]]*:[[:space:]]*"[^"]*"' "$PROJ/package.json" 2>/dev/null | head -1)
  case "$_bt" in
    *"run build"*|*"run \"build\""*|*"yarn build"*) _build="" ;;
    *) _build="npm run build" ;;
  esac
  _test="npm test"; fi
  # 仅当 package.json 确证含 build/test 脚本时才标 detected（裸 package.json 无脚本 → 默认值 # AUTO:default）
  if grep -qE '"build"[[:space:]]*:' "$PROJ/package.json" 2>/dev/null; then _build_confirmed=1; fi
  if grep -qE '"test"[[:space:]]*:' "$PROJ/package.json" 2>/dev/null; then _test_confirmed=1; fi
elif [[ -f "$PROJ/pom.xml" ]]; then
  _lang="java"; _pm="maven"; _build="mvn package"; _test="mvn clean test"; _build_confirmed=1; _test_confirmed=1
elif [[ -f "$PROJ/build.gradle" ]] || [[ -f "$PROJ/build.gradle.kts" ]]; then
  _lang="java"; _pm="gradle"; _build="gradle build"; _test="gradle test"; _build_confirmed=1; _test_confirmed=1
elif [[ -f "$PROJ/go.mod" ]]; then
  _lang="go"; _pm="go"; _build="go build ./..."; _test="go test ./..."; _build_confirmed=1; _test_confirmed=1
elif [[ -f "$PROJ/Gemfile" ]]; then
  # Bundler 命令族。BUILD=bundle install（按 lock 确定性安装，
  # 非改写纪律同 php/composer 族）；TEST=bundle exec rake（生态主流 Rake 任务）。lock 才 confirmed。
  _lang="ruby"; _pm="bundler"; _build="bundle install"; _test="bundle exec rake"
  if [[ -f "$PROJ/Gemfile.lock" ]]; then _build_confirmed=1; _test_confirmed=1; fi
elif [[ -f "$PROJ/composer.json" ]]; then
  # composer 命令族。BUILD=composer install（按 lock 确定性安装，
  # 不改写既有版本——对齐 uv 分支非改写纪律）；TEST=vendor/bin/phpunit（生态主流，其他
  # runner 人工修正）。不实跑不语义确认：confirmed 仅 composer.lock 存在时置位（锁=自证）。
  _lang="php"; _pm="composer"; _build="composer install"; _test="vendor/bin/phpunit"
  if [[ -f "$PROJ/composer.lock" ]]; then _build_confirmed=1; _test_confirmed=1; fi
elif [[ -f "$PROJ/pyproject.toml" ]] || [[ -f "$PROJ/requirements.txt" ]]; then
  _lang="python"; _pm="pip"
  # uv 分支原 `uv run build` 双缺陷——build 脚本未必存在（实跑 Failed to spawn: build），
  # 且 uv run 默认按 uv.lock 改写 venv（实测 Django 6.1.1 被静默降 6.1，违反版本锁定铁律）。
  # 改非改写口径：build=stdlib compileall（零依赖零改写）；test 加 --no-sync 禁环境改写。
  if [[ -f "$PROJ/uv.lock" ]]; then _pm="uv"; _build="python3 -m compileall -q ."; _test="uv run --no-sync python3 -m pytest"; _build_confirmed=1; _test_confirmed=1
  elif [[ -f "$PROJ/poetry.lock" ]]; then _pm="poetry"; _build="poetry build"; _test="poetry run pytest"; _build_confirmed=1; _test_confirmed=1
  else
    # 裸锁文件项目此前默认 _test=pytest /
    # _build="python -m build"——两者都是第三方包，未声明未安装时默认值不可执行（AUTO:default
    # 语义=默认未动，翻车在门禁 check_test 真跑时）。改为：声明了 pytest 才用 pytest（confirmed），
    # 否则标准库 unittest 零依赖兜底；无 pyproject.toml（纯 requirements.txt 应用仓）无构建语义
    # 则 BUILD_CMD 留空（与 Node 样本 task-api 口径一致）。
    # pytest 形态用 `python3 -m pytest`
    # 而非裸 pytest——无 pytest.ini/pyproject[tool.pytest] 的项目（纯 requirements.txt 应用仓
    # 主流形态）裸 pytest 不把 cwd 注入 sys.path，收集 `from app.main import app` 必 ModuleNotFoundError；
    # `-m` 语义注入 cwd，对有配置项目等价（与同函数 unittest 兜底的 python3 -m 口径一致）。
    # 项目 .venv 存在时解释器
    # 必须取 .venv/bin/python——系统 python3 的 user site-packages 与项目依赖无关（实测碰巧
    # 装了 fastapi 才假通过；无全局包机器上 check_test 必炸 ModuleNotFoundError，测的还是
    # 错误环境）。precheck.sh 门禁在 cd "$PROJECT_DIR" 后 eval TEST_CMD，相对路径成立。
    _py="python3"
    if [[ -x "$PROJ/.venv/bin/python" ]]; then
      _py=".venv/bin/python"
    elif [[ -x "$PROJ/venv/bin/python" ]]; then
      _py="venv/bin/python"
    fi
    if grep -qi 'pytest' "$PROJ"/requirements*.txt "$PROJ"/pyproject.toml 2>/dev/null; then
      _test="$_py -m pytest"; _test_confirmed=1
    else
      _test="$_py -m unittest discover -s tests"
    fi
    if [[ -f "$PROJ/pyproject.toml" ]]; then _build="python -m build"; else _build=""; fi
  fi
elif [[ -f "$PROJ/Cargo.toml" ]]; then
  # 嗅探表此前无 Cargo.toml 分支——
  # Rust 项目 BUILD_CMD/TEST_CMD 落 AUTO:default 空值，check_build/check_test 无命令可跑
  # （"零手动配置"卖点对整个 Rust 生态失效）。cargo 官方语义即构建/测试入口，无需确认探测：
  # Cargo.toml 存在即 confirmed（workspace 根与单 crate 同样成立）。
  _lang="rust"; _pm="cargo"; _build="cargo build"; _test="cargo test"
  _build_confirmed=1; _test_confirmed=1
elif [[ -n "${_mo_dirs}" ]]; then
  # 多工程同仓——每目录按确定性优先级（pom>gradle>node>go>python>rust）取一套命令，
  # 子 shell 段串联 `(cd <dir> && <cmd>) && ...`：段间无 cd 状态耦合、相对路径可移植、任一段失败整体失败。
  # confirmed 语义：test 至少一段确证即 detected（docs 型子工程无测试不拖死整仓）。
  _lang="poly"; _pm="multi"
  _mo_test=""; _mo_build=""; _mo_any_confirmed=0
  while IFS= read -r _d; do
    [[ -z "$_d" ]] && continue
    _t=""; _b=""; _tc=0
    if [[ -f "$PROJ/$_d/pom.xml" ]]; then
      _b="mvn -q package -DskipTests"; _t="mvn -q test"; _tc=1
    elif [[ -f "$PROJ/$_d/build.gradle" || -f "$PROJ/$_d/build.gradle.kts" ]]; then
      _b="gradle -q build"; _t="gradle -q test"; _tc=1
    elif [[ -f "$PROJ/$_d/package.json" ]]; then
      if [[ -f "$PROJ/$_d/yarn.lock" ]]; then _b="yarn build"; _t="yarn test"
      elif [[ -f "$PROJ/$_d/pnpm-lock.yaml" ]]; then _b="pnpm build"; _t="pnpm test"
      else _b="npm run build"; _t="npm test"; fi
      grep -qE '"test"[[:space:]]*:' "$PROJ/$_d/package.json" 2>/dev/null && _tc=1
      # 无 build 脚本的 node 子工程不发 build 段（与根级路径 confirmed 语义对称，防空跑失败）
      grep -qE '"build"[[:space:]]*:' "$PROJ/$_d/package.json" 2>/dev/null || _b=""
    elif [[ -f "$PROJ/$_d/go.mod" ]]; then
      _b="go build ./..."; _t="go test ./..."; _tc=1
    elif [[ -f "$PROJ/$_d/requirements.txt" || -f "$PROJ/$_d/pyproject.toml" ]]; then
      # poly 分支 Python 段
      # 此前硬编码裸 python3——venv 三级嗅探只落了根级 Python 分支（上方同函数），
      # 前后端同仓形态（<dir>/requirements.txt + 另一 node 子目录）走 poly 分支漏嗅探，依赖装在
      # <dir>/.venv 时生成的 TEST_CMD 在无全局包机器上 check_test 必炸 ModuleNotFoundError
      # （实测：系统 python3 连 flask_sqlalchemy 都 import 不了，AUTO:detected 初值整条假）。
      # 修：子目录内同名三级嗅探——相对路径形态（.venv/bin/python）配合测试段已有的
      # `(cd $_d && ...)` 组装（下方 :158）语义成立，与门禁侧 cd PROJECT_DIR→eval 同构。
      _py="python3"
      if [[ -x "$PROJ/$_d/.venv/bin/python" ]]; then
        _py=".venv/bin/python"
      elif [[ -x "$PROJ/$_d/venv/bin/python" ]]; then
        _py="venv/bin/python"
      fi
      if grep -qi 'pytest' "$PROJ/$_d/requirements.txt" "$PROJ/$_d/pyproject.toml" 2>/dev/null; then
        _t="$_py -m pytest"
      else
        _t="$_py -m unittest discover -s tests"
      fi
      _tc=1; _b=""
    elif [[ -f "$PROJ/$_d/Cargo.toml" ]]; then
      _b="cargo build"; _t="cargo test"; _tc=1
    else
      continue
    fi
    # R118：目录名先 shell-quote 再拼进命令串——子目录名含空格/$()/反引号时，
    # 旧版裸拼会在 precheck eval 阶段执行任意命令（审计 P1-1 实证）。
    _dq=$(printf '%q' "$_d")
    [[ $_tc -eq 1 ]] && { _mo_test="${_mo_test:+$_mo_test && }(cd $_dq && $_t)"; _mo_any_confirmed=1; }
    [[ -n "$_b" ]] && _mo_build="${_mo_build:+$_mo_build && }(cd $_dq && $_b)"
  done <<< "$_mo_dirs"
  _test="$_mo_test"; _build="$_mo_build"
  _test_confirmed=$_mo_any_confirmed
  _build_confirmed=0
  [[ -n "$_build" ]] && _build_confirmed=1
elif [[ -n "$(find "$PROJ" -maxdepth 3 \( -name '*.csproj' -o -name '*.fsproj' -o -name '*.sln' -o -name '*.slnx' \) -not -path '*/bin/*' -not -path '*/obj/*' -print -quit 2>/dev/null)" ]]; then
  # 嗅探表此前无 csproj/sln/slnx 分支
  # （同 Rust Cargo.toml 形态缺位同族）——.NET 项目 BUILD_CMD/TEST_CMD 落 AUTO:default 空值。
  # dotnet CLI 在工程/解决方案目录下免参即可发现唯一 sln/slnx/csproj（多解决方案目录才需显式
  # 指定，属少数形态，AI 填 conf 时按特征卡修正）；存在任一 .NET 工程文件即 confirmed。
  _lang="csharp"; _pm="dotnet"; _build="dotnet build"; _test="dotnet test"
  _build_confirmed=1; _test_confirmed=1
fi
# monorepo 判定
_monorepo=0
[[ -d "$PROJ/packages" && $(ls -1 "$PROJ/packages" 2>/dev/null | wc -l | tr -d ' ') -gt 1 ]] && _monorepo=1
[[ -d "$PROJ/services" && $(ls -1 "$PROJ/services" 2>/dev/null | wc -l | tr -d ' ') -gt 1 ]] && _monorepo=1
[[ -n "${_mo_dirs}" ]] && _monorepo=1
# ACTIVE_FRAMEWORKS（调 detect-frameworks.sh；其行式解析器对紧凑单行 package.json 会漏探，fail-open 兜底补 pkgjson）
# 回归发现（2026-08-27 RuoYi 双项目回归）：原解析 sed 's/.*"\([^"]*\)".*/\1/p' 贪婪匹配
# 只捕获 ACTIVE_FRAMEWORKS=("vue" "element" "vite") 行的最后一个 "vite" → 骨架 conf 只落
# 1 个框架（SKILL.md 认知摘要另一套正确解析写 3 个 → 设计/实现/生成物三体不一致）。
# 修复：整行剥壳（去 ACTIVE_FRAMEWORKS= 前缀 + 剥 ()"），框架 id 全量保留。
if [[ -x "$BASE/scripts/detect-frameworks.sh" ]]; then
  _frameworks=$("$BASE/scripts/detect-frameworks.sh" "$PROJ" 2>/dev/null | sed -n 's/^ACTIVE_FRAMEWORKS=//p' | tr -d '()"' | sed 's/^ *//; s/ *$//')
fi
# 兜底：detect-frameworks.sh 行式 grep 要求 `"key":` 在行首空白后，紧凑 JSON（键内联）会漏；
# 此处仅当主探测为空且存在 package.json 时，用键无关位置的稳健提取补 pkgjson 类框架（ID 与 detect-frameworks.sh 对齐）。
if [[ -z "$_frameworks" && -f "$PROJ/package.json" ]]; then
  _pkgkeys=$(grep -oE '"[^"]+"[[:space:]]*:' "$PROJ/package.json" 2>/dev/null | sed -E 's/"([^"]+)"[[:space:]]*:.*/\1/' || true)
  _fb=""
  while IFS= read -r _k; do
    [[ -z "$_k" ]] && continue
    case "$_k" in
      react)         _fb="${_fb}${_fb:+ }react" ;;
      react-native)  _fb="${_fb}${_fb:+ }react-native" ;;
      vue|pinia)     _fb="${_fb}${_fb:+ }vue" ;;
      @angular/core) _fb="${_fb}${_fb:+ }angular" ;;
      antd|@ant-design) _fb="${_fb}${_fb:+ }antd" ;;
      element-plus)  _fb="${_fb}${_fb:+ }element" ;;
      naive-ui)      _fb="${_fb}${_fb:+ }naiveui" ;;
      next)          _fb="${_fb}${_fb:+ }nextjs" ;;
      nuxt)          _fb="${_fb}${_fb:+ }nuxt" ;;
      vite)          _fb="${_fb}${_fb:+ }vite" ;;
      webpack)       _fb="${_fb}${_fb:+ }webpack" ;;
      tailwindcss)   _fb="${_fb}${_fb:+ }tailwind" ;;
      koa)           _fb="${_fb}${_fb:+ }koa" ;;
      express)       _fb="${_fb}${_fb:+ }express" ;;
      fastify)       _fb="${_fb}${_fb:+ }fastify" ;;
      @nestjs/*)     _fb="${_fb}${_fb:+ }nestjs" ;;
      @prisma/client|prisma) _fb="${_fb}${_fb:+ }prisma" ;;
      typeorm)       _fb="${_fb}${_fb:+ }typeorm" ;;
      jest|vitest)   _fb="${_fb}${_fb:+ }jest-vitest" ;;
      redis|ioredis) _fb="${_fb}${_fb:+ }redis" ;;
      kafkajs)       _fb="${_fb}${_fb:+ }kafka" ;;
      amqplib)       _fb="${_fb}${_fb:+ }rabbitmq" ;;
      @opentelemetry/api) _fb="${_fb}${_fb:+ }opentelemetry" ;;
    esac
  done <<EOF
$_pkgkeys
EOF
  _frameworks="$_fb"
fi
# 特征卡字段（若给）
if [[ -n "$CARD" && -f "$CARD" ]]; then
  : # 特征卡解析预留：未来从 md 表格提取 WRITABLE_DIRS 等；当前 YAGNI，靠嗅探 + TODO:model
fi

# ===== 渲染层：以模板为基底，逐变量判定溯源 =====
# 溯源判定 helper：变量值非空且确证 → detected，否则 default
_src_build() { [[ "$_build_confirmed" -eq 1 ]] && echo detected || echo default; }
_src_test()  { [[ "$_test_confirmed" -eq 1 ]] && echo detected || echo default; }

# R118：简单命令保持单引号（可读、与既有 conf 形态一致）；值内出现单引号时改用 %q
# （shell 安全字面量），避免 `'...'` 被单引号提前闭合。
_conf_quote() {
  case "$1" in
    *\'*) printf '%q' "$1" ;;
    *) printf "'%s'" "$1" ;;
  esac
}

# 模板变量映射 → 渲染值 + 溯源（detected/default/TODO:model）
_render_var() { # $1=变量名 $2=模板行
  local vn="$1" line="$2"
  case "$vn" in
    # R118：%q 生成 shell 安全字面量——项目路径含空格/$(...)/单引号时不再破坏 conf，
    # 也不会在 precheck source/eval 时执行命令替换（审计 P1-1 实证）。
    PROJECT_DIR)      printf 'PROJECT_DIR=%q  # AUTO:detected' "$PROJ" ;;
    BUILD_CMD)        printf 'BUILD_CMD=%s  # AUTO:%s' "$(_conf_quote "$_build")" "$(_src_build)" ;;
    TEST_CMD)         printf 'TEST_CMD=%s  # AUTO:%s' "$(_conf_quote "$_test")" "$(_src_test)" ;;
    ACTIVE_FRAMEWORKS)
      local fw_arr=""
      local f
      for f in $_frameworks; do fw_arr="${fw_arr}${fw_arr:+ }\"$f\""; done
      if [[ -n "$fw_arr" ]]; then
        printf "ACTIVE_FRAMEWORKS=(%s)  # AUTO:detected" "$fw_arr"
      else
        printf "ACTIVE_FRAMEWORKS=()  # AUTO:default"
      fi ;;
    # 注意：STORE_DIR / COMPONENT_DIR 是标量（单目录，门禁按 "$STORE_DIR" 引用），
    # 不在此处强渲染成数组——bash 3.2 + set -u 下空数组标量展开即 unbound（
    # 原白名单把它们与数组型变量混写 =()，导致 check_state/check_frontend 崩）。
    # 它们走 * 分支保留模板标量形态（=""，门禁 [[ -n "$STORE_DIR" ]] 安全）。
    LAYER_DEFS|SERVICE_DIRS|WRITABLE_DIRS|READONLY_DIRS|SCAN_DIRS|CONSISTENCY_DIRS)
      printf "%s=()  # TODO:model" "$vn" ;;
    *) printf "%s" "$line" ;;  # 其余保留模板原行
  esac
}

# 渲染单份 conf：读模板，对 ^[A-Z_]+= 行替换，其余行原样
# Task 2：模板缺失与写出失败 fail-closed——渲染是交付链一环，静默空产出会让
# create 拿空 conf 继续生成（旧版模板缺失 return 0、写失败不传播、末尾恒 exit 0）。
_render_conf() { # $1=模板相对路径
  local tpl="$BASE/$1"
  if [[ ! -f "$tpl" ]]; then
    echo "✗ conf-render: 模板缺失: $tpl" >&2
    return 1
  fi
  local line vn
  while IFS= read -r line; do
    if [[ "$line" =~ ^[A-Z_]+= ]]; then
      vn=$(printf '%s' "$line" | sed -E 's/^([A-Z_]+)=.*/\1/')
      _render_var "$vn" "$line"
    else
      printf '%s' "$line"
    fi
    printf '\n'
  done < "$tpl"
}

# 输出：--out 模式每文件独立落盘；stdout 模式加分隔头合并
_emit_section() { # $1=文件名 $2=内容
  if [[ -n "$OUT" ]]; then
    if ! printf '%s\n' "$2" > "$OUT/$1"; then
      echo "✗ conf-render: 写出失败: $OUT/$1" >&2
      exit 1
    fi
  else
    printf '# ===== %s =====\n' "$1"
    printf '%s\n' "$2"
  fi
}

core=$(_render_conf "assets/precheck.conf") || exit 1
# lite profile：不含 arch/compliance 兄弟文件，剔除 core 模板里「描述兄弟文件」的纯注释行。
# 注意：保留 `[[ -f ... ]] && source ... || true` 功能行——lite 无兄弟时它是 no-op（|| true），
# 且未来手动补 arch.conf 时能自动加载（升级路径与 standard/compliance 一致）。
if [[ "$PROFILE" == "lite" ]]; then
  core=$(printf '%s\n' "$core" | grep -vE '^#.*precheck\.(arch|compliance)\.conf')
fi
# industry profile 真实加载——渲染为 precheck.industry.conf，
# 并在 precheck.conf 尾部追加 source 行（加载顺序：core→arch→compliance→industry→patch，
# 行业层后于生成层 = 行业覆盖胜出，用户 patch 层仍最末）。
if [[ -n "$INDUSTRY" ]]; then
  _ip_src="$BASE/assets/industry-profiles/${INDUSTRY}.conf"
  if [[ ! -f "$_ip_src" ]]; then
    echo "✗ 未知行业 profile: ${INDUSTRY}（可选：finance|gov|medical|telecom|automotive|energy|industrial|payment）" >&2
    exit 1
  fi
  # 行业层头部改写：原"手工 cat >>"用法注释替换为"本文件由 conf-render --industry 生成"溯源
  _ip_content=$(sed -e '1,10s|^# 用法：.*|# 本文件由 conf-render.sh --industry '"$INDUSTRY"' 生成（真实加载，勿手工编辑）|' "$_ip_src")
  _emit_section "precheck.industry.conf" "$_ip_content"
  # precheck.conf 尾部挂 source（core 的 patch source 之前——行业先于用户覆盖）
  _ind_line='[[ -f "${_conf_self_dir}/precheck.industry.conf" ]] && source "${_conf_self_dir}/precheck.industry.conf" || true'
  _patch_line='[[ -f "$_conf_self_dir/precheck.patch.conf" ]] && source "$_conf_self_dir/precheck.patch.conf" || true'
  # 插到 patch source 行之前（行业先于用户覆盖；patch 仍最末胜出）
  core=$(printf '%s\n' "$core" | awk -v ind="$_ind_line" -v pat="$_patch_line" '
    $0 == pat { print ind }
    { print }
  ')
fi

# lite 档无 arch.conf，探测到的 ACTIVE_FRAMEWORKS
# 此前不落任何 conf（框架清单只在 stdout 提示）——框架门禁对 lite 档永远无法注入/生效。
# 修复：lite 档把框架清单渲染进主 conf 尾部（standard/compliance 档仍归 arch.conf）。
if [[ "$PROFILE" == "lite" && -n "$_frameworks" ]]; then
  _fw_line="ACTIVE_FRAMEWORKS=("
  for _f in $_frameworks; do _fw_line="${_fw_line}\"${_f}\" "; done
  _fw_line="${_fw_line% })  # AUTO:detected"
  core="${core}
${_fw_line}"
fi

# lite 档无 arch.conf——check_api 随 --all-full/--api 真实执行，但其接口测试覆盖层（API_TEST_*）
# 的配置面只在 arch.conf 模板（R132 D2 实抓：task-type 把 test 任务映射 --api，lite 档却永远空转且静默）。
# 修复与上方 ACTIVE_FRAMEWORKS 同法：lite 档把该块从 arch 模板整段抽渲进主 conf（单一事实源仍是
# assets/precheck.arch.conf；standard/compliance 档维持 arch.conf 分发不动）。
if [[ "$PROFILE" == "lite" ]]; then
  _api_block=$(sed -n '/^API_SPEC_DIR=/,/^API_TEST_REQUIRE_STATUS=/p' "$BASE/assets/precheck.arch.conf")
  if [[ -n "$_api_block" ]]; then
    core="${core}

# ===== 接口测试覆盖（lite 档补渲——此块在 standard/compliance 档随 precheck.arch.conf 分发）=====
${_api_block}"
  fi
fi

_emit_section "precheck.conf" "$core"

if [[ "$PROFILE" == "standard" || "$PROFILE" == "compliance" ]]; then
  arch=$(_render_conf "assets/precheck.arch.conf") || exit 1
  # arch.conf 模板把 79 框架的全部变量行（51+）整份渲染进
  # 骨架，与懒生成约定（骨架期只留激活框架变量）断裂——ACTIVE_FRAMEWORKS 只激活 N 个，
  # 骨架却带 51 个框架变量行（C 维死变量扫描 53 个实锤：48 个非激活框架占位 + 注释死变量）。
  # 修复：渲染后按 ACTIVE_FRAMEWORKS 懒裁剪——保留激活框架 requires_conf 并集 + 非框架专属变量
  # （通用安全/构建/部署），注释死变量行（可恢复，与 sync_framework_vars 同款处置，不删除）。
  if [[ -n "$_frameworks" ]]; then
    _keep_vars=""
    for _fw in $_frameworks; do
      _frag="$BASE/assets/framework-gates/${_fw}.sh"
      [[ -f "$_frag" ]] || continue
      _keep_vars="$_keep_vars $(sed -n 's/^# ruleset:.*requires_conf: *//p' "$_frag" | tr -s ' ')"
    done
    arch=$(printf '%s\n' "$arch" | awk -v keep="$_keep_vars" '
      BEGIN { n = split(keep, arr, " "); for (i = 1; i <= n; i++) if (arr[i] != "") kv[arr[i]] = 1 }
      {
        # 框架专属变量行（含 _GLOBS/_FILES/_PATTERNS/_DIRS/_THRESHOLD/_STORE/_REQUIRED/_FILE 后缀）且不在激活并集
        # 且不在激活并集 → 注释死变量；其余（通用变量 + 激活框架变量）保留
        if (/^[A-Z_][A-Z0-9_]+=/ && /(_GLOBS|_FILES|_PATTERNS|_DIRS|_THRESHOLD|_STORE|_REQUIRED|_FILE)=/) {
          vn = $0; sub(/=.*/, "", vn)
          if (!(vn in kv)) { print "# deprecated（框架未激活，可恢复）" $0; next }
        }
        print
      }
    ')
  fi
  _emit_section "precheck.arch.conf" "$arch"
fi

if [[ "$PROFILE" == "compliance" ]]; then
  comp=$(_render_conf "assets/precheck.compliance.conf") || exit 1
  _emit_section "precheck.compliance.conf" "$comp"
fi

# 用户覆盖层骨架（dsh 吸收·分层 patch 最小步）：纯注释零变量（不进 conf 计数）。
# 加载顺序 core→arch→compliance→patch（precheck.conf 尾部 source，后写胜出）：
# 用户在这里覆盖生成值，不直接改生成的 conf 文件 → upgrade 保留用户配置不再依赖
# "文件被手改"启发式，根治升级漂移。--dump-conf 按同一顺序输出合成视图+来源层。
patch_skel='# precheck.patch.conf —— 用户覆盖层（分层 patch）
# 用法：在此覆盖任意生成变量（后 source 即胜出），例：
#   SENSITIVE_TOOL=builtin          # 覆盖 core 层的 auto
#   ACTIVE_FRAMEWORKS=("vue" "koa") # 覆盖 arch 层框架清单
# 请只写覆盖行，不要复制整份生成 conf——升级时本文件原样保留。'
_emit_section "precheck.patch.conf" "$patch_skel"

# TODO:model 清单汇总
# 原文案写在双引号串里，字面 "" 被 shell 吞成两个空格；SERVICE_DIRS 在
# 渲染后 arch conf 已是 deprecated 注释行，列入清单会误导模型填废弃变量——移除。
todo='# ===== # TODO:model 清单（须模型补实值）=====
# LAYER_DEFS / WRITABLE_DIRS / READONLY_DIRS / SCAN_DIRS / CONSISTENCY_DIRS
# （STORE_DIR / COMPONENT_DIR 为单目录标量，保留模板 "" 形态不列入数组 TODO 清单）
# （标注 deprecated 的变量不列本清单——恢复时手工解开 arch.conf 对应注释行）'
if [[ -n "$OUT" ]]; then
  if ! printf '%s\n' "$todo" > "$OUT/TODO-model.txt"; then
    echo "✗ conf-render: 写出失败: $OUT/TODO-model.txt" >&2
    exit 1
  fi
else
  printf '%s\n' "$todo"
fi
exit 0
