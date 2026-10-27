import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildJoinUrl, isLocalOrigin, parseJoinHash, qrMatrix } from '@/lib/join'

test('合言葉は # 以降に入り、パスやクエリには出ない', () => {
  const url = new URL(buildJoinUrl('https://kuku.example.com', 'abcDEF123456ghiJKL789012'))
  assert.equal(url.pathname, '/join')
  assert.equal(url.search, '')
  assert.equal(url.hash, '#code=abcDEF123456ghiJKL789012')
})

test('作った URL から同じ合言葉を取り出せる', () => {
  // 記号や日本語を含んでも往復で変わらない
  for (const code of ['abcDEF123456ghiJKL789012', 'a&b=c#d e+f', 'ねこ と いぬ 2026']) {
    const url = new URL(buildJoinUrl('https://kuku.example.com/', code))
    assert.equal(parseJoinHash(url.hash), code)
  }
})

test('合言葉が空ならアプリを開くだけの URL になる', () => {
  assert.equal(buildJoinUrl('https://kuku.example.com', '   '), 'https://kuku.example.com/')
})

test('合言葉の前後の空白は落とす', () => {
  assert.equal(parseJoinHash(new URL(buildJoinUrl('https://x.example', '  abc  ')).hash), 'abc')
})

test('合言葉が無い・空のハッシュは null', () => {
  assert.equal(parseJoinHash(''), null)
  assert.equal(parseJoinHash('#'), null)
  assert.equal(parseJoinHash('#code='), null)
  assert.equal(parseJoinHash('#other=1'), null)
})

test('子どもの端末から開けない URL を見分ける', () => {
  assert.equal(isLocalOrigin('http://localhost:3000'), true)
  assert.equal(isLocalOrigin('http://127.0.0.1:3000'), true)
  assert.equal(isLocalOrigin('http://192.168.1.10:3000'), true)
  assert.equal(isLocalOrigin('https://kuku.example.com'), false)
})

test('QR のマス目は正方形で、URL の長さに見合う大きさになる', () => {
  const m = qrMatrix(buildJoinUrl('https://kuku-battle.vercel.app', 'abcDEF123456ghiJKL789012'))
  assert.ok(m.length >= 21)
  assert.ok(m.every((row) => row.length === m.length))
  // 左上の位置検出パターンの角は必ず黒
  assert.equal(m[0][0], true)
})
