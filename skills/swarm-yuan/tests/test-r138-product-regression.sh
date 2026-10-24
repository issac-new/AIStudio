#!/usr/bin/env bash
# test-r138-product-regression.sh — R138 典型场景回归（nest-forge 全栈生成→研发）实抓缺陷锁
# 背景：v2.91.0 全量 sweep 全绿，但「生成技能 + 基于其做研发工作」端到端验收抓出 5 族缺陷——
#   生成器侧自洽测试（sweep/verifier）不覆盖产物侧运行面与 NestJS 双包形态。
# 缺陷与锁（编号沿用本轮排查清单）：
#   #1 dist.tsv 未登记 assets/lib/files.sh → 产物侧 detect-frameworks.sh files_* 全体
#      command not found 后仍输出「未探测到任何已知框架」假结果。锁=产物含 lib +
#      产物侧探测可跑 + 删 lib 后 fail-fast（不输出假结果）。
#   #3 gate_api_test_coverage 对 NestJS 四重失配：a) *.e2e-spec.ts 不在测试文件发现面
#      b) 无参 @Get()/@Post() 漏枚举 c) :id 冒号参数不转通配 d) @Controller 前缀不组合。
#      锁=最小 NestJS fixture 枚举/覆盖双断言。
#   #4 check_sensitive 内置族表达式排除过宽：secret: env.X ?? 'AKIA…' 兜底字面量整行
#      被吞。锁=兜底 AKIA 检出 + 干净 env 兜底零误报。
#   #5 check_stable_diff 稳定单元反推只锚 §4：§9 标「禁止改」的实体被改不告警。
#      锁=§9 标注反推 + 篡改告警。
#   #6 fw_jest_coverage_threshold 三漏：a) jest 配置零收集面 b) 跨配置单变量聚合
#      （一包开 --coverage 掩盖另一包）c) 数值阈值 ERE 不认 JSON 引号形态。
#      锁=双包 fixture 逐包点名 + jest 段（package.json 内嵌）进判定。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

B="$(pwd)"
W="$(mktemp -d /tmp/r138.XXXXXX)"
trap 'rm -rf "$W"' EXIT

# ---------- #1 分发完整性与 fail-fast ----------
t1() {
  echo "▶ #1 assets/lib 分发 + detect-frameworks fail-fast"
  local proj skill
  proj="$W/p1"; mkdir -p "$proj/src"
  printf '{"name":"p1","dependencies":{"express":"^4.0.0"}}\n' > "$proj/package.json"
  printf 'const e = require("express"); e.get("/x", (q,s)=>s.json(1));\n' > "$proj/src/app.js"
  if bash "$B/scripts/generate-skill.sh" --profile lite p1 "$proj" "$proj/.claude/skills" >/dev/null 2>&1; then
    skill="$proj/.claude/skills/p1"
    [[ -f "$skill/assets/lib/files.sh" ]] && ok "#1 产物含 assets/lib/files.sh" || bad "#1 产物缺 assets/lib/files.sh（dist.tsv 未分发）"
    local out rc
    out="$(bash "$skill/scripts/detect-frameworks.sh" "$proj" 2>&1)"; rc=$?
    if [[ $rc -eq 0 ]] && printf '%s' "$out" | grep -q 'express'; then
      ok "#1 产物侧 detect-frameworks.sh 探测正常（命中 express）"
    else
      bad "#1 产物侧 detect-frameworks.sh 失效（rc=${rc}）: $(printf '%s' "$out" | tail -2)"
    fi
    # fail-fast：抽走 lib 后必须显式失败且不输出「未探测到」假结果
    mv "$skill/assets/lib" "$W/lib-backup"
    out="$(bash "$skill/scripts/detect-frameworks.sh" "$proj" 2>&1)"; rc=$?
    if [[ $rc -ne 0 ]] && printf '%s' "$out" | grep -q '运行时库缺失'; then
      ok "#1 lib 缺失 fail-fast（显式报错，不输出空结果）"
    else
      bad "#1 lib 缺失未 fail-fast（rc=${rc}）: $(printf '%s' "$out" | tail -2)"
    fi
    mv "$W/lib-backup" "$skill/assets/lib"
  else
    bad "#1 generate-skill.sh create 失败"
  fi
}

