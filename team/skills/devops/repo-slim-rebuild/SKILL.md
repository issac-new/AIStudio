---
name: repo-slim-rebuild
description: "Use when git 仓需 filter-repo 瘦身重建新链并分块推回远端."
version: 1.0.0
metadata:
  hermes:
    tags: [git, filter-repo, slim, push, intake-governance]
---

# 仓瘦身重建与远端收口（repo-slim-rebuild）

> orchestrator 自有增量件。分块推送细节以 default 的 large-push-chunking
> 为准，定时清扫机制以 default 的 repo-bigfile-hygiene 为准；本件只补两者
> 未覆盖的「拔摄入源→冷存档→重建→推回→收口」端到端程序与裁决点。

## 触发

- 待推历史含单 commit 净重超 push 天花板的不可再分胖 commit（GitHub HTTP
  实测单 push 150-180MB、单文件 100MB 硬限），分段重试已证死路
- 用户裁决剥离大文件大类（逆向产物/克隆仓/venv/媒体），需重建历史并推回

## Procedure（顺序执行）

1. **先拔摄入源**：定位定时全量提交者——
   `git log --format='%an %s' | sort | uniq -c | sort -rn | head` 找批量
   提交者，`grep -rln 'git add -A' ~/.hermes/bin ~/Library/LaunchAgents`
   定位脚本。`git add -A` 型 auto-backup 定时器与「快照只收文本类资产」
   结构性冲突，治理口径=卸载 launchd + 删 plist + 脚本移入当日冷存档留档；
   只清扫不拔源必复胖。定时器可静默失败数周（路径指向已迁移旧目录）——
   `launchctl list | grep <label>` 退出码列才是运行证据，plist 在位 ≠ 在跑。
2. **全量冷存档（先存档再删纪律）**：`git bundle create <archive>/pre-slim-full.bundle --all`
   + 工作树 tar 快照 + SHA256 manifest 同目录。filter-repo 重写不可逆，
   bundle 是唯一回滚锚；瘦身只断 git 追踪，盘上实体不动。
3. **剥大类 + 两层 .gitignore 同 commit 落地**：精确路径挡已知大目录 +
   扩展名通配挡未知（*.apk/*.tar.gz/*.gguf/*.parquet/*.png/*.pdf/
   .venv*/vendor/ 等）。原则=可再生重物不进 git，报告与笔记
   （md/txt/json/csv/yaml）进；个别要入库的媒体 `git add -f` 放行。
   巨型 rm --cached 批次可被 fatal 打断只落 .gitignore——commit 后必
   `git diff --cached --stat | tail -1` 验索引已清，未清补 commit。
4. **瘦身链分块推专用分支**：`BASE=$(git merge-base origin/<branch> HEAD)`
   起 `git rev-list --reverse --first-parent ${BASE}..HEAD` 排段（必须
   first-parent 主干序；默认拓扑序在并行线历史里跳段，推出
   non-fast-forward），逐段 `"${c}":refs/heads/<专用分支>` 后台串行推+
   重试退避。被拒段先 `git merge-base --is-ancestor <远端头> <段点>` 判线：
   非祖先=远端 ref 已被拓扑序推上旁支——`git push origin --delete
   <专用分支>`（对象留远端）后从 merge-base 重排重推，已传对象不重传。
5. **收口对账四件**（全绿才报完成）：① `ls-remote` 远端 ref == 本地 HEAD；
   ② 关键交付文件与权威工作区 `md5 -q` 全等；③ `git rev-list --objects HEAD |
   git cat-file --batch-check` 无 >50MB blob；④ 本轮交付关键词 `git grep`
   在 HEAD 树在位。
6. **main 切换留用户裁决**：远端 main 仍指旧历史（含被剥离对象）时，切到
   瘦身链=force-push 不可逆——列出旧 main 回滚锚（冷存档 bundle 路径）
   交用户拍板，不自动切。

## Pitfalls

- **网络探活先于体积归因**：send-pack 低 CPU 长时间零输出时，路由不通与
  体积超限表象相同——`curl -s -m 5 https://api.github.com/zen` 探活，
  通了再按卡死三步判定；代理/VPN 启用后原方案重跑即可，别先拆历史。
- **待推 >100MB 先报构成再传**：
  `git rev-list --objects origin/<branch>..HEAD | git cat-file --batch-check='%(objectname) %(objectsize) %(rest)'`
  按顶层目录聚合求和，报用户「都在传啥」并等裁决——聚合常直接暴露可剥离
  重物，硬推=烧数小时带宽传垃圾；用户有权在上传前知道构成。
- **验证祖先要验「远端头→下一段」这一对**：验成「段点的父」会返回真值但
  错过跳线信号。
