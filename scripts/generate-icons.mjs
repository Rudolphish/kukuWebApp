/**
 * ホーム画面アイコンを生成する。
 *
 * YouTube や Roblox と同じ列に並ぶので、見た目はゲームに振る。
 * 「勉強」を思わせる意匠（鉛筆・ノート・数式）は使わない。
 * 依存を足さないよう、PNG を zlib で直接書き出す。
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

/** RGBA ピクセル配列を PNG バイト列にする。 */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]

const BG_TOP = hex('#1d4630')
const BG_BOTTOM = hex('#0b1710')
const GEM_LIGHT = hex('#b6f7c2')
const GEM_MAIN = hex('#5ad469')
const GEM_DARK = hex('#2c8a45')
const GEM_EDGE = hex('#0f3a1e')

/**
 * ブロック状の宝石を描く。
 * グリッドに量子化することで、意図してドット絵に見せる。
 */
function drawIcon(size, inset) {
  const rgba = Buffer.alloc(size * size * 4)
  const cells = 16
  const cell = size / cells
  // 宝石が収まる正方領域。maskable は内側 80% に収める
  const pad = size * inset
  const box = size - pad * 2

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4
      const t = y / size
      let [r, g, b] = [
        Math.round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
        Math.round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
        Math.round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t),
      ]

      // グリッドの中心で判定して、ドット絵の階段状の輪郭を出す
      const gx = (Math.floor(x / cell) + 0.5) * cell
      const gy = (Math.floor(y / cell) + 0.5) * cell
      const u = (gx - pad) / box
      const v = (gy - pad) / box

      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        // 菱形（|u-0.5| + |v-0.5| <= 0.5）を宝石の外形にする
        const d = Math.abs(u - 0.5) * 1.05 + Math.abs(v - 0.5)
        if (d <= 0.5) {
          // 上を明るく、下を暗くして光の向きを一定にする
          let color = GEM_MAIN
          if (d > 0.44) color = GEM_EDGE
          else if (v < 0.36) color = GEM_LIGHT
          else if (v > 0.60) color = GEM_DARK
          // 面の左上に 1 ブロックだけ強いハイライトを置く
          if (u > 0.30 && u < 0.40 && v > 0.40 && v < 0.50) color = GEM_LIGHT
          ;[r, g, b] = color
        }
      }

      rgba[i] = r
      rgba[i + 1] = g
      rgba[i + 2] = b
      rgba[i + 3] = 255
    }
  }
  return encodePng(size, size, rgba)
}

mkdirSync('public', { recursive: true })
const outputs = [
  ['public/icon-192.png', 192, 0.14],
  ['public/icon-512.png', 512, 0.14],
  ['public/apple-touch-icon.png', 180, 0.14],
  ['public/icon-maskable-512.png', 512, 0.22],
]
for (const [path, size, inset] of outputs) {
  writeFileSync(path, drawIcon(size, inset))
  console.log('wrote', path)
}