# ---------- #3 NestJS 端点枚举与 e2e 覆盖匹配 ----------
t3() {
  echo "▶ #3 NestJS 端点枚举（前缀/无参/:id）+ *.e2e-spec.ts 发现面"
  local proj ctl e2e out
  proj="$W/p3"; mkdir -p "$proj/src" "$proj/test"
  printf '{"name":"p3","dependencies":{"@nestjs/core":"^11.0.0"}}\n' > "$proj/package.json"
  ctl="$proj/src/tasks.controller.ts"
  cat > "$ctl" <<'EOF'
import { Controller, Get, Post, Patch, Delete } from '@nestjs/common';
@Controller('tasks')
export class TasksController {
  @Get()
  list() { return []; }
  @Get('stats')
  stats() { return {}; }
  @Get(':id')
  one() { return {}; }
  @Post()
  create() { return {}; }
  @Patch(':id')
  update() { return {}; }
  @Delete(':id')
  remove() { return {}; }
}
EOF
  e2e="$proj/test/tasks.e2e-spec.ts"
  cat > "$e2e" <<'EOF'
const r1 = await request(app).get('/api/tasks');
const r2 = await request(app).get('/api/tasks/stats');
const id = 1;
const r3 = await request(app).patch(`/api/tasks/${id}`);
const r4 = await request(app).post('/api/tasks');
const r5 = await request(app).delete(`/api/tasks/${id}`);
expect(r1.status).toBe(200);
EOF
  # a) 测试发现面：*.e2e-spec.ts 须被 _ct_test_files 收集（gates-advisory 与 gates-warn 双份）
  local hit_a hit_w
  hit_a=$(PROJECT_DIR="$proj" bash -c "source '$B/assets/gates-advisory.sh' >/dev/null 2>&1; _ct_test_files" 2>/dev/null | grep -c 'tasks.e2e-spec.ts')
  hit_w=$(PROJECT_DIR="$proj" bash -c "source '$B/assets/gates-warn.sh' >/dev/null 2>&1; _ct_test_files" 2>/dev/null | grep -c 'tasks.e2e-spec.ts')
  [[ "$hit_a" -ge 1 && "$hit_w" -ge 1 ]] && ok "#3a *.e2e-spec.ts 进测试文件发现面（advisory+warn 双份）" \
    || bad "#3a *.e2e-spec.ts 不在发现面（advisory=${hit_a} warn=${hit_w}）"
  # b) 端点枚举：前缀组合 + 无参 + :id 归一
  out=$(bash -c "source '$B/assets/gates-advisory.sh' >/dev/null 2>&1; _api_route_paths_from_file '$ctl'" 2>/dev/null | sort)
  local want
  want="$(printf 'DELETE /tasks/{id}\nGET /tasks\nGET /tasks/{id}\nGET /tasks/stats\nPATCH /tasks/{id}\nPOST /tasks' | sort)"
  [[ "$out" == "$want" ]] && ok "#3b 端点枚举 6/6（前缀组合/无参/:id→{id}）" \
    || { bad "#3b 端点枚举漂移: $(printf '%s' "$out" | tr '\n' ' ')"; }
  # c) 覆盖匹配：模板字符串（反引号结尾）与普通字符串双命中
  local cov
  for ep in "GET /tasks" "GET /tasks/stats" "PATCH /tasks/{id}" "DELETE /tasks/{id}"; do
    if bash -c "source '$B/assets/gates-advisory.sh' >/dev/null 2>&1; _api_test_covers_endpoint '$e2e' '$ep'" 2>/dev/null; then
      :
    else
      bad "#3c 端点匹配失败: $ep"
      cov=1
    fi
  done
  [[ "${cov:-0}" -eq 0 ]] && ok "#3c e2e-spec 覆盖匹配 4/4（含模板字符串形态）"
}

