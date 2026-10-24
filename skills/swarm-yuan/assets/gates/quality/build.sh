# gate: build
# domain: quality / enforce: warn / tier: core
check_build() {
  echo "=== 构建状态检查 ==="
  if [[ -z "$BUILD_CMD" || "$BUILD_CMD" == "<build 命令>" ]]; then
    echo "  (跳过：未配置 BUILD_CMD)"
    return
  fi
  # 显式捕获退出码——原实现
  # `if eval "$BUILD_CMD" | tail` 判的是管道尾命令（tail）的退出码，正确性依赖外层
  # pipefail 的间接传导；且命令不存在（127）与构建失败同词"构建失败"，排障方向不明。
  # 拆分捕获：127 单列（命令缺失→指向工具链/conf），其余才报"构建失败"。
  local _bout _brc
  _bout=$(eval "$BUILD_CMD" 2>&1 | tail -10) && _brc=0 || _brc=1
  printf '%s\n' "$_bout"
  if [[ "$_brc" -eq 0 ]]; then
    pass "构建通过"
  elif printf '%s\n' "$_bout" | grep -qiE 'command not found|未找到命令'; then
    fail "构建命令不可执行（command not found）：$BUILD_CMD——安装对应工具链或回生成流程 Step 8 修 conf（命令缺失≠构建失败，排障方向不同）"
  else
    fail "构建失败"
  fi
}
