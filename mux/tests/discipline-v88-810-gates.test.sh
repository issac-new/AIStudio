#!/bin/bash
# 守门：V8.8-V8.10 新立纪律驱动面断言（裸奔五条补测试，2026-10-11 认知加固轮）
# 覆盖面=mux/discipline-test-coverage.md 裸奔清单：纪律 29/33/34/38/39，
# 另含首过三态信号（§2.6-5）与 FIX-DONE 锚点抽验（纪律 34 驱动侧）。
# 断言形态=驱动源码锚点存在性+关键语义行（与 jargon-source-gate 同强度）；
# 行为级验证属 run15 首验范围，本门防的是「实现被无声删除」。
set -u
cd "$(dirname "$0")/../.."
FAILS=0
ck() { # <描述> <文件> <grep 式>
  if grep -qE "$3" "$2" 2>/dev/null; then
    echo "PASS ① $1"
  else
    echo "FAIL ① $1（$2 缺锚：$3）"; FAILS=$((FAILS+1))
  fi
}

# 纪律 29：并发多锚等待（wait_alive_truth_multi 定义+驱动调用）
ck "纪律29 多锚等待函数在位" mux/mx-scenario-lib.sh '^wait_alive_truth_multi\(\)'
ck "纪律29 驱动调用多锚等待" aipay-scenario.sh 'wait_alive_truth_multi'

# 纪律 33：测试左移三结论行识别
ck "纪律33 UC 段结论行" aipay-scenario.sh 'UC-DONE'
ck "纪律33 INT 段结论行" aipay-scenario.sh 'INT-CASES-DONE'
ck "纪律33 QUALITY 段结论行" aipay-scenario.sh 'QUALITY-DONE'

# 纪律 34：缺陷回流（建卡真伪+锚点抽验+静默环）
ck "纪律34 建卡真伪校验函数" mux/mx-scenario-lib.sh 'defect_cards_assignee_check'
ck "纪律34 驱动调用真伪校验" aipay-scenario.sh 'defect_cards_assignee_check'
ck "纪律34 FIX-DONE 锚点抽验" aipay-scenario.sh 'defect-fixed-anchor-missing'
ck "纪律34 锚点抽验核中央仓" aipay-scenario.sh 'cat-file -e "\$\{_fxd\}\^\{commit\}"'
ck "纪律34 环内禁静默 15 分钟" aipay-scenario.sh '缺陷修复环在途静默约 15 分钟'

# 纪律 38：涉敏安全评审卡（判词+豁免）
ck "纪律38 SECURITY-GATE 判词" aipay-scenario.sh 'SECURITY-GATE-PASS'
ck "纪律38 非涉敏豁免键" aipay-scenario.sh '涉敏=无——安全评审卡豁免|security_review_done'

# 纪律 39：契约执行观察影子
ck "纪律39 contract-observe 语法" mux/contract-observe.mjs '.'   # 存在性（语法另测）
if node --check mux/contract-observe.mjs 2>/dev/null; then
  echo "PASS ① 纪律39 contract-observe.mjs node 语法"
else
  echo "FAIL ① 纪律39 contract-observe.mjs 语法不过"; FAILS=$((FAILS+1))
fi
ck "纪律39 驱动调用观察器" aipay-scenario.sh 'contract-observe'

# §2.6-5 首过三态信号（补过键两落点+metrics 三态）
ck "首过口径 G1 退回计补过" aipay-scenario.sh 'sset g1_supplement 1'
ck "首过口径 G5 GAP 残留检测" aipay-scenario.sh 'sset_once g5_supplement 1'
ck "首过口径 metrics 三态" mux/mx-scenario-lib.sh '首过\+补过\+打回=6'
ck "首过口径 补过键读取" mux/mx-scenario-lib.sh 'g\$\{_n\}_supplement'

# 推演 UI 中文断言（2026-10-12 用户指令「推演时 UI 始终中文」）：双采集器 locale 双保险
ck "UI中文 r18-frames 浏览器级 locale" mux/r18-frames.mjs "locale: 'zh-CN'"
ck "UI中文 capture-ui 浏览器级 locale" mux/capture-ui.mjs "locale: 'zh-CN'"
ck "UI中文 r18-frames localStorage 键" mux/r18-frames.mjs "hermes_locale', 'zh'"
ck "UI中文 capture-ui localStorage 键" mux/capture-ui.mjs "hermes_locale', 'zh'"

# 叙事重构断言（2026-10-11 演示视频组织方式轮，方案 §2.4 七幕/§2.9 责任总表）：
# 生成器步块终结符含 ^#### ——幕标题=子节头须终结步块，防幕导文本吞进判据段。
ck "叙事 幕标题终结步块" mux/mx-report-gen.py '\^#### '
ck "叙事 责任矩阵对齐 §2.9" mux/demo-kit-gen.py '§2\.9'

# 宿主脱敏+收银台预览壳断言（2026-10-11 用户指令轮，方案 §5.4.3/§5.4.4）
ck "脱敏 生成器占位替换" mux/mx-report-gen.py '\[宿主家目录\]'
ck "脱敏 审计 A9 断言" mux/mx-report-audit.py 'A9 宿主环境'
ck "脱敏 demo-kit 同款" mux/demo-kit-gen.py '\[宿主卷\]'
ck "成效 预览壳在位" mux/cashier-preview/server.ts '诚实契约'
ck "成效 采集器双渠道" mux/cashier-preview/capture.mjs 'channel'

# 演示素材层断言（2026-10-11 视角轮，方案 §5.4.6）：生成器+方案条款双锚，
# 防「素材层被无声删除」；demo-kit.html 由 demo-kit-gen.py 只读消费真实轮数据产出。
ck "素材层 生成器在位" mux/demo-kit-gen.py '^"""demo-kit-gen\.py'
ck "素材层 生成器声明 §5.4.6" mux/demo-kit-gen.py '§5\.4\.6'
ck "素材层 六件套时间轴段" mux/demo-kit-gen.py '全程时间轴'
ck "素材层 接力行字段映射" mux/demo-kit-gen.py '事件id 房间id 审批人 时间戳'

# QGate↔技能贯通断言（2026-10-12 贯通轮，对照表=mux/qgate-skill-map.md）
ck "贯通 defect-loop 结卡门禁段" skills/defect-loop/SKILL.md 'task_close 触发面'
ck "贯通 defect-loop trace 门引用" skills/defect-loop/SKILL.md 'L0.requirement-trace'
ck "贯通 requirements-analyst 自证段" skills/requirements-analyst/SKILL.md 'L0.requirement-trace'
ck "贯通 aipaydev-dev 门禁集成" skills/aipaydev-dev/SKILL.md '门禁|qgate'
ck "贯通 对照表在位" mux/qgate-skill-map.md '七技能 × 门禁责任面'

if (( FAILS > 0 )); then echo "FAIL：${FAILS} 项缺锚"; exit 1; fi
echo "discipline-v88-810-gates：裸奔五条+首过三态+锚点抽验+技能贯通断言全过"