# ---------- #4 sensitive 高置信兜底密钥 ----------
t4() {
  echo "▶ #4 sensitive：env 兜底字面量里的结构化密钥检出"
  local run
  run() { # $1=src 内容 → 回显 --sensitive 退出结果（0=pass 1=fail）
    local d="$W/p4"; rm -rf "$d"; mkdir -p "$d/scripts" "$d/src"
    cp "$B/assets/precheck.sh" "$B/assets/gates-strict.sh" "$B/assets/gates-warn.sh" "$B/assets/gates-advisory.sh" "$d/scripts/"
    printf 'PROJECT_DIR="%s"\nSCAN_DIRS=("src")\n' "$d" > "$d/scripts/precheck.conf"
    printf '%s\n' "$1" > "$d/src/config.ts"
    ( cd "$d" && SENSITIVE_TOOL=builtin bash "$d/scripts/precheck.sh" --sensitive ) >/dev/null 2>&1
  }
  if run 'export const c = { secret: process.env.JWT ?? "AKIAQ7XG2MBR3LKZP9VD" };'; then
    bad "#4 env 兜底 AKIA 密钥漏报"
  else
    ok "#4 env 兜底 AKIA 密钥检出（fail）"
  fi
  if run 'export const c = { secret: process.env.JWT ?? "", retries: parseInt(process.env.N ?? "3") };'; then
    ok "#4 干净 env 兜底零误报（pass）"
  else
    bad "#4 干净 env 兜底误报"
  fi
}

# ---------- #5 stable-diff §9 反推 ----------
t5() {
  echo "▶ #5 stable-diff：§9 禁止改标注反推 + 篡改告警"
  local d
  d="$W/p5"; mkdir -p "$d/.claude/skills/s5/references" "$d/src/ent"
  ( cd "$d" && git init -q -b main && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m base )
  cat > "$d/.claude/skills/s5/references/reference-manual.md" <<'EOF'
## §9 数据勾稽
| 路径 | 说明与约束 |
|------|--------------|
| `src/ent/order.ts` | 订单实体（禁止改——勾稽恒等式） |
EOF
  printf 'export class Order {}\n' > "$d/src/ent/order.ts"
  ( cd "$d" && git add -A && git -c user.name=t -c user.email=t@t commit -qm add && git checkout -q -b feat/x )
  printf 'export class Order { changed = 1; }\n' > "$d/src/ent/order.ts"
  mkdir -p "$d/scripts"
  cp "$B/assets/precheck.sh" "$B/assets/gates-strict.sh" "$B/assets/gates-warn.sh" "$B/assets/gates-advisory.sh" "$d/scripts/"
  printf 'PROJECT_DIR="%s"\n' "$d" > "$d/scripts/precheck.conf"
  local out
  out="$( cd "$d" && bash "$d/scripts/precheck.sh" --stable-diff 2>&1 )"
  printf '%s' "$out" | grep -q 'src/ent/order.ts' && ok "#5 §9 标注被篡改触发告警" \
    || bad "#5 §9 标注被篡改未告警（输出见 stderr）"
}

