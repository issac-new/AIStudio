# ruleset: terraform  requires_conf: TERRAFORM_SRC_GLOBS
# gates: fw_terraform_state_in_git(fail) fw_terraform_hardcoded_secret(fail) fw_terraform_sg_open_world(fail) fw_terraform_s3_public(fail) fw_terraform_rds_public(fail) fw_terraform_backend_missing(warn) fw_terraform_backend_unencrypted(warn) fw_terraform_provider_unpinned(warn) fw_terraform_no_prevent_destroy(warn) fw_terraform_rds_unencrypted(warn) fw_terraform_sensitive_output(warn) fw_terraform_auto_approve(warn)
# harvested-from: P1/P2 批次 IaC 补盲（2026-07-20），规律源自 HashiCorp 官方文档与 tfsec/Checkov 规则库及 SquareOps/Spacelift 工程实践
_fw_terraform_check() {
  echo "  [terraform] Terraform 1.x IaC 规律"

  # ---------- 收集文件清单（.tf/.tfvars/脚本/CI/state 统一入 srcarr 后拆分） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${TERRAFORM_SRC_GLOBS[@]+"${TERRAFORM_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "terraform: TERRAFORM_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 .tf / .tfvars / 脚本与CI / state 文件
  local tfarr=() tfvarsarr=() ciarr=() statearr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.tf) tfarr+=("$f") ;;
      *.tfvars) tfvarsarr+=("$f") ;;
      *.sh|*.yml|*.yaml) ciarr+=("$f") ;;
      *.tfstate|*.tfstate.*) statearr+=("$f") ;;
    esac
  done

  # HCL 注释过滤：剥 # 行内注释与行首 // 整行注释（HCL 双注释风格；保留行内 // 防误伤 URL 字符串）
  _fw_tf_strip() { { sed -E 's:#.*$::; s:^[[:space:]]*//.*$::' "$1" 2>/dev/null || true; }; }

  local t c ln

  # ====================================================================
  # fw_terraform_state_in_git(fail)：state 文件不入库、不用 local backend
  # ====================================================================
  local state_bad=""
  for t in "${statearr[@]+"${statearr[@]}"}"; do
    state_bad="${state_bad}${t}
"
  done
  for t in "${tfarr[@]+"${tfarr[@]}"}"; do
    ln=$(_fw_tf_strip "$t" | grep -nE 'backend[[:space:]]+"local"' || true)
    [[ -n "$ln" ]] && state_bad="${state_bad}${t}:${ln}
"
  done
  _fw_report fail fw_terraform_state_in_git "${state_bad}" "state 文件入库或 backend \"local\"（state 明文存全部资源属性含密钥，CWE-312；GB/T 22239-2019 8.1.4.6）" "state 走远程 backend 且扫描树内无 tfstate 文件"

  # ====================================================================
  # fw_terraform_hardcoded_secret(fail)：禁密钥字面量 / 敏感 variable 禁非空 default
  # ====================================================================
  local sec_bad=""
  for t in "${tfarr[@]+"${tfarr[@]}"}" "${tfvarsarr[@]+"${tfvarsarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    # 密钥属性赋字符串字面量（剔除 var./local./data./${ 引用行）
    ln=$(_fw_tf_strip "$t" | grep -nE '(password|secret_key|access_key|private_key|api_key|client_secret)[[:space:]]*=[[:space:]]*"[^"]+"' | grep -vE 'var\.|local\.|data\.|\$\{' || true)
    [[ -n "$ln" ]] && sec_bad="${sec_bad}${t}:${ln}
"
    # 敏感名 variable 块内带非空 default（awk 块级跟踪）
    ln=$(_fw_tf_strip "$t" | awk '
      /^[[:space:]]*variable[[:space:]]+"[^"]*(password|secret|token|key)[^"]*"/ { invar=1; vline=NR; next }
      invar && /^[[:space:]]*default[[:space:]]*=[[:space:]]*"[^"]+"/ { print vline ": 敏感 variable 带非空 default: " $0 }
      invar && /^[[:space:]]*}/ { invar=0 }
    ' || true)
    [[ -n "$ln" ]] && sec_bad="${sec_bad}${t}:${ln}
