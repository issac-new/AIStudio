# skills-dir.sh — 纯技能目录型宿主的共享适配说明（agent / hermes / dsh / cc-switch）
#
# 这四个目标只装载技能目录本身，不做原生规则文件渲染与 hooks 注册：
#   agent      ~/.agent/skills           Agent Skills 开放标准默认路径（2026-10-29 起，安装默认目标）
#   hermes     ~/.hermes/skills          Hermes Agent（agentskills.io 标准）
#   dsh        ~/.dsh/skills             DeepSeek Harness
#   ccswitch   ~/.cc-switch/skills       统一技能库（其余工具目录可符号链接同享）
#
# 安装路径由 install.sh 的 install_to 直接给定；本文件供 hosts.tsv 的 adapter 列指向，
# 说明「无适配器逻辑」是设计选择而非缺件。若将来这些宿主提供 hooks/规则扩展点，
# 在此新增对应渲染函数并在 hosts.tsv 升级 support/evidence 两列。
skills_dir_adapter() {  # $1=目标目录（纯透传，供文档与测试引用）
  printf '%s\n' "$1"
}
