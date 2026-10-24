#!/usr/bin/env bash
# mock semgrep：输出含 1 条 ERROR severity 结果的 JSON（忽略参数，恒 exit 0）
mkdir -p .mockbin
cat > .mockbin/semgrep <<'EOF'
#!/usr/bin/env bash
echo '{"results":[{"check_id":"test.sql-injection","severity":"ERROR","path":"src/App.java","line":3}]}'
EOF
chmod +x .mockbin/semgrep
printf '%s\n' "$PWD/.mockbin" > .mockbin-path
