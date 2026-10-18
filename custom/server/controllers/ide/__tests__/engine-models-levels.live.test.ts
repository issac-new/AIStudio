// 思考档位真机数据守门（2026-10-18 双源根治收口）：对真实 ~/.zcode manifest 断言
// GLM-5.3（大写）目录档位=[low,high,max]——即引擎/发送链语义。无 ~/.zcode 的环境
// （CI）自动 skip；ZCODE_HOME 可指夹具目录复跑。
import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const zhome = process.env.ZCODE_HOME?.trim() || join(homedir(), '.zcode')
const manifestBase = join(zhome, 'v2', 'runtime', 'provider')
const hasManifest = existsSync(manifestBase)

describe.skipIf(!hasManifest)('zcodeModelReasoningLevels 真机数据（双源根治回归锚）', () => {
  it('GLM-5.3（大写，coding-plan 命名）→ low/high/max（旧实现此例=disabled/enabled 即缺陷）', async () => {
    const { zcodeModelReasoningLevels } = await import('../engine-models')
    expect(zcodeModelReasoningLevels('GLM-5.3')).toEqual(['low', 'high', 'max'])
    expect(zcodeModelReasoningLevels('glm-5.3')).toEqual(['low', 'high', 'max'])
    expect(zcodeModelReasoningLevels('GLM-5.3-Flash')).toEqual(['low', 'high', 'max'])
  })
})
