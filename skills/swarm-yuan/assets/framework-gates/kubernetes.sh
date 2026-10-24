# ruleset: kubernetes  requires_conf: KUBERNETES_GLOBS
# gates: fw_kubernetes_latest_image(fail) fw_kubernetes_privileged(fail) fw_kubernetes_run_as_root(fail) fw_kubernetes_no_resource_limits(warn) fw_kubernetes_no_probes(warn) fw_kubernetes_default_namespace(warn) fw_kubernetes_hardcoded_secret(fail) fw_kubernetes_no_network_policy(warn) fw_kubernetes_no_pdb(warn) fw_kubernetes_image_pull_policy(warn)
# harvested-from: 新增（2026-07-23），规律源自 kubernetes.io 官方文档 / CIS Kubernetes Benchmark v1.8.0 / kube-bench+kubescape 规则库 / NSA Kubernetes Hardening Guide 2022
_fw_kubernetes_check() {
  echo "  [kubernetes] Kubernetes 1.25+ IaC 规律"

  # ---------- 收集文件清单（*.yaml/*.yml 统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${KUBERNETES_GLOBS[@]+"${KUBERNETES_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "kubernetes: KUBERNETES_GLOBS 未配置或无文件可检"
    return
  fi

  # YAML 注释剥离：YAML 仅 # 行注释，用 _fw_strip_comments_cfg（剔 # 行）
  # 注意：YAML 的 # 注释可在行尾（如 key: value # comment），_fw_strip_comments_cfg 剔整行 #
  #   不会剥行尾注释，但本规则集的关键字段匹配（image:/privileged:/runAsNonRoot 等）不受行尾注释影响
  local t ln

  # ====================================================================
  # fw_kubernetes_latest_image(fail)：image: 禁 :latest 标签
  # ====================================================================
  # 口径：YAML 剥 # 注释后命中 `image: xxx:latest` → fail
  local latest_bad=""
  for t in "${srcarr[@]}"; do
    ln=$(_fw_strip_comments_cfg "$t" | grep -nE 'image:[[:space:]]*[^[:space:]"'\''@]+:latest' || true)
    [[ -n "$ln" ]] && latest_bad="${latest_bad}${t}:${ln}
"
  done
  _fw_report fail fw_kubernetes_latest_image "${latest_bad}" "image: 使用 :latest 标签（标签可变致调度漂移+供应链投毒，CWE-668；GB/T 22239-2019 8.1.4.3）" "镜像用 digest 或版本号标签"

  # ====================================================================
  # fw_kubernetes_privileged(fail)：禁止 privileged: true
  # ====================================================================
  local priv_bad=""
  for t in "${srcarr[@]}"; do
    ln=$(_fw_strip_comments_cfg "$t" | grep -nE 'privileged:[[:space:]]*true' || true)
    [[ -n "$ln" ]] && priv_bad="${priv_bad}${t}:${ln}
"
  done
  _fw_report fail fw_kubernetes_privileged "${priv_bad}" "容器 privileged: true（特权容器逃逸即获宿主 root，CWE-250；GB/T 22239-2019 8.1.4.1）" "无 privileged 容器"

  # ====================================================================
  # fw_kubernetes_run_as_root(fail)：须 runAsNonRoot: true
  # ====================================================================
  # 口径：含 containers: 的清单须含 runAsNonRoot: true；缺 → fail（文件级启发式）
  local root_bad=""
  for t in "${srcarr[@]}"; do
    _fw_strip_comments_cfg "$t" | grep -qE 'containers:' || continue
    if ! _fw_strip_comments_cfg "$t" | grep -qE 'runAsNonRoot:[[:space:]]*true'; then
      root_bad="${root_bad}${t}
"
    fi
  done
  _fw_report fail fw_kubernetes_run_as_root "${root_bad}" "工作负载清单无 runAsNonRoot: true（容器以 root 运行，CWE-250；CIS Benchmark 5.2.1）" "已配 runAsNonRoot 或无工作负载"

  # ====================================================================
  # fw_kubernetes_no_resource_limits(warn)：须 resources.limits
  # ====================================================================
  local lim_bad=""
  for t in "${srcarr[@]}"; do
    _fw_strip_comments_cfg "$t" | grep -qE 'containers:' || continue
    if ! _fw_strip_comments_cfg "$t" | grep -qE 'limits:'; then
      lim_bad="${lim_bad}${t}
"
    fi
  done
  _fw_report warn fw_kubernetes_no_resource_limits "${lim_bad}" "工作负载清单无 resources.limits（单容器可耗尽节点资源致驱逐，CWE-400；CIS 5.1.3）" "已配 resources.limits 或无工作负载"

  # ====================================================================
  # fw_kubernetes_no_probes(warn)：须 livenessProbe + readinessProbe
  # ====================================================================
  local probe_bad=""
  for t in "${srcarr[@]}"; do
    _fw_strip_comments_cfg "$t" | grep -qE 'containers:' || continue
    local has_live=0 has_ready=0
    _fw_strip_comments_cfg "$t" | grep -qE 'livenessProbe:' && has_live=1
    _fw_strip_comments_cfg "$t" | grep -qE 'readinessProbe:' && has_ready=1
    if [[ "$has_live" -eq 0 || "$has_ready" -eq 0 ]]; then
      probe_bad="${probe_bad}${t}（liveness=${has_live}, readiness=${has_ready}）
"
    fi
  done
  _fw_report warn fw_kubernetes_no_probes "${probe_bad}" "工作负载清单缺 livenessProbe 或 readinessProbe（进程假死不可探测，CWE-1188；GB/T 22239-2019 8.1.4.5）" "已配 liveness+readiness 或无工作负载"

  # ====================================================================
  # fw_kubernetes_default_namespace(warn)：namespace 须显式非 default
  # ====================================================================
  # 口径：工作负载清单（含 Deployment/StatefulSet/DaemonSet 的文件）须 metadata.namespace 非 default
  local ns_bad=""
  for t in "${srcarr[@]}"; do
    # 仅对工作负载类清单判定（含 kind: Deployment|StatefulSet|DaemonSet）
    _fw_strip_comments_cfg "$t" | grep -qE 'kind:[[:space:]]*(Deployment|StatefulSet|DaemonSet)' || continue
    # 检查 metadata.namespace 是否存在且非 default
    local ns_line
    ns_line=$(_fw_strip_comments_cfg "$t" | grep -E 'namespace:[[:space:]]*[^[:space:]]+' || true)
    if [[ -z "$ns_line" ]]; then
      ns_bad="${ns_bad}${t}: 无 namespace（落入 default）
"
    else
      # namespace 存在但为 default 也报
      printf '%s\n' "$ns_line" | grep -qE 'namespace:[[:space:]]*default([[:space:]]|$)' && ns_bad="${ns_bad}${t}: namespace=default
"
    fi
  done
  _fw_report warn fw_kubernetes_default_namespace "${ns_bad}" "工作负载清单 namespace 缺失或为 default（混入系统默认空间，CWE-668；GB/T 22239-2019 8.1.3.2）" "namespace 显式非 default"

  # ====================================================================
  # fw_kubernetes_hardcoded_secret(fail)：Secret 须挂载不硬编码
  # ====================================================================
  # 口径：kind: Secret 的清单含 stringData: 即 fail（stringData 是明文足印，base64 data: 不算明文）
  #   说明：base64 data: 虽"非加密"（可解码），但门禁无法用 grep 可靠区分 base64 与真 hash/密文；
  #   stringData: 是 Kubernetes 明文足印（YAML 直接写明文，kubectl apply 时才 base64），
  #   即"硬编码明文"的明确信号 → 自动 fail；data: base64 值走人工审计（不自动 fail）
  local sec_bad=""
  for t in "${srcarr[@]}"; do
    _fw_strip_comments_cfg "$t" | grep -qE 'kind:[[:space:]]*Secret\b' || continue
    local has_stringdata=0
    _fw_strip_comments_cfg "$t" | grep -qE 'stringData:' && has_stringdata=1
    if [[ "$has_stringdata" -eq 1 ]]; then
      local sd_lines
      sd_lines=$(_fw_strip_comments_cfg "$t" | grep -nE 'stringData:' || true)
      sec_bad="${sec_bad}${t}: Secret 含 stringData（明文密钥，CWE-798）:
${sd_lines}
"
    fi
  done
  _fw_report fail fw_kubernetes_hardcoded_secret "${sec_bad}" "Secret 资源内硬编码明文密钥（stringData 明文进 git 历史与 etcd，CWE-798；须 envFrom/secretKeyRef 引用挂载或 data: base64）" "Secret 无 stringData 明文（data: base64 或引用挂载）"

  # ====================================================================
  # fw_kubernetes_no_network_policy(warn)：须 NetworkPolicy
  # ====================================================================
  # 口径：全仓库无 kind: NetworkPolicy 清单 → warn
  local has_np=0
  for t in "${srcarr[@]}"; do
    if _fw_strip_comments_cfg "$t" | grep -qE 'kind:[[:space:]]*NetworkPolicy\b'; then has_np=1; break; fi
  done
  if [[ "$has_np" -eq 0 ]]; then
    warn "fw_kubernetes_no_network_policy: 仓库无 NetworkPolicy（Pod 间默认 allow-all，横向移动无限制，CWE-732；GB/T 22239-2019 8.1.3.2）"
  else
    pass "fw_kubernetes_no_network_policy: 已配 NetworkPolicy"
  fi

  # ====================================================================
  # fw_kubernetes_no_pdb(warn)：须 PodDisruptionBudget
  # ====================================================================
  local has_pdb=0
  for t in "${srcarr[@]}"; do
    if _fw_strip_comments_cfg "$t" | grep -qE 'kind:[[:space:]]*PodDisruptionBudget\b'; then has_pdb=1; break; fi
  done
  if [[ "$has_pdb" -eq 0 ]]; then
    warn "fw_kubernetes_no_pdb: 仓库无 PodDisruptionBudget（自愿驱逐可一次性杀光副本，GB/T 22239-2019 8.1.4.5）"
  else
    pass "fw_kubernetes_no_pdb: 已配 PodDisruptionBudget"
  fi

  # ====================================================================
  # fw_kubernetes_image_pull_policy(warn)：须 imagePullPolicy: IfNotPresent
  # ====================================================================
  local ipp_bad=""
  for t in "${srcarr[@]}"; do
    _fw_strip_comments_cfg "$t" | grep -qE 'containers:' || continue
    if ! _fw_strip_comments_cfg "$t" | grep -qE 'imagePullPolicy:[[:space:]]*IfNotPresent'; then
      ipp_bad="${ipp_bad}${t}
"
    fi
  done
  _fw_report warn fw_kubernetes_image_pull_policy "${ipp_bad}" "工作负载清单无 imagePullPolicy: IfNotPresent（默认 Always 浪费带宽+标签可变，CWE-668；GB/T 25000.51-2016）" "已配 IfNotPresent 或无工作负载"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
