# gate: cert-audit
# domain: compliance / enforce: advisory / tier: compliance
check_cert_audit() {
  echo "=== 安全认证合规聚合（--cert-audit，advisory）==="
  local profile="${CERT_PROFILE:-}"
  if [[ -z "$profile" ]]; then
    echo "  (CERT_PROFILE 未配置——可选：dengbao4|bcp5|gb22240|jrt0142|pcidss|iso27001|all)"
    echo "  配置后在 precheck.compliance.conf 设 CERT_PROFILE 或环境变量传入"
    return 0
  fi
  local spec_f="${SPEC_FILE:-}"
  local has_spec=0
  [[ -n "$spec_f" && -f "$spec_f" ]] && has_spec=1
  local checks=0 warns=0 pendings=0

  _cert_check() { # $1=检查项名 $2=关联门禁 $3=状态(pass/warn/fail/pending) $4=说明
    checks=$((checks + 1))
    case "$3" in
      pass) echo "  ✓ [$1] $2: $4" ;;
      pending) pendings=$((pendings + 1)); echo "  ◻ [$1] $2: 待联检——$4" ;;
      warn) warns=$((warns + 1)); echo "  ⚠ [$1] $2: $4" ;;
      *)    warns=$((warns + 1)); echo "  ✗ [$1] $2: $4" ;;
    esac
  }

  # 等保4级（dengbao4）
  if [[ "$profile" == "dengbao4" || "$profile" == "all" ]]; then
    echo "--- 等保4级（GB/T 22239-2019 9.1.4.x）---"
    _cert_check "数据保密性" "--crypto" "pending" "须 CRYPTO_PROFILE=gm 启用国密 SM4 加密（9.1.4.8），运行 --crypto 联检"
    _cert_check "个人信息保护" "--privacy+--crypto" "pending" "须 --privacy 扫描 + 密码技术保护（9.1.4.11）"
    _cert_check "数据完整性" "--crypto" "warn" "国密 SM3 哈希正向核查（9.1.4.7），须 CRYPTO_PROFILE=gm"
    _cert_check "审计日志留存" "--shift-left" "warn" "spec §21 须声明日志留存≥6个月 + 异地实时备份（9.1.4.3）"
    _cert_check "灾备恢复等级" "--shift-left" "warn" "spec §20 须声明灾备≥4级（9.1.4.9，联动 BCP5级）"
    _cert_check "强制访问控制MAC" "人工核对" "warn" "9.1.4.2 MAC 是 OS/DB 层——人工核对策略配置"
    _cert_check "入侵检测IDS" "人工核对" "warn" "9.1.4.4 HIDS/NIDS 是运行态设施——人工核对"
    _cert_check "可信验证TPM" "人工核对" "warn" "9.1.4.6 可信根是硬件级——人工核对 TPM/TCM 实现"
    _cert_check "介质剩余信息" "人工核对" "warn" "9.1.4.10 密码技术擦除存储介质——人工核对"
    _cert_check "等保4级门禁联检" "--dengbao" "pending" "DENGBAO_LEVEL=4 启用 --dengbao 逐项检查（含 SM4/MFA/审计）"
  fi

  # BCP5级（bcp5）
  if [[ "$profile" == "bcp5" || "$profile" == "all" ]]; then
    echo "--- 业务连续性5级（GB/T 20988-2007 第5级）---"
    if [[ $has_spec -eq 1 ]]; then
      grep -qE 'RTO|RPO|灾备|灾难恢复' "$spec_f" 2>/dev/null \
        && _cert_check "灾备RTO/RPO声明" "--shift-left §20" "pass" "spec 含 RTO/RPO 声明" \
        || _cert_check "灾备RTO/RPO声明" "--shift-left §20" "warn" "spec §20 须声明 RTO≤6h/RPO≤15min（一类系统，GB/T 20988 6.3.2）"
      grep -qE '演练|灾备.*验证' "$spec_f" 2>/dev/null \
        && _cert_check "灾备演练记录" "--operate" "pass" "spec 含演练记录声明" \
        || _cert_check "灾备演练记录" "--operate" "warn" "spec §23 须声明灾备演练≥1次/年（GB/T 20988 第10章）"
    else
      _cert_check "灾备RTO/RPO声明" "--shift-left" "warn" "SPEC_FILE 未配置，无法核查灾备声明"
    fi
    _cert_check "实时数据传输" "人工核对" "warn" "第5级标志：实时数据传输是运行态设施——人工核对"
    _cert_check "应用级自动切换" "人工核对" "warn" "第5级标志：自动切换是运行态设施——人工核对"
  fi

  # GB/T 22240 定级（gb22240）
  if [[ "$profile" == "gb22240" || "$profile" == "all" ]]; then
    echo "--- GB/T 22240-2020 等保定级指南 ---"
    if [[ $has_spec -eq 1 ]]; then
      grep -qE '安全保护等级|等保.*级|定级' "$spec_f" 2>/dev/null \
        && _cert_check "定级声明" "--compliance" "pass" "spec 含定级声明" \
        || _cert_check "定级声明" "--compliance" "warn" "spec §22 须含安全保护等级声明（GB/T 22240-2020）"
    else
      _cert_check "定级声明" "--compliance" "warn" "SPEC_FILE 未配置"
    fi
    _cert_check "定级文档存在" "人工核对" "warn" "须有定级报告文档（定级→备案→按级保护）"
  fi

  # JR/T 0142-2016 银行卡清算业务设施技术要求（jrt0142）
  if [[ "$profile" == "jrt0142" || "$profile" == "all" ]]; then
    echo "--- JR/T 0142-2016 银行卡清算业务设施 + 《清算机构管理办法》---"
    _cert_check "国密SM2/3/4加密" "--crypto" "pending" "须 CRYPTO_PROFILE=gm（GB/T 39786 8.4 联动）"
    _cert_check "C3信息保护" "--sensitive+--crypto" "pending" "不得明文存储/传输/展示（JR/T 0171 6.1.1 联动）"
    _cert_check "多因素鉴别" "--dengbao" "pending" "须 DENGBAO_LEVEL=3（等保三级 8.1.4.1 d 联动）"
    _cert_check "PAN持卡人数据扫描" "--privacy" "pending" "须 --privacy 扩展 PAN 模式（PCI-DSS Req 3 对标）"
    _cert_check "漏洞管理CVE" "--sbom" "pending" "CVE 阈值门禁（PCI-DSS Req 6 对标）"
    _cert_check "审计日志≥6个月" "--shift-left" "warn" "spec §21 须声明日志留存≥6个月（网安法§21 联动）"
    _cert_check "灾备RTO/RPO" "--shift-left" "warn" "spec §20 须声明 RTO≤6h/RPO≤15min/能力≥5级（JR/T 0044 联动）"
    _cert_check "灾备演练≥1次/年" "--operate" "warn" "spec §23 须声明灾备演练记录（JR/T 0044 第10章）"
    _cert_check "数据本地化声明" "spec§22" "warn" "境外机构数据须境内存储（《清算机构管理办法》§31）"
    _cert_check "独立清算+灾备系统" "spec§22" "warn" "须声明独立/安全/高效清算系统+灾备系统（§10 准入条件）"
    _cert_check "网络分区分域" "人工核对" "warn" "边界防护/入侵检测是网络设施——人工核对"
    _cert_check "高可用双活/主备" "人工核对" "warn" "可用性架构是运行态——人工核对"
  fi

  # PCI-DSS 4.0（pcidss）
  if [[ "$profile" == "pcidss" || "$profile" == "all" ]]; then
    echo "--- PCI-DSS 4.0 ---"
    _cert_check "持卡人数据PAN扫描" "--privacy" "pending" "须 --privacy 扩展 PAN 模式扫描（Req 3）"
    _cert_check "传输加密" "--security" "pending" "禁用弱 TLS（Req 4）——--security §1.8"
    _cert_check "存储加密" "--crypto" "pending" "AES-256/SM4 加密存储（Req 3）"
    _cert_check "漏洞管理" "--sbom" "pending" "CVE 阈值门禁（Req 6）——--sbom CVE_THRESHOLD"
    _cert_check "访问控制MFA" "--authz" "pending" "缺鉴权/IDOR 检测（Req 7/8）"
    _cert_check "默认密码更改" "--security" "pending" "硬编码密码检测（Req 2）——--security §1.1"
    _cert_check "审计日志留存≥1年" "--shift-left" "warn" "spec §21 须声明日志留存≥1年（Req 10）"
    _cert_check "安全策略文档" "--compliance" "warn" "spec §22 须含安全策略声明（Req 12）"
  fi

  # ISO 27001:2022（iso27001）
  if [[ "$profile" == "iso27001" || "$profile" == "all" ]]; then
    echo "--- ISO/IEC 27001:2022 技术控制（Annex A.8）---"
    _cert_check "A.8.5身份验证" "--authz" "pending" "授权类门禁覆盖"
    _cert_check "A.8.7恶意代码" "--security/--sbom" "pending" "安全扫描+SBOM CVE 覆盖"
    _cert_check "A.8.8漏洞管理" "--sbom" "pending" "CVE 阈值门禁"
    _cert_check "A.8.11数据掩码" "--privacy" "pending" "PII 扫描覆盖"
    _cert_check "A.8.23 Web安全" "--security" "pending" "XSS/CSRF/注入检测"
    _cert_check "A.8.24密码学" "--crypto" "pending" "弱算法+国密检查"
    _cert_check "A.8.25-28安全SDLC" "--security+--shift-left" "pending" "安全开发+左移覆盖"
    _cert_check "A.8.33测试数据保护" "--privacy" "pending" "测试目录 PII 扫描"
    _cert_check "A.8.9配置管理" "--security" "warn" "调试模式/CORS 检测（部分）"
    _cert_check "A.8.15日志记录" "--shift-left" "warn" "spec §21 日志声明"
    _cert_check "A.8.31环境分离" "人工核对" "warn" "开发/测试/生产分离——人工核查配置"
    _cert_check "A.8.32变更管理" "--shift-left" "warn" "spec §20 变更左移声明"
    _cert_check "A.8.16监控/IDS" "人工核对" "warn" "入侵检测是运行态设施——人工核对"
    _cert_check "A.8.21网络隔离" "人工核对" "warn" "网络隔离是网络设施——人工核对"
  fi

  echo ""
  echo "  汇总：${checks} 项检查（${pendings} 项待联检，${warns} 项须人工核对/声明补全），fail-closed 项由各门禁独立判定"
  echo "  边界：认证本身需机构测评/审计（等保测评机构/PCI QSA/ISO 27001 认证机构），本门禁是门禁级可查+文档锚点"
}