# ---------- #6 coverage 逐包判定 + jest 段收集面 ----------
t6() {
  echo "▶ #6 fw_jest_coverage_threshold：jest 段收集 + 逐包点名 + JSON 阈值 ERE"
  local d out
  d="$W/p6"; mkdir -p "$d/scripts" "$d/front" "$d/back"
  cat > "$d/front/package.json" <<'EOF'
{ "name": "front", "scripts": { "test": "vitest run --coverage" },
  "devDependencies": { "@vitest/coverage-v8": "2.1.9" } }
EOF
  cat > "$d/front/vite.config.ts" <<'EOF'
export default { test: { coverage: { enabled: false, thresholds: { lines: 50 } } } };
EOF
  cat > "$d/back/package.json" <<'EOF'
{ "name": "back", "scripts": { "test": "jest" },
  "jest": { "coverageThreshold": { "global": { "lines": 50, "branches": 50 } } } }
EOF
  cp "$B/assets/precheck.sh" "$B/assets/gates-strict.sh" "$B/assets/gates-warn.sh" "$B/assets/gates-advisory.sh" "$d/scripts/"
  {
    printf 'PROJECT_DIR="%s"\n' "$d"
    printf 'ACTIVE_FRAMEWORKS=("jest-vitest")\n'
    printf 'VITEST_CONFIG_GLOBS=("%s/front/vite.config.ts")\n' "$d"
    printf 'VITEST_TEST_GLOBS=()\n'
  } > "$d/scripts/precheck.conf"
  # 注入框架门禁片段（同 r132 测试的 awk 法）
  awk -v frag="$B/assets/framework-gates/jest-vitest.sh" '
    /^# >>> swarm-yuan:framework-gates >>>/ { print; while ((getline l < frag) > 0) print l; skip=1; next }
    /^# <<< swarm-yuan:framework-gates <<</ { skip=0 }
    !skip { print }
  ' "$d/scripts/precheck.sh" > "$d/scripts/p2.sh" && mv "$d/scripts/p2.sh" "$d/scripts/precheck.sh"
  out="$( cd "$d" && bash "$d/scripts/precheck.sh" --framework 2>&1 )"
  printf '%s' "$out" | grep -q 'back/package.json（test 脚本不带 --coverage' \
    && ok "#6 backend（jest 内嵌段）被逐包点名（未开 --coverage）" \
    || bad "#6 backend 漏报或未点名: $(printf '%s' "$out" | grep fw_jest_coverage_threshold | head -1)"
  printf '%s' "$out" | grep -q 'front/vite.config.ts' && bad "#6 frontend（已开 --coverage）被误报" \
    || ok "#6 frontend（已开 --coverage）不误报"
}

t7() {
  echo "▶ #7 R139 路由枚举：方法级 @RequestMapping / 无斜杠拼接 / 空 @Controller()"
  local d out want
  d="$W/p7"; mkdir -p "$d"
  cat > "$d/OrderController.java" <<'EOF'
@RequestMapping("/api/orders")
public class OrderController {
  @PostMapping
  public ResponseEntity<?> create() { return null; }
  @GetMapping("recent")
  public ResponseEntity<?> recent() { return null; }
  @RequestMapping(value = "/export", method = RequestMethod.GET)
  public ResponseEntity<?> export() { return null; }
}
EOF
  out="$( ( source "$B/assets/gates/_lib.sh" && _api_route_paths_from_file "$d/OrderController.java" ) | sort )"
  want="$(printf 'GET /api/orders/recent\nPOST /api/orders\nREQUEST /api/orders/export' | sort)"
  if [[ "$out" == "$want" ]]; then
    ok "#7a Java：方法级 @RequestMapping(method=) 枚举为 REQUEST + 无斜杠方法路径补 /"
  else
    bad "#7a Java 枚举漂移: $(printf '%s' "$out" | tr '\n' ' ')"
  fi
  cat > "$d/task.controller.ts" <<'EOF'
@Controller()
export class TaskController {
  @Get() list() { return []; }
  @Get('stats') stats() { return {}; }
}
EOF
  out="$( ( source "$B/assets/gates/_lib.sh" && _api_route_paths_from_file "$d/task.controller.ts" ) | sort )"
  want="$(printf 'GET /\nGET /stats' | sort)"
  if [[ "$out" == "$want" ]]; then
    ok "#7b NestJS：空 @Controller() 不再产出 // 双斜杠"
  else
    bad "#7b NestJS 空 base 漂移: $(printf '%s' "$out" | tr '\n' ' ')"
  fi
}

t1; t3; t4; t5; t6; t7
if [[ "$FAIL" -eq 0 ]]; then
  echo "PASS: R138 全部缺陷锁断言通过"
  exit 0
fi
echo "FAIL: R138 缺陷锁存在失败断言" >&2
exit 1
