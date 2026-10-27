import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RATE_FACTOR, voiceGender } from '@/lib/speech'

test('主要な端末の日本語の声の性別を、名前から見分ける', () => {
  assert.equal(voiceGender('Kyoko'), 'female')
  assert.equal(voiceGender('O-ren (Enhanced)'), 'female')
  assert.equal(voiceGender('Microsoft Nanami Online (Natural) - Japanese (Japan)'), 'female')
  assert.equal(voiceGender('Google 日本語'), 'female')
  assert.equal(voiceGender('Otoya'), 'male')
  assert.equal(voiceGender('Microsoft Keita Online (Natural) - Japanese (Japan)'), 'male')
  assert.equal(voiceGender('Hattori'), 'male')
  // female は male を含む。取り違えない
  assert.equal(voiceGender('Japanese Female'), 'female')
  assert.equal(voiceGender('Japanese Male'), 'male')
  assert.equal(voiceGender('なぞの こえ'), 'unknown')
})

test('速さの倍率は ゆっくり < ふつう < はやい', () => {
  assert.ok(RATE_FACTOR.slow < RATE_FACTOR.normal && RATE_FACTOR.normal < RATE_FACTOR.fast)
  assert.equal(RATE_FACTOR.normal, 1)
})
