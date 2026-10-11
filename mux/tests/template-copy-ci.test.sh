#!/bin/bash
# 守门⑦：模板文案 CI（产品 backlog 八件收口）——harness 内嵌模板函数的输出字段面
# 与方案 §2.7 模板字段表逐项断言，防模板字段被无声删除/改名（三方一致性的模板面防线）。
# 断言形态=模板函数体内的字段 echo 行存在性（静态锚）；行为级（org_gen 真跑）属运行时。
set -u
cd "$(dirname "$0")/../.."
LIB=mux/mx-scenario-lib.sh
FAILS=0
ck() { # <描述> <grep 式>
  if grep -qE "$2" "$LIB" 2>/dev/null; then
    echo "PASS ① $1"
  else
    echo "FAIL ① $1（$LIB 缺锚：$2）"; FAILS=$((FAILS+1))
  fi
}

# freeze 判读（reqgate_judge）：AC 编号/Scope-Out 节名/影响面/涉敏——方案 §2.7 freeze 行
ck "freeze AC 可判定"            'AC-?[0-9N]|AC 编号'
ck "freeze Scope-Out 节名"        '\^## \.\*Scope-Out'
ck "freeze 影响面"                '影响面'
ck "freeze 涉敏"                  '涉敏'

# org 模板（org_gen）：六列对账/权限矩阵/三流程/能力矩阵——方案 §2.7 org 行
ck "org 编制六列"                 '\| 账号 \| 角色 \| 汇报线'
ck "org 权限矩阵节"               '## 权限矩阵'
ck "org 三流程节"                 '## 入职/转岗/离职流程'
ck "org 能力矩阵节"               '## 能力矩阵'

# app-registry 模板：应用/负责人/看板/技术栈/SLA/测试骨架
ck "registry 字段面"              '负责人|测试骨架|SLA'

# AN 系分稿派发词字段：接口签名/数据模型/错误码/幂等键/人日（在 scenario 派发词）
SCEN=aipay-scenario.sh
cks() { grep -qE "$2" "$SCEN" 2>/dev/null && echo "PASS ① $1" || { echo "FAIL ① $1（$SCEN 缺：$2）"; FAILS=$((FAILS+1)); }; }
cks "AN 接口签名"                 '接口签名'
cks "AN 数据模型"                 '数据模型'
cks "AN 错误码"                   '错误码'
cks "AN 幂等键"                   '幂等键'
cks "AN 工作量人日"               '人日'

# 排期模板：测试=开发×0.3/缓冲 15%
cks "排期 0.3 系数"               '0\.3'
cks "排期 15% 缓冲"               '15%'

if (( FAILS > 0 )); then echo "FAIL：${FAILS} 项缺锚"; exit 1; fi
echo "template-copy-ci：模板字段面 16 断言全过（方案 §2.7 ↔ harness 模板/派发词一致性）"
