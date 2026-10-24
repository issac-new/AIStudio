# ruleset: dockerfile  requires_conf: DOCKERFILE_GLOBS
# gates: fw_dockerfile_latest_base(fail) fw_dockerfile_root_user(fail) fw_dockerfile_hardcoded_secret(fail) fw_dockerfile_no_healthcheck(warn) fw_dockerfile_no_multistage(warn) fw_dockerfile_no_dockerignore(warn) fw_dockerfile_apt_cleanup(warn) fw_dockerfile_copy_no_chown(warn) fw_dockerfile_no_expose(warn) fw_dockerfile_entrypoint_cmd_split(warn)
# harvested-from: 新增（2026-07-23），规律源自 docs.docker.com/engine/reference/builder / OWASP Docker Top 10 / Hadolint S1000+ 规则库
_fw_dockerfile_check() {
  echo "  [dockerfile] Dockerfile syntax 1.x IaC 规律"

  # ---------- 收集文件清单（Dockerfile + .dockerignore 统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${DOCKERFILE_GLOBS[@]+"${DOCKERFILE_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "dockerfile: DOCKERFILE_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Dockerfile vs .dockerignore vs docker-compose 等
  local dfarr=() diarr=()
  local f
  for f in "${srcarr[@]}"; do
    local b
    b="$(basename "$f")"
    case "$b" in
      Dockerfile|Dockerfile.*|*.dockerfile) dfarr+=("$f") ;;
      .dockerignore) diarr+=("$f") ;;
    esac
  done

  if [[ ${#dfarr[@]} -eq 0 ]]; then
    warn "dockerfile: DOCKERFILE_GLOBS 未解析出任何 Dockerfile"
    return
  fi

  # Dockerfile 注释剥离：仅 # 行注释（Dockerfile 无块注释），用 _fw_strip_comments_cfg（剔 # 行）
  # 注意：_fw_strip_comments_cfg 是剔整行 # 注释；Dockerfile 的 # syntax= 解析器指令也是 # 开头，
  #   但它是有效配置（BuildKit 解析器前缀），本规则集不依赖该指令做判定，剥离无影响。

  local t ln

  # ====================================================================
  # fw_dockerfile_latest_base(fail)：FROM 禁 :latest 标签
  # ====================================================================
  # 口径：Dockerfile 剥 # 注释后命中 FROM ...:latest → fail
  local latest_bad=""
  for t in "${dfarr[@]}"; do
    ln=$(_fw_strip_comments_cfg "$t" | grep -nE '^[[:space:]]*FROM[[:space:]]+[^[:space:]]+:latest' || true)
    [[ -n "$ln" ]] && latest_bad="${latest_bad}${t}:${ln}
"
  done
  _fw_report fail fw_dockerfile_latest_base "${latest_bad}" "FROM 使用 :latest 标签（标签可变致构建不可复现+供应链投毒，CWE-668；GB/T 22239-2019 8.1.4.3）" "基础镜像用 digest 或版本号标签"

  # ====================================================================
  # fw_dockerfile_root_user(fail)：禁以 root 运行，须显式 USER 非 root
  # ====================================================================
  # 口径：Dockerfile 剥注释后无 USER 指令，或显式 USER root/0 → fail
  local root_bad=""
  for t in "${dfarr[@]}"; do
    local ulines
    ulines=$(_fw_strip_comments_cfg "$t" | grep -nE '^[[:space:]]*USER[[:space:]]+' || true)
    if [[ -z "$ulines" ]]; then
      root_bad="${root_bad}${t}: 缺 USER 指令（默认 root 运行）
"
    else
      # 检查 USER 是否显式 root/0
      local bad_user
      bad_user=$(printf '%s\n' "$ulines" | grep -E '^[[:space:]]*[0-9]+:[[:space:]]*USER[[:space:]]+(root|0)([[:space:]]|$)' || true)
      [[ -n "$bad_user" ]] && root_bad="${root_bad}${t}: 显式 USER root/0
"
    fi
  done
  _fw_report fail fw_dockerfile_root_user "${root_bad}" "容器以 root 运行（逃逸即获宿主 root 权限，CWE-250；GB/T 22239-2019 8.1.4.1）" "已显式 USER 非 root"

  # ====================================================================
  # fw_dockerfile_hardcoded_secret(fail)：ENV/ARG 禁密钥字面量
  # ====================================================================
  # 口径：ENV/ARG 行变量名或值含密钥词且赋字符串字面量（剔除 $ 引用占位）→ fail
  local sec_bad=""
  for t in "${dfarr[@]}"; do
    # 命中密钥名 ENV/ARG（剔除含 $ 或 { 的引用占位行）
    ln=$(_fw_strip_comments_cfg "$t" | grep -nE '^[[:space:]]*(ENV|ARG)[[:space:]]+[^=]*(password|passwd|secret|token|api_key|apikey|access_key|private_key)' | grep -vE '\$|\{' || true)
    [[ -n "$ln" ]] && sec_bad="${sec_bad}${t}:${ln}
"
  done
  _fw_report fail fw_dockerfile_hardcoded_secret "${sec_bad}" "ENV/ARG 硬编码密钥字面量（密钥进镜像层与 git 历史，CWE-798；须运行时注入）" "无硬编码密钥或密钥走 $ 引用"

  # ====================================================================
  # fw_dockerfile_no_healthcheck(warn)：须显式 HEALTHCHECK
  # ====================================================================
  local hc_bad=""
  for t in "${dfarr[@]}"; do
    if ! _fw_strip_comments_cfg "$t" | grep -qE '^[[:space:]]*HEALTHCHECK[[:space:]]'; then
      hc_bad="${hc_bad}${t}
"
    fi
  done
  _fw_report warn fw_dockerfile_no_healthcheck "${hc_bad}" "Dockerfile 无 HEALTHCHECK（进程假死不可探测，CWE-1188；GB/T 22239-2019 8.1.4.5）" "已配 HEALTHCHECK 或无 Dockerfile"

  # ====================================================================
  # fw_dockerfile_no_multistage(warn)：多阶段构建（FROM ≥2）
  # ====================================================================
  # 口径：Dockerfile 剥注释后 FROM 计数 <2 → warn（单阶段构建）
  local ms_bad=""
  for t in "${dfarr[@]}"; do
    local from_cnt
    from_cnt=$(_fw_strip_comments_cfg "$t" | grep -cE '^[[:space:]]*FROM[[:space:]]+' || true)
    if [[ "${from_cnt:-0}" -lt 2 ]]; then
      ms_bad="${ms_bad}${t}（FROM 数=${from_cnt}）
"
    fi
  done
  _fw_report warn fw_dockerfile_no_multistage "${ms_bad}" "单阶段构建（FROM <2，镜像含编译工具链体积大攻击面扩大；GB/T 25000.51-2016 资源利用）" "已多阶段构建（FROM ≥2）"

  # ====================================================================
  # fw_dockerfile_no_dockerignore(warn)：.dockerignore 须存在
  # ====================================================================
  # 口径：Dockerfile 同级目录无 .dockerignore 文件 → warn
  #   （srcarr 中也可能直接包含 .dockerignore，双重判定：同目录 .dockerignore 存在 或 srcarr 含 .dockerignore）
  local di_bad=""
  for t in "${dfarr[@]}"; do
    local cdir
    cdir="$(cd "$(dirname "$t")" && pwd)"
    if [[ ! -f "${cdir}/.dockerignore" ]]; then
      # 再查 srcarr 是否含该目录的 .dockerignore（防 glob 未匹配但文件存在）
      local found=0
      local d
      for d in "${diarr[@]+"${diarr[@]}"}"; do
        [[ "$(cd "$(dirname "$d")" && pwd)" == "$cdir" ]] && { found=1; break; }
      done
      [[ "$found" -eq 0 ]] && di_bad="${di_bad}${t}
"
    fi
  done
  _fw_report warn fw_dockerfile_no_dockerignore "${di_bad}" "Dockerfile 同级无 .dockerignore（构建上下文含 .git/密钥/缓存，CWE-668；GB/T 22239-2019 8.1.4.6）" "已配 .dockerignore"

  # ====================================================================
  # fw_dockerfile_apt_cleanup(warn)：apt-get 须 --no-install-recommends + 清理缓存
  # ====================================================================
  # 口径：Dockerfile 含 apt-get install 但无 --no-install-recommends 或无 rm -rf /var/lib/apt/lists → warn
  local apt_bad=""
  for t in "${dfarr[@]}"; do
    _fw_strip_comments_cfg "$t" | grep -qE 'apt-get[[:space:]]+install' || continue
    local has_no_recommends=0 has_cleanup=0
    _fw_strip_comments_cfg "$t" | grep -qE -- '--no-install-recommends' && has_no_recommends=1
    _fw_strip_comments_cfg "$t" | grep -qE 'rm[[:space:]]+-rf[[:space:]]+/var/lib/apt/lists' && has_cleanup=1
    if [[ "$has_no_recommends" -eq 0 || "$has_cleanup" -eq 0 ]]; then
      apt_bad="${apt_bad}${t}（no-install-recommends=${has_no_recommends}, cleanup=${has_cleanup}）
"
    fi
  done
  _fw_report warn fw_dockerfile_apt_cleanup "${apt_bad}" "apt-get install 未加 --no-install-recommends 或未清缓存（镜像膨胀+缓存残留，CWE-400；GB/T 25000.51-2016）" "apt 已加 --no-install-recommends 并清缓存或无 apt-get install"

  # ====================================================================
  # fw_dockerfile_copy_no_chown(warn)：COPY 须 --chown
  # ====================================================================
  # 口径：COPY 指令行不含 --chown → warn（ADD 豁免）
  local chown_bad=""
  for t in "${dfarr[@]}"; do
    ln=$(_fw_strip_comments_cfg "$t" | grep -nE '^[[:space:]]*COPY[[:space:]]' | grep -vE -- '--chown' || true)
    [[ -n "$ln" ]] && chown_bad="${chown_bad}${t}:${ln}
"
  done
  _fw_report warn fw_dockerfile_copy_no_chown "${chown_bad}" "COPY 未带 --chown（文件以 root 属主落入镜像层，CWE-250；GB/T 22239-2019 8.1.4.1）" "COPY 均带 --chown 或无 COPY"

  # ====================================================================
  # fw_dockerfile_no_expose(warn)：须 EXPOSE 声明
  # ====================================================================
  local exp_bad=""
  for t in "${dfarr[@]}"; do
    if ! _fw_strip_comments_cfg "$t" | grep -qE '^[[:space:]]*EXPOSE[[:space:]]+[0-9]+'; then
      exp_bad="${exp_bad}${t}
"
    fi
  done
  _fw_report warn fw_dockerfile_no_expose "${exp_bad}" "Dockerfile 无 EXPOSE 声明（端口文档缺失，编排器映射误导，CWE-668；GB/T 22239-2019 8.1.3.2）" "已 EXPOSE 声明端口"

  # ====================================================================
  # fw_dockerfile_entrypoint_cmd_split(warn)：ENTRYPOINT+CMD 须分离
  # ====================================================================
  # 口径：同文件须同时有 ENTRYPOINT 与 CMD；缺其一 → warn
  local ep_bad=""
  for t in "${dfarr[@]}"; do
    local has_ep=0 has_cmd=0
    _fw_strip_comments_cfg "$t" | grep -qE '^[[:space:]]*ENTRYPOINT[[:space:]]' && has_ep=1
    _fw_strip_comments_cfg "$t" | grep -qE '^[[:space:]]*CMD[[:space:]]' && has_cmd=1
    if [[ "$has_ep" -eq 0 || "$has_cmd" -eq 0 ]]; then
      ep_bad="${ep_bad}${t}（ENTRYPOINT=${has_ep}, CMD=${has_cmd}）
"
    fi
  done
  _fw_report warn fw_dockerfile_entrypoint_cmd_split "${ep_bad}" "缺 ENTRYPOINT 或 CMD（入口未分离，docker run 难覆盖参数；GB/T 25000.51-2016 使用性）" "ENTRYPOINT+CMD 已分离"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
