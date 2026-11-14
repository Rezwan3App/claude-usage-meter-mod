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

import { alertFor, barSvg, clock, crabSvg, doing, stepLines, sweep, sweepSpan, talkNote, toneFor } from './register'

test('limit alerts fire once per line, and again after a reset', () => {
  expect(alertFor(79, 0)).toEqual({ level: 0, fire: false })
  expect(alertFor(80, 0)).toEqual({ level: 80, fire: true })
  expect(alertFor(85, 80)).toEqual({ level: 80, fire: false })
  expect(alertFor(95, 80)).toEqual({ level: 95, fire: true })
  expect(alertFor(97, 95)).toEqual({ level: 95, fire: false })
  expect(alertFor(3, 95)).toEqual({ level: 0, fire: false })
  expect(alertFor(80, 0).fire).toBe(true)
})

test('agent steps read like plain actions', () => {
  expect(doing({ tool: 'Read', detail: 'notes.md' })).toBe('Reading notes.md')
  expect(doing({ tool: 'mcp__abc__search_threads', detail: 'x' })).toBe('Using search threads')
  expect(doing(undefined)).toBe('Getting started')
  expect(doing({ tool: 'Bash', detail: 'cd x; sed -i y' })).toBe('Running a command')
  expect(doing({ tool: 'Bash', detail: 'cd x', label: 'list the folder' })).toBe('List the folder')
  expect(doing({ tool: 'Read', detail: 'a-very-long-file-name.md' }, 16)).toBe('Reading a-very-…')
  const calls = [{ tool: 'Read', detail: 'a.md' }, { tool: 'Read', detail: 'b.md' }, { tool: 'Grep', detail: 'c' }, { tool: 'Write', detail: 'd.md' }]
  expect(stepLines(calls)).toEqual({ now: 'Writing d.md', before: ['Searching for c', 'Reading b.md'] })
  expect(stepLines([]).before).toEqual([])
})

test('the crab stays plain markup and changes between frames', () => {
  const still = crabSvg('#D97757')
  expect(still).not.toMatch(/<g|<style|class=|<animate/)
  expect(crabSvg('#D97757', { frame: 0 })).not.toBe(crabSvg('#D97757', { frame: 1 }))
  expect(crabSvg('#D97757', { frame: 2 })).toBe(crabSvg('#D97757', { frame: 0 }))
  expect(crabSvg('#D97757', { blink: true })).not.toBe(still)
  expect(crabSvg('#D97757', { sad: true })).not.toBe(still)
  expect(crabSvg('#D97757', { dim: true })).toContain('fill-opacity="0.45"')
})

test('agent talk names running siblings', () => {
  expect(talkNote([{ id: 'abc', title: 'Charts' }])).toContain('Charts (id abc)')
  expect(talkNote([])).toContain('No others are running yet')
  expect(talkNote([])).toContain('SendMessage')
})

test('bars, timer and sweep', () => {
  expect(clock(61000)).toBe('1:01')
  expect(clock(3723000)).toBe('1:02:03')
  expect(toneFor(68).hex).toBe('#8b9bb4')
  expect(toneFor(70).hex).toBe('#f59e0b')
  expect(toneFor(89).hex).toBe('#f59e0b')
  expect(toneFor(90).hex).toBe('#ef4444')
  expect(barSvg(100, '#123456', 0.5)).toContain('width="50.0"')
  expect(barSvg(100, '#123456', 0)).not.toContain('#123456')
  expect(barSvg(100, '#123456', 0.9, 0.7)).toContain('x="70.0"')
  expect(sweepSpan(0).from).toBe(0)
  expect(sweepSpan(11).to).toBe(1)
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
