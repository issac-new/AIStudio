#!/usr/bin/env python3
"""jargon-check.py — 项目自造词/黑话机械检查（说人话门禁）

背景：方案与报告文案两次被用户点名"说人话"（2026-10-09 两轮）。通用公文 linter
抓不住本项目自造词（工作面/组合归一/落键这类），此脚本补项目词表。

用法：
  python3 jargon-check.py <文件.md> [文件2.md ...]
命中即输出 行号:词:句子片段，退出码 1；全过退出码 0。

规则：词表分两档——
  HARD：任何语境出现即违规（自造词/已被点名禁止的词）
  SOFT：语境敏感词，命中输出 WARN 不拦退出码（人工判断）
新增词：被用户新点名的词直接加进 HARD；这是活文档。
"""
import sys
import re
from pathlib import Path

HARD = [
    # 本项目自造词（历史点名+复盘沉淀）
    '工作面', '组合归一', '归一物', '四步闭环', '排队泵', '年龄锚', '落键', '硬闸',
    '齐发', '真容', '顶包', '双兜底', '契约件', '重腿', '整腿', '承载面', '必采矩阵',
    '叙事集', '焊死', '钉死', '喂数', '盯梢', '击杀', '接力器', '灌满', '满格',
    '零污染', '无损换窗', '归档召回', '家族记忆', '家族库', '导演', '守门',
    '实算', '实锚', '落档', '落库', '起跑', '收官', '收口', '销账', '清场',
    '空跑', '拒跑', '真查', '真跑', '真值闸', '探活', '拉起', '挂单', '置 done',
    '催办', '记单', '红杠', '深链', '旁路试跑', '在途占用', '首役', '步态', '闸窗',
    '硬窗', '判活', '判死',
    # 通用 AI 黑话（公文黑名单）
    '赋能', '抓手', '闭环', '链路', '沉淀', '对齐', '颗粒度', '打法', '组合拳',
    '心智', '打通', '拉通', '对表', '收编', '加持', '赋能', '底座',
]
# 允许例外（产物专名/机器语法，不算违规）
ALLOW_EXACT = {
    '闭环治理终态',   # 报告第九章章名（已生成产物的实际名称）
}
META_QUOTE = ('空话黑名单（', '黑名单（', '词表')
# 定义行豁免：报告导读里的术语对照行（「记单」=记入问题清单）是教学行，
# 引号内出现被查词是故意的——与 META_QUOTE 同理不违规（2026-10-10 run12 报告轮新增）。
DEF_LINE = re.compile(r'「[^」]{1,12}」[＝=]')
ALLOW_SUBSTR = {'一起跑'}  # 含被查词但语义无关的常见组合  # 引用黑名单本身教育读者的行，豁免
SOFT = [
    '落地', '收口', '对账', '口径', '赋能', '生态', '架构', '治理',  # 语境判断
    '归一化',  # 统计术语，优先改"折算成百分比"
    '实例化', '物化',
]

def check(path: str) -> int:
    p = Path(path)
    if not p.exists():
        print(f'!! 文件不存在：{path}')
        return 1
    hits = 0
    text = p.read_text(encoding='utf-8')
    for i, line in enumerate(text.splitlines(), 1):
        meta = any(m in line for m in META_QUOTE) or bool(DEF_LINE.search(line))
        # 跳过代码块/命令语法行（机器锚区）
        if line.strip().startswith(('#', '```', 'bash ', '| 闸')):
            pass
        for w in HARD:
            if w in ALLOW_EXACT or meta or any(a in line for a in ALLOW_SUBSTR):
                continue
            start = 0
            while True:
                j = line.find(w, start)
                if j < 0:
                    break
                # 专名豁免：命中词是允许短语的一部分
                ctx = line[max(0, j-8):j+len(w)+8]
                if any(a in ctx for a in ALLOW_EXACT):
                    start = j + len(w)
                    continue
                print(f'{path}:{i}: [HARD] {w} …{ctx.strip()}…')
                hits += 1
                start = j + len(w)
        for w in SOFT:
            if w in line and not any(a in line for a in ALLOW_EXACT):
                print(f'{path}:{i}: [SOFT] {w} （语境判断）')
    return hits

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    total = sum(check(f) for f in sys.argv[1:])
    if total:
        print(f'\n共 {total} 处 HARD 违规——改成人话再提交（同义替换见 scripts/plan-html/ 词表注释）')
        sys.exit(1)
    print('词表全过：无 HARD 违规')

if __name__ == '__main__':
    main()