"
  done
  _fw_report fail fw_terraform_hardcoded_secret "${sec_bad}" ".tf/.tfvars 硬编码密钥字面量或敏感 variable 带默认值（CWE-798/CWE-312，须 var 注入/Vault/OIDC 短时令牌）" "密钥均走 var 引用或外部密钥管理，无字面量"

  # ====================================================================
  # fw_terraform_sg_open_world(fail)：ingress 块级 22/3389/0 端口对 0.0.0.0/0
  # ====================================================================
  # 口径：awk 跟踪 ingress { 块，块内 from_port 22/3389/0 与 0.0.0.0/0 共现才报
  #   （同文件不同 ingress 块不误报；443 公共服务端口对公网属合规例外）
  local sg_bad=""
  for t in "${tfarr[@]+"${tfarr[@]}"}"; do
    ln=$(_fw_tf_strip "$t" | awk '
      /ingress[[:space:]]*\{/ { ining=1; pbad=0; world=0; start=NR; next }
      ining && /from_port[[:space:]]*=[[:space:]]*(22|3389|0)([[:space:]]|$)/ { pbad=1 }
      ining && /0\.0\.0\.0\/0/ { world=1 }
      ining && /^[[:space:]]*}/ {
        if (pbad && world) print start ": ingress 管理/全端口对 0.0.0.0/0 开放"
        ining=0; pbad=0; world=0
      }
    ' || true)
    [[ -n "$ln" ]] && sg_bad="${sg_bad}${t}:${ln}
"
  done
  _fw_report fail fw_terraform_sg_open_world "${sg_bad}" "安全组 22/3389/0 端口对 0.0.0.0/0 开放（CWE-732，全网暴力破解面；GB/T 22239-2019 8.1.3.2）" "管理端口已收窄 CIDR，仅公共服务端口（如 443）对公网"

  # ====================================================================
  # fw_terraform_s3_public(fail)：bucket acl 禁 public-*
  # ====================================================================
  local s3_bad=""
  for t in "${tfarr[@]+"${tfarr[@]}"}"; do
    ln=$(_fw_tf_strip "$t" | grep -nE 'acl[[:space:]]*=[[:space:]]*"public' || true)
    [[ -n "$ln" ]] && s3_bad="${s3_bad}${t}:${ln}
"
  done
  _fw_report fail fw_terraform_s3_public "${s3_bad}" "S3 bucket 使用 public-* ACL（CWE-732 对象存储公网可读，CIS S3 族）" "bucket ACL 私有或走 public_access_block 受控放行"

  # ====================================================================
  # fw_terraform_rds_public(fail)：数据库禁 publicly_accessible = true
  # ====================================================================
  local rds_bad=""
  for t in "${tfarr[@]+"${tfarr[@]}"}"; do
    ln=$(_fw_tf_strip "$t" | grep -nE 'publicly_accessible[[:space:]]*=[[:space:]]*true' || true)
    [[ -n "$ln" ]] && rds_bad="${rds_bad}${t}:${ln}
"
  done
  _fw_report fail fw_terraform_rds_public "${rds_bad}" "数据库实例 publicly_accessible = true（CWE-732，库端口直挂公网；GB/T 22239-2019 8.1.3.2）" "数据库仅私有子网内网可达"

  # ====================================================================
  # fw_terraform_backend_missing(warn)：须有远程 backend 配置
  # ====================================================================
  local has_backend=0
  for t in "${tfarr[@]+"${tfarr[@]}"}"; do
    if _fw_tf_strip "$t" | grep -qE 'backend[[:space:]]+"'; then has_backend=1; break; fi
  done
  if [[ "$has_backend" -eq 0 ]]; then
    warn "fw_terraform_backend_missing: 全仓库无 backend 配置（默认 local state 无锁无版本化，团队环境不可用，须 s3/azurerm/gcs/remote）"
  else
    pass "fw_terraform_backend_missing: 已配置远程 backend"
  fi

  # ====================================================================
  # fw_terraform_backend_unencrypted(warn)：backend "s3" 须 encrypt = true
  # ====================================================================
  local be_bad=""
  for t in "${tfarr[@]+"${tfarr[@]}"}"; do
    _fw_tf_strip "$t" | grep -qE 'backend[[:space:]]+"s3"' || continue
    if ! _fw_tf_strip "$t" | grep -qE 'encrypt[[:space:]]*=[[:space:]]*true'; then
      be_bad="${be_bad}${t}
"
    fi
  done
  _fw_report warn fw_terraform_backend_unencrypted "${be_bad}" "S3 backend 未显式 encrypt = true（state 存储层明文，CWE-312；建议加 KMS 与锁机制）" "S3 backend 均已加密或未用 S3 backend"

  # ====================================================================
  # fw_terraform_provider_unpinned(warn)：有 provider 块须 required_providers 锁版本
  # ====================================================================
  local has_provider=0 has_rp=0
  for t in "${tfarr[@]+"${tfarr[@]}"}"; do
    if _fw_tf_strip "$t" | grep -qE '^[[:space:]]*provider[[:space:]]+"'; then has_provider=1; fi
    if _fw_tf_strip "$t" | grep -qE 'required_providers'; then has_rp=1; fi
  done
  if [[ "$has_provider" -eq 1 && "$has_rp" -eq 0 ]]; then
    warn "fw_terraform_provider_unpinned: 存在 provider 块但全仓库无 required_providers 版本约束（init 拉最新 provider 行为漂移，须 version = \"~> x.y\"）"
  else
    pass "fw_terraform_provider_unpinned: provider 版本已锁定或无 provider 块"
  fi

  # ====================================================================
  # fw_terraform_no_prevent_destroy(warn)：有状态资源须 lifecycle prevent_destroy
  # ====================================================================
  local pd_bad=""
  for t in "${tfarr[@]+"${tfarr[@]}"}"; do
    _fw_tf_strip "$t" | grep -qE 'resource[[:space:]]+"(aws_db_instance|aws_s3_bucket|azurerm_mssql_database)"' || continue
    if ! _fw_tf_strip "$t" | grep -qE 'prevent_destroy[[:space:]]*=[[:space:]]*true'; then
      pd_bad="${pd_bad}${t}
"
    fi
  done
  _fw_report warn fw_terraform_no_prevent_destroy "${pd_bad}" "有状态资源（db/bucket）无 lifecycle prevent_destroy（误 plan 即销毁生产数据，GB/T 22239-2019 8.1.4.6）" "有状态资源均已挂 prevent_destroy"

  # ====================================================================
  # fw_terraform_rds_unencrypted(warn)：aws_db_instance 须 storage_encrypted = true
  # ====================================================================
  local enc_bad=""
  for t in "${tfarr[@]+"${tfarr[@]}"}"; do
    _fw_tf_strip "$t" | grep -qE 'resource[[:space:]]+"aws_db_instance"' || continue
    if ! _fw_tf_strip "$t" | grep -qE 'storage_encrypted[[:space:]]*=[[:space:]]*true'; then
      enc_bad="${enc_bad}${t}
"
    fi
  done
  _fw_report warn fw_terraform_rds_unencrypted "${enc_bad}" "RDS 未显式 storage_encrypted = true（存储层明文，CWE-312；CKV_AWS_16）" "RDS 存储均已加密或无 RDS"

  # ====================================================================
  # fw_terraform_sensitive_output(warn)：敏感名 output 须 sensitive = true
  # ====================================================================
  local out_bad=""
  for t in "${tfarr[@]+"${tfarr[@]}"}"; do
    _fw_tf_strip "$t" | grep -qE 'output[[:space:]]+"[^"]*(password|secret|token|key)[^"]*"' || continue
    if ! _fw_tf_strip "$t" | grep -qE 'sensitive[[:space:]]*=[[:space:]]*true'; then
      out_bad="${out_bad}${t}
"
    fi
  done
  _fw_report warn fw_terraform_sensitive_output "${out_bad}" "敏感 output 未标 sensitive = true（明文进 CI 日志与制品，CWE-312）" "敏感 output 均已脱敏或无敏感 output"

  # ====================================================================
  # fw_terraform_auto_approve(warn)：脚本/CI 禁裸 apply/destroy -auto-approve
  # ====================================================================
  local aa_bad=""
  for c in "${ciarr[@]+"${ciarr[@]}"}"; do
    ln=$(grep -nE 'terraform[[:space:]]+(apply|destroy)[[:space:]]+(-[a-z-]+[[:space:]]+)*-auto-approve' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && aa_bad="${aa_bad}${c}:${ln}
"
  done
  _fw_report warn fw_terraform_auto_approve "${aa_bad}" "CI/脚本裸 terraform apply/destroy -auto-approve（plan 未审查直达生产，GB/T 22239-2019 8.1.4.7 安全审计）" "apply 走 plan -out 审查后执行或无自动 apply"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
