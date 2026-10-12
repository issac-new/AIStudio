#!/bin/bash
# mx-node.sh — 节点切片层（2026-10-12 三机真集群轮）
#
# 编制真相（USERS/INSTANCED_USERS）保持全量在 mx-lib——驱动（导演机）派活走
# matrix 房间与 git 远端，天然跨机，必须知道全体。本层只回答一个问题：
# 「哪些账号/档案/板跑在本节点」——profile 生成、板创建、本地日志判活、
# kanban 本地真值核验等本地执行面按切片收敛。
#
# 模式：
#   MX_NODE 未设（默认 solo）＝单机模拟集群（现状行为，全编制本机跑）；
#   MX_NODE=<名> 且 MX_NODE_USERS="hu,xiao" ＝真集群节点，只建/只管清单内档案。
# 导演机（MX_ROLE=director）也用本层收敛「本地档案面」，派活面不受影响。
set -u

MX_NODE="${MX_NODE:-solo}"
MX_ROLE="${MX_ROLE:-director}"   # director | agent（agent 机可不跑驱动/studio）

# solo 模式＝全编制；节点模式按 MX_NODE_USERS 逗号清单切（顺序保持编制序，
# 便于日志与 manifest 对账）。清单里的未知名字大声剔除，不静默吞。
node_users() { # → 本节点 INSTANCED_USERS 子集（换行分隔）
  local u
  if [[ "$MX_NODE" == solo || -z "${MX_NODE_USERS:-}" ]]; then
    printf '%s\n' "${INSTANCED_USERS[@]}"
    return 0
  fi
  for u in ${MX_NODE_USERS//,/ }; do
    case " ${INSTANCED_USERS[*]} " in
      *" $u "*) printf '%s\n' "$u" ;;
      *) echo "[mx-node] ⚠ MX_NODE_USERS 含编制外档案：$u（忽略）" >&2 ;;
    esac
  done
}
node_has() { # <user> → 0=本节点档案
  [[ "$MX_NODE" == solo || -z "${MX_NODE_USERS:-}" ]] && return 0
  case ",${MX_NODE_USERS}," in *",$1,"*) return 0 ;; esac
  return 1
}
node_mode_desc() {
  if [[ "$MX_NODE" == solo ]]; then echo "solo（单机全编制）"; else
    echo "node=${MX_NODE} role=${MX_ROLE} users=${MX_NODE_USERS:-}"; fi
}
