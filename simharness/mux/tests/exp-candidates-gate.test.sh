#!/bin/bash
# 守门：经验候选台账节（方案 V8.27 §2.6.4/纪律 49）三面同步——复盘模板（templates-pending）
# ↔ 生成器（aipay-scenario.sh 步 24 echo 块）↔ 覆盖对照表。任一面漂移即 FAIL，
# 防「方案立了纪律、模板与生成器没跟上」的立法即遗忘（模板↔harness 双向同步纪律；
# 骨架=retro-convergence-gate.test.sh 同款）。
set -u
cd "$(dirname "$0")/../.."
fails=0

ck() { # ck <名> <文件> <锚正则>
  if grep -qE "$3" "$2"; then echo "PASS $1"; else echo "FAIL $1（$2 缺锚：$3）"; fails=1; fi
}
ckf() { # ckf <名> <文件> <锚字面量（固定串匹配）}
  if grep -qF "$3" "$2"; then echo "PASS $1"; else echo "FAIL $1（$2 缺锚：$3）"; fails=1; fi
}

# ① 复盘模板：沉淀节 + 表列 + 机械判据第 8 行 + 禁编造句
ck "模板·沉淀节在场" mux/templates-pending/retrospective.md '经验候选台账（方案 V8\.27 §2\.6\.4/纪律 49'
ck "模板·表四列" mux/templates-pending/retrospective.md '\| 候选类型 \| 指纹（gate:reason 或路径签名） \| 证据数 \| 审核处置 \|'
ck "模板·机械判据" mux/templates-pending/retrospective.md '\| 8 \| 经验候选台账节在场（缺产品面时如实标注「未部署」而非删节） \| 存在性\+类型计数 \|'
ck "模板·禁编造句" mux/templates-pending/retrospective.md '禁编造，禁删节'

# ② 生成器 echo 块：同节 + store 机械实算 + 注入留痕双态 + fail-soft 引用
ck "生成器·沉淀节" aipay-scenario.sh '经验候选台账（纪律 49'
ckf "生成器·store 读取" aipay-scenario.sh 'expcandidates/exp-candidates.json'
ckf "生成器·类型实算" aipay-scenario.sh "'.candidates[] | \"| \\(.type) | \\(.fingerprint)"
ck "生成器·注入留痕开启态" aipay-scenario.sh '本轮开启注入（纪律 49），留痕候选'
ck "生成器·注入留痕默认关" aipay-scenario.sh '本轮未启用注入（纪律 49 默认关）'
ck "生成器·缺位如实" aipay-scenario.sh '候选面未部署或 store 缺位——如实标注，禁编造'

# ③ 覆盖对照表：纪律 49 行已登记（V8.25 批次落）
ck "对照表·49 登记" mux/discipline-test-coverage.md '^\| 49 \| 经验受控注入'

# ④ 语法自检（echo 块改动必过 bash -n——纪律 19 同款）
if bash -n aipay-scenario.sh 2>/dev/null; then echo "PASS 生成器 bash -n"; else echo "FAIL aipay-scenario.sh 语法"; fails=1; fi

[ "$fails" -eq 0 ] && echo 'PASS exp-candidates-gate（模板/生成器/对照表三面同步）'
exit "$fails"
