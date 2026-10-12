import { test, expect } from 'claude-code/testing'
import { bar, fmtTok, level, modelName, moodFor, splitPath, until, oneLine, emDashIn } from './register'

test('numbers, bars and countdowns', () => {
  expect(fmtTok(346655)).toBe('346.7k')
  expect(bar(0.25, 8)).toBe('██░░░░░░')
  const now = Date.parse('2026-10-09T12:00:00Z')
  expect(until('2026-10-12T15:30:00Z', now)).toBe('3d 3h')
  expect(until('2026-10-09T14:05:00Z', now)).toBe('2h 5m')
  expect(level(5).word).toBe('Almost out')
  expect(level(72).word).toBe('Plenty left')
})

test('model and folder', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5 · 1M context')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(splitPath('C:\\Users\\you\\.claude\\mods', 'C:\\Users\\you')).toEqual({ parent: '~\\.claude\\', name: 'mods' })
  expect(splitPath('/home/r/proj', '/home/r')).toEqual({ parent: '~/', name: 'proj' })
})

test('mascot mood follows how the turn ended', () => {
  expect(moodFor('answer', 12000)).toEqual({ face: 'happy', up: false, note: 'Nice! Done in 12s' })
  expect(moodFor('error', 1).face).toBe('sad')
  expect(moodFor('aborted', 1).note).toBe('Interrupted')
})

import { clock, ringGlyph, ringSvg, sweep } from './register'

test('rings, timer and sweep', () => {
  expect(clock(61000)).toBe('1:01')
  expect(clock(3723000)).toBe('1:02:03')
  expect(ringGlyph(5)).toBe('○')
  expect(ringGlyph(43)).toBe('◑')
  expect(ringSvg(43)).toContain('#5b8def')
  expect(ringSvg(95)).toContain('#e5484d')
  expect(sweep(0, 10)).toHaveLength(10)
})

import { cacheLook, hitRate } from './register'

test('cache look and hit rate', () => {
  expect(cacheLook(45 * 60000).word).toBe('Warm')
  expect(cacheLook(10 * 60000)).toMatchObject({ word: 'Cooling', color: 'warning' })
  expect(cacheLook(2 * 60000).color).toBe('error')
  expect(cacheLook(0).word).toBe('Cold')
  expect(hitRate({ input_tokens: 10, cache_read_input_tokens: 980, cache_creation_input_tokens: 10 })).toBe(98)
  expect(hitRate({ input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBe(0)
})

test('a plugin description is cut to its first sentence', () => {
  expect(oneLine('Removes AI tells. Also does more.')).toBe('Removes AI tells.')
  expect(oneLine('x'.repeat(100))).toHaveLength(80)
})

test('em dashes are caught in prose files and file names, not code', () => {
  expect(emDashIn({ file_path: 'a.md', content: 'one — two' })).toBe('the text')
  expect(emDashIn({ file_path: 'a.md', new_string: 'plain, fine' })).toBeUndefined()
  expect(emDashIn({ file_path: 'a.md', edits: [{ new_string: 'x' }, { new_string: 'y—z' }] })).toBe('the text')
  expect(emDashIn({ file_path: 'a.ts', content: 'const dash = "—"' })).toBeUndefined()
  expect(emDashIn({ file_path: 'Notes — draft.md', content: 'ok' })).toBe('the file name')
})
