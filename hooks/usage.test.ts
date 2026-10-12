import { test, expect } from 'claude-code/testing'
import { barParts, fmtTok, modelName, moodFor, splitPath, until, oneLine, emDashIn } from './register'

test('numbers, bars and countdowns', () => {
  expect(fmtTok(346655)).toBe('346.7k')
  expect(barParts(0.25, 8)).toEqual({ fill: '██', track: '──────' })
  const now = Date.parse('2026-10-09T12:00:00Z')
  expect(until('2026-10-12T15:30:00Z', now)).toBe('3d 3h')
  expect(until('2026-10-09T14:05:00Z', now)).toBe('2h 5m')
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
