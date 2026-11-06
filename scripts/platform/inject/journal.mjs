// 注入 Journal（P1 注入核心，平台重写 Task 4）。
// 事务日志：每个补丁 apply 前把目标文件字节备份到 <stateOut>/journal/<patch>.pre/
// （fsync 落盘），apply 后登记实际落盘的 addedFiles；会话失败时按逆序恢复
// 「本次会话已改文件」。磁盘留档同时服务取证（失败会话的备份不清理）。
//
// 布局：
//   <stateOut>/journal/<patch-name>.pre/__index.json   {patch, targetRoot, entries:{rel:{existed,added}}}
//   <stateOut>/journal/<patch-name>.pre/files/<rel>    备份字节（existed=false 的 rel 无备份文件）
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync, openSync, writeSync, closeSync, fsyncSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { addedFilesFromPatch } from '../../lib/zcode-patch-manifest.mjs';

/** 补丁触碰面：{added[], modified[]}（b 侧路径；added=新增文件，modified=其余全部触碰）。 */
export function patchTouchedFiles(patchText) {
  const added = addedFilesFromPatch(patchText);
  const addedSet = new Set(added);
  const modified = [];
  const seen = new Set();
  for (const m of String(patchText).matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)) {
    const rel = m[2];
    if (addedSet.has(rel) || seen.has(rel)) continue;
    seen.add(rel);
    modified.push(rel);
  }
  return { added, modified };
}

/** 路径包含校验：child 必须严格位于 parent 之内（防补丁路径 ../ 逃逸）。 */
export function isUnder(child, parent) {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function fsyncWrite(path, bytes) {
  const fd = openSync(path, 'w');
  try {
    writeSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * 打开会话 journal。
 * @param stateOut 派生状态目录（与 manifest 同树；journal/ 随 stateOut 重定向）
 */
export function openJournal(stateOut) {
  const journalDir = join(stateOut, 'journal');
  /** 会话内已确认变更（顺序=应用顺序）；每项 {patch, targetRoot, entries, journalDir} */
  const session = [];
  return {
    dir: journalDir,

    /** 会话开始：清空上一会话 journal（回滚数据只对本会话有效）。 */
    reset() {
      rmSync(journalDir, { recursive: true, force: true });
    },

    /**
     * apply 前备份目标文件（fsync）。返回该补丁的 journal 点。
     * existed=false 的 rel 不写备份文件，仅登记（回滚时按新增文件删除）。
     */
    checkpoint(patch, targetRoot, patchText) {
      const { added, modified } = patchTouchedFiles(patchText);
      const entryDir = join(journalDir, `${patch}.pre`);
      const filesDir = join(entryDir, 'files');
      // 入口目录先建：纯新增文件补丁（无 modified 备份）也要落 __index.json
      mkdirSync(filesDir, { recursive: true });
      const entries = {};
      for (const rel of modified) {
        const abs = resolve(targetRoot, rel);
        // 包含校验：补丁路径必须落在目标树内（防御性——git apply 本身也会拒绝逃逸）
        if (!isUnder(abs, targetRoot)) {
          throw new Error(`journal: 补丁 ${patch} 触碰路径越出目标树（${rel}）`);
        }
        if (existsSync(abs)) {
          mkdirSync(dirname(join(filesDir, rel)), { recursive: true });
          fsyncWrite(join(filesDir, rel), readFileSync(abs));
          entries[rel] = { existed: true, added: false };
        } else {
          entries[rel] = { existed: false, added: false };
        }
      }
      for (const rel of added) {
        entries[rel] = { existed: false, added: true };
      }
      fsyncWrite(join(entryDir, '__index.json'), Buffer.from(JSON.stringify({ patch, targetRoot, entries }, null, 2)));
      const point = { patch, targetRoot, entries, entryDir };
      return point;
    },

    /** apply 成功后登记实际落盘的新增文件（字节事实，不是声明）。 */
    recordAdded(point, addedFiles) {
      point.addedFiles = [...addedFiles];
    },

    /** 登记会话变更（进入可回滚集合）。 */
    commit(point) {
      session.push(point);
    },

    /**
     * 回滚指定 lane（目标树）的本次会话变更：逆序恢复备份字节、删除本会话新增文件。
     * 返回 {restored[], removed[]}（rel 路径清单）。
     */
    rollbackLane(targetRoot) {
      const restored = [];
      const removed = [];
      for (let i = session.length - 1; i >= 0; i--) {
        const point = session[i];
        if (point.targetRoot !== targetRoot) continue;
        session.splice(i, 1);
        for (const [rel, meta] of Object.entries(point.entries)) {
          const abs = resolve(targetRoot, rel);
          if (meta.existed) {
            const backup = join(point.entryDir, 'files', rel);
            if (existsSync(backup)) {
              mkdirSync(dirname(abs), { recursive: true });
              fsyncWrite(abs, readFileSync(backup));
              restored.push(rel);
            }
          } else if (existsSync(abs)) {
            // 本会话新增的文件（apply 前不存在）：回滚=删除
            try {
              unlinkSync(abs);
              removed.push(rel);
            } catch { /* 删除失败保留 journal 供手工恢复 */ }
          }
        }
      }
      return { restored, removed };
    },

    /** 成功会话收尾：回滚窗口关闭，清空 journal（失败会话保留取证）。 */
    prune() {
      rmSync(journalDir, { recursive: true, force: true });
    },
  };
}
