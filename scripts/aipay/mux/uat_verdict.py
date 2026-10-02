#!/usr/bin/env python3
"""UAT 逐条判词器（mx-scenario-lib.sh uat_ac_verdict 后端）。

从 UAT-EVIDENCE 证据正文按 AC 编号取判词：通过|有条件通过|不通过|未见。

语义（run2/run6 两轮实锤沉淀）：
1. 「AC 组+判词」同段共享判词——「AC-1/AC-2/AC-3/AC-5/AC-6 通过；AC-4、AC-7
   有条件通过」按段切分，同段多 AC 共享判词，按行取整行判词会错位。
2. 括号注耐受——「AC-N（括号注）通过」AC 编号与判词隔全/半角括号注（注内常含
   "冻结AC-M" 映射字样），括号注不参与匹配也不吞判词（run6 验收书七 AC 全
   "未见"即旧正则要求判词紧跟编号所致）。
3. 映射归属包容——段内显式「冻结AC-M」映射时，判词同时归属段首 AC 与映射目标
   M（agent 自设编号与 G1 冻结编号并存时两侧都拿到真值；归一化后由派单侧约束
   编号一致）。
4. 判词与编号间距 ≤40 字且不越句界（。；;），免把远端证据文本（ack FAIL、
   TEST-PASS 回执）误当判词；AC-N 按整词匹配（AC-1 不命中 AC-10）；多段命中
   同 AC 取后段（逐条明细行在汇总行之后，更具体者胜）。

用法：uat_verdict.py <AC-id>，证据正文自 stdin 读入；判词写 stdout。
"""
import re
import sys

_VERDICT = r'(有条件通过|不通过|未通过|通过|FAIL|PASS)'
_SEG = re.compile(r'(AC-\d+(?:[/、,及和 ]+AC-\d+)*)[^。；;\n]{0,40}?' + _VERDICT)
_REF = re.compile(r'冻结\s*AC-(\d+)')
_NORM = {'有条件通过': '有条件通过', '不通过': '不通过', '未通过': '不通过',
         '通过': '通过', 'FAIL': '不通过', 'PASS': '通过'}


def verdict_for(body: str, ac: str) -> str:
    own = re.compile(r'(?<!\d)' + re.escape(ac) + r'(?!\d)')
    num = ac[3:]
    hit = '未见'
    for line in body.splitlines():
        for m in _SEG.finditer(line):
            if own.search(m.group(1)) or num in _REF.findall(m.group(0)):
                hit = _NORM[m.group(2)]
    return hit


if __name__ == '__main__':
    if len(sys.argv) != 2 or not re.fullmatch(r'AC-\d+', sys.argv[1]):
        sys.exit('usage: uat_verdict.py <AC-id>  (evidence body on stdin)')
    sys.stdout.write(verdict_for(sys.stdin.read(), sys.argv[1]))
