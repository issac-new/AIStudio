#!/usr/bin/env bash
# test-api-test-coverage.sh — check_api 接口测试覆盖回归锁
# 覆盖：OpenAPI 端点枚举、路由声明兜底、端点×测试映射、状态码断言、strict/warn 两档。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"
TMP="$(mktemp -d /tmp/apicov.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

new_project() {
  P="$TMP/p$1"
  mkdir -p "$P/scripts" "$P/tests" "$P/apispecs"
  cp "$BASE/assets/precheck.sh" "$BASE/assets/gates-warn.sh" \
     "$BASE/assets/gates-strict.sh" "$BASE/assets/gates-advisory.sh" \
     "$BASE/assets/gate-enforce-level.conf" "$BASE/assets/memory-backends.sh" \
     "$P/scripts/" 2>/dev/null || true
  cat > "$P/apispecs/order.yaml" <<'EOF'
openapi: 3.0.3
info:
  title: Order API
  version: "1.0.0"
paths:
  /orders:
    post:
      responses:
        '201':
          description: created
  /users:
    get:
      responses:
        '200':
          description: ok
EOF
}

run_gate() { # $1=conf 追加内容 → stdout
  cat > "$P/scripts/precheck.conf" <<EOF
PROJECT_DIR="$P"
API_SPEC_DIR="apispecs"
$1
EOF
  bash "$P/scripts/precheck.sh" --api 2>&1 || true
}

