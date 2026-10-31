import { expect, it } from 'vitest'
import sharp from 'sharp'
import { resolve } from 'node:path'
import { PERSON_BOTS } from '../../packages/shared/person-bots'

const publicDirectory = resolve('packages/client/public')

it.each(PERSON_BOTS)('$type has an exact transparent first frame and centered avatar framing', async bot => {
  const still = await sharp(resolve(publicDirectory, `.${bot.idleFrame}`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const first = await sharp(resolve(publicDirectory, `.${bot.animations.idle}`), { page: 0, pages: 1 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  expect(still.info).toMatchObject({ width: first.info.width, height: first.info.height, channels: 4 })
  expect(still.data.equals(first.data)).toBe(true)
  const { width, height } = still.info
  let left = width, top = height, right = -1, bottom = -1
  let transparent = 0, opaque = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = still.data[(y * width + x) * 4 + 3]
    if (alpha === 0) transparent++
    if (alpha === 255) opaque++
    if (alpha > 16) {
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
  }
  expect(transparent).toBeGreaterThan(0)
  expect(opaque).toBeGreaterThan(0)
  if (bot.type === 'zhezhe') {
    expect(bot.avatarOffset).toEqual({ x: 0, y: 0 })
  } else {
    expect((left + right + 1) / 2 + bot.avatarOffset.x * width).toBeCloseTo(width / 2, 6)
    expect((top + bottom + 1) / 2 + bot.avatarOffset.y * height).toBeCloseTo(height / 2, 6)
  }
  expect(left + bot.avatarOffset.x * width).toBeGreaterThanOrEqual(0)
  expect(top + bot.avatarOffset.y * height).toBeGreaterThanOrEqual(0)
  expect(right + bot.avatarOffset.x * width).toBeLessThan(width)
  expect(bottom + bot.avatarOffset.y * height).toBeLessThan(height)
})

it.each(PERSON_BOTS)('$type centers the full working animation without clipping any frame', async bot => {
  const file = resolve(publicDirectory, `.${bot.animations.thinking}`)
  const metadata = await sharp(file, { animated: true }).metadata()
  const { data, info } = await sharp(file, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const width = info.width, height = metadata.pageHeight!
  let left = width, top = height, right = -1, bottom = -1
  for (let frame = 0; frame < metadata.pages!; frame++) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[((frame * height + y) * width + x) * 4 + 3] > 16) {
        left = Math.min(left, x); right = Math.max(right, x)
        top = Math.min(top, y); bottom = Math.max(bottom, y)
      }
    }
  }
  const { x, y } = bot.thinkingOffset
  if (bot.type === 'zhezhe') expect(bot.thinkingOffset).toEqual({ x: 0, y: 0 })
  else {
    expect((left + right + 1) / 2 + x * width).toBeCloseTo(width / 2, 6)
    expect((top + bottom + 1) / 2 + y * height).toBeCloseTo(height / 2, 6)
  }
  expect(left + x * width).toBeGreaterThanOrEqual(0)
  expect(top + y * height).toBeGreaterThanOrEqual(0)
  expect(right + x * width).toBeLessThan(width)
  expect(bottom + y * height).toBeLessThan(height)
})
