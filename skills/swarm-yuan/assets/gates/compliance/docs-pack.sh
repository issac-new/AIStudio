# gate: docs-pack
# domain: compliance / enforce: warn / tier: compliance
check_docs_pack() {
  echo "=== 交付文档包完备性检查（GB/T 8567/9386、RUSP）==="
  [[ -z "${DOCS_PACK_PROFILE:-}" ]] && { skip_if_unconfigured "DOCS_PACK_PROFILE 未配置"; return; }
  local docs_dir="${DOCS_PACK_DIR:-docs}"
  local required=()
  case "$DOCS_PACK_PROFILE" in
    rusp)
      # RUSP（GB/T 25000.51）内置清单
      required=("产品说明" "用户手册" "测试计划" "测试说明" "测试报告")
      ;;
    gbt9386)
      # GB/T 9386 测试文档内置清单（4 计划/说明 + 4 报告/日志）
      required=("测试计划" "测试设计说明" "测试用例说明" "测试规程说明" "测试项传递报告" "测试日志" "测试事件报告" "测试总结报告")
      ;;
    gbt8567)
      # GB/T 8567-2006 §7.1-7.25 内置清单（25 种文档，按六包分组）
      # 需求包：可行性分析/软件开发计划/需求规格说明
      # 设计包：系统/子系统需求规格说明/接口需求规格说明/系统/子系统设计说明/接口设计说明/数据需求说明/软件设计说明/数据库设计说明
      # 测试包：软件测试计划/软件测试说明/软件测试报告
      # 部署包：软件安装计划/软件移交计划/软件产品规格说明/软件版本说明
      # 运维包：软件用户手册/计算机操作手册/计算机编程手册
      # 管理包：软件配置管理计划/软件质量保证计划/开发进度月报/项目开发总结报告
      required=(
        "可行性分析" "软件开发计划" "软件需求规格说明"
        "系统需求规格说明" "子系统需求规格说明" "接口需求规格说明"
        "系统设计说明" "子系统设计说明" "接口设计说明" "数据需求说明" "软件设计说明" "数据库设计说明"
        "软件测试计划" "软件测试说明" "软件测试报告"
        "软件安装计划" "软件移交计划" "软件产品规格说明" "软件版本说明"
        "软件用户手册" "计算机操作手册" "计算机编程手册"
        "软件配置管理计划" "软件质量保证计划" "开发进度月报" "项目开发总结报告"
      )
      ;;
    custom)
      # custom 取 DOCS_PACK_REQUIRED 自定义清单
      required=(${DOCS_PACK_REQUIRED[@]+"${DOCS_PACK_REQUIRED[@]}"})
      ;;
    *)
      warn "未知 DOCS_PACK_PROFILE：${DOCS_PACK_PROFILE}（按 custom 处理，取 DOCS_PACK_REQUIRED）"
      required=(${DOCS_PACK_REQUIRED[@]+"${DOCS_PACK_REQUIRED[@]}"})
      ;;
  esac
  [[ ${#required[@]} -eq 0 ]] && { skip_if_unconfigured "文档包必备清单为空（profile=${DOCS_PACK_PROFILE}）"; return; }
  local found=0 req hit tbd
  for req in "${required[@]}"; do
    hit=""
    [[ -d "$docs_dir" ]] && hit=$(find "$docs_dir" -type f -name "*${req}*" 2>/dev/null | head -1)
    if [[ -z "$hit" ]]; then
      fail "gate_docs_pack_missing:${req}: 文档包缺少必备文档（${docs_dir} 下未找到 *${req}*）"
      found=1
      continue
    fi
    # TBD 扫描（ALLOW_TBD=1 时降级 warn）
    tbd=$(grep -nE 'TBD|待补充|待完善' "$hit" 2>/dev/null || true)
    if [[ -n "$tbd" ]]; then
      if [[ "${DOCS_PACK_ALLOW_TBD:-0}" == "1" ]]; then
        warn "gate_docs_pack_tbd:${hit}: 文档含 TBD（ALLOW_TBD=1 降级 warn）"
      else
        fail "gate_docs_pack_tbd:${hit}: 文档含 TBD/待补充占位"
        echo "$tbd" | head -5
        found=1
      fi
    fi
  done
  [[ $found -eq 0 ]] && pass "文档包完备性检查通过（profile=${DOCS_PACK_PROFILE}）"
}