# 1) 2 端点仅覆盖 1 个 → strict fail
new_project 1
cat > "$P/tests/order.test.ts" <<'EOF'
test('creates order', async () => {
  const res = await request(app).post('/orders');
  expect(res.status).toBe(201);
});
EOF
out=$(run_gate 'API_TEST_MIN_RATIO=80
API_TEST_STRICT=1
API_TEST_REQUIRE_STATUS=1')
grep -qF 'gate_api_test_coverage' <<<"$out" && grep -qF '1/2' <<<"$out" \
  && ok "端点覆盖 1/2 < 80% → fail" || bad "端点未覆盖未拦截: $out"

# 2) 两端点均覆盖 + 状态码断言 → pass
new_project 2
cat > "$P/tests/api.test.ts" <<'EOF'
test('creates order', async () => {
  const res = await request(app).post('/orders');
  expect(res.status).toBe(201);
});
test('gets user', async () => {
  const res = await request(app).get('/users');
  expect(res.status).toBe(200);
});
EOF
out=$(run_gate 'API_TEST_MIN_RATIO=80
API_TEST_STRICT=1
API_TEST_REQUIRE_STATUS=1')
grep -qF '接口测试覆盖 2/2（100%）' <<<"$out" && grep -qF '接口测试覆盖端点均有就近状态码断言（2/2）' <<<"$out" \
  && ok "端点全覆盖 + 状态码断言 → pass" || bad "接口测试合规侧误报: $out"

# 3) 无接口测试文件 → strict fail
new_project 3
out=$(run_gate 'API_TEST_MIN_RATIO=80
API_TEST_STRICT=1')
grep -qF '未发现接口测试文件' <<<"$out" \
  && ok "无接口测试 → fail" || bad "无接口测试未拦截: $out"

# 4) 路由声明兜底（无 OpenAPI）：Express 路由 2 个，仅覆盖 1 个 → fail
new_project 4
mkdir -p "$P/src"
cat > "$P/src/routes.ts" <<'EOF'
router.get('/orders', listOrders);
router.post('/users', createUser);
EOF
cat > "$P/tests/order.test.ts" <<'EOF'
test('lists orders', async () => {
  const res = await request(app).get('/orders');
  expect(res.status).toBe(200);
});
EOF
out=$(run_gate 'API_SPEC_DIR=""
WRITE_HANDLER_DIRS=("src")
API_TEST_MIN_RATIO=80
API_TEST_STRICT=1
API_TEST_REQUIRE_STATUS=1')
grep -qF 'gate_api_test_coverage' <<<"$out" && grep -qF '1/2' <<<"$out" \
  && ok "路由声明兜底 1/2 → fail" || bad "路由兜底枚举失败: $out"

# 5) warn 档：覆盖不足只 warn，不阻断
new_project 5
cat > "$P/tests/order.test.ts" <<'EOF'
test('creates order', async () => {
  const res = await request(app).post('/orders');
  expect(res.status).toBe(201);
});
EOF
out=$(run_gate 'API_TEST_MIN_RATIO=80
API_TEST_STRICT=0')
rc=0
bash "$P/scripts/precheck.sh" --api >/dev/null 2>&1 || rc=$?
grep -qF '⚠ gate_api_test_coverage' <<<"$out" && [[ "$rc" -eq 0 ]] \
  && ok "API_TEST_STRICT=0 → warn 且 rc=0" || bad "warn 档行为异常（rc=${rc}）: $out"

# 6) 覆盖达标但无状态码断言 → strict fail
new_project 6
cat > "$P/tests/api.test.ts" <<'EOF'
test('creates order', async () => {
  const res = await request(app).post('/orders');
  expect(res.body.id).toBeDefined();
});
test('gets user', async () => {
  const res = await request(app).get('/users');
  expect(res.body.name).toBe('a');
});
EOF
out=$(run_gate 'API_TEST_MIN_RATIO=80
API_TEST_STRICT=1
API_TEST_REQUIRE_STATUS=1')
grep -qF 'gate_api_test_status' <<<"$out" \
  && ok "无状态码/错误路径断言 → fail" || bad "状态码断言缺失未拦截: $out"

# 7) 同一路径的 POST 与 GET 是两个端点；只测 POST 不得算全覆盖
new_project 7
cat > "$P/apispecs/order.yaml" <<'EOF'
openapi: 3.0.3
info:
  title: Order API
  version: "1.0.0"
paths:
  /orders:
    post:
      responses:
        '201':
          description: created
    get:
      responses:
        '200':
          description: ok
EOF
cat > "$P/tests/order.test.ts" <<'EOF'
test('creates order', async () => {
  const res = await request(app).post('/orders');
  expect(res.status).toBe(201);
});
EOF
out=$(run_gate 'API_TEST_MIN_RATIO=80
API_TEST_STRICT=1
API_TEST_REQUIRE_STATUS=1')
grep -qF '1/2' <<<"$out" && grep -qF 'gate_api_test_coverage' <<<"$out" \
  && ok "同路径不同方法仅覆盖 POST → 1/2 fail" || bad "HTTP 方法未参与端点覆盖判定: $out"

# 8) 两个方法都调用后仍须各自有状态码断言；另一个请求的状态码不得代答
new_project 8
cp "$TMP/p7/apispecs/order.yaml" "$P/apispecs/order.yaml"
cat > "$P/tests/order.test.ts" <<'EOF'
test('creates order', async () => {
  const res = await request(app).post('/orders');
  expect(res.status).toBe(201);
});
test('lists orders', async () => {
  const res = await request(app).get('/orders');
  expect(res.body.items).toHaveLength(1);
});
EOF
out=$(run_gate 'API_TEST_MIN_RATIO=80
API_TEST_STRICT=1
API_TEST_REQUIRE_STATUS=1')
grep -qF '接口测试覆盖 2/2（100%）' <<<"$out" && grep -qF 'gate_api_test_status' <<<"$out" \
  && ok "GET 已调用但缺自身状态码断言 → fail" || bad "状态码断言未归属到具体端点: $out"

# 9) OpenAPI JSON 同样按方法×路径计数；不能只抽路径字符串
new_project 9
rm -f "$P/apispecs/order.yaml"
cat > "$P/apispecs/order.json" <<'EOF'
{"openapi":"3.0.3","info":{"title":"Order API","version":"1.0.0"},"paths":{"/orders":{"post":{"responses":{"201":{"description":"created"}}},"get":{"responses":{"200":{"description":"ok"}}}}}}
EOF
cat > "$P/tests/order.test.ts" <<'EOF'
test('creates order', async () => {
  const res = await request(app).post('/orders');
  expect(res.status).toBe(201);
});
EOF
out=$(run_gate 'API_TEST_MIN_RATIO=80
API_TEST_STRICT=1
API_TEST_REQUIRE_STATUS=1')
grep -qF '1/2' <<<"$out" && grep -qF 'gate_api_test_coverage' <<<"$out" \
  && ! grep -qF 'API 定义缺 version' <<<"$out" \
  && ok "OpenAPI JSON 同路径仅覆盖 POST → 1/2 fail" || bad "OpenAPI JSON 未按方法枚举或版本误判: $out"

# 10) 路径参数是独立端点：/users 不能代答 /users/{id}
new_project 10
cat > "$P/apispecs/order.yaml" <<'EOF'
openapi: 3.0.3
info:
  title: User API
  version: "1.0.0"
paths:
  /users:
    get:
      responses:
        '200':
          description: list
  /users/{id}:
    get:
      responses:
        '200':
          description: one
EOF
cat > "$P/tests/user.test.ts" <<'EOF'
test('lists users', async () => {
  const res = await request(app).get('/users');
  expect(res.status).toBe(200);
});
EOF
out=$(run_gate 'API_TEST_MIN_RATIO=80
API_TEST_STRICT=1
API_TEST_REQUIRE_STATUS=1')
grep -qF '1/2' <<<"$out" && grep -qF 'gate_api_test_coverage' <<<"$out" \
  && ok "集合路径不得代答路径参数端点 → 1/2 fail" || bad "路径参数端点被静态前缀误判覆盖: $out"

# 11) 路径参数测试按真实值调用时可覆盖模板端点
new_project 11
cat > "$P/apispecs/order.yaml" <<'EOF'
openapi: 3.0.3
info:
  title: User API
  version: "1.0.0"
paths:
  /users/{id}:
    get:
      responses:
        '200':
          description: one
EOF
cat > "$P/tests/user.test.ts" <<'EOF'
test('gets one user', async () => {
  const res = await request(app).get('/users/42');
  expect(res.status).toBe(200);
});
EOF
out=$(run_gate 'API_TEST_MIN_RATIO=80
API_TEST_STRICT=1
API_TEST_REQUIRE_STATUS=1')
grep -qF '接口测试覆盖 1/1（100%）' <<<"$out" \
  && ok "路径参数端点按真实值测试 → pass" || bad "路径参数模板匹配误报未覆盖: $out"

[[ $FAIL -eq 0 ]] && { echo "PASS test-api-test-coverage"; exit 0; } || { echo "FAIL test-api-test-coverage" >&2; exit 1; }
