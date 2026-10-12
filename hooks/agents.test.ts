import { test, expect } from 'claude-code/testing'
import { syncAgents } from './register'

// The test runner has timers; the mod's type environment just doesn't declare them.
declare const setTimeout: (fn: (v?: unknown) => void, ms: number) => unknown

// Three agents launched in one step: their start events race. A store that
// enforces ifVersion like the real one, with a pause on each call so the
// reads and writes interleave the way they do in the app.
test('agents started at the same moment are all listed', async ($, on) => {
  const state: Record<string, { value: unknown; version: number }> = {}
  const pause = () => new Promise(r => setTimeout(r, 1))
  on('state.get', async ($: any, e: any) => {
    await pause()
    return { value: { value: state[e.key]?.value, version: state[e.key]?.version ?? 0 } } as never
  })
  on('state.set', async ($: any, e: any) => {
    await pause()
    const cur = state[e.key]?.version ?? 0
    if (e.ifVersion !== undefined && e.ifVersion !== cur) return { value: { isSet: false, version: cur } } as never
    state[e.key] = { value: e.value, version: cur + 1 }
    return { value: { isSet: true, version: cur + 1 } } as never
  })
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `a${++n}` }))
  on('clock.now', () => ({ value: 0 }))

  await Promise.all(
    ['Developer review', 'Design review', 'Product review'].map(description =>
      $.agent.spawn({ tool_use_id: description, prompt: 'go', description, subagentType: 'general-purpose' } as never),
    ),
  )
  const titles = (state.agents?.value as { title: string }[]).map(a => a.title).sort()
  expect(titles).toEqual(['Design review', 'Developer review', 'Product review'])
})

test('an Explore agent with no model named runs on Haiku', async ($, on) => {
  const asked: (string | undefined)[] = []
  on('agent.spawn', (_$: any, e: any) => { asked.push(e.model); return { model: e.model ?? 'claude-opus-5-5', agentId: `a${asked.length}` } })
  on('clock.now', () => ({ value: 0 }))
  on('session.id', () => ({ value: 's' }))
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'find', description: 'Find files', subagentType: 'Explore' } as never)
  await $.agent.spawn({ tool_use_id: 't2', prompt: 'find', description: 'Find files', subagentType: 'Explore', model: 'sonnet' } as never)
  await $.agent.spawn({ tool_use_id: 't3', prompt: 'build', description: 'Build it', subagentType: 'general-purpose' } as never)
  expect(asked).toEqual(['haiku', 'sonnet', undefined])
})

test('agents the pane missed are picked up from the engine list', async () => {
  // A stand-in host: the test runner's $ has no agent.list.
  const box: Record<string, { value: unknown; version: number }> = {}
  const fake = {
    agent: { list: async () => [
      { id: 'x1', description: 'Deep research', type: 'general-purpose', status: 'running' },
      { id: 'x2', description: 'Summary PDF', type: 'general-purpose', status: 'completed' },
    ] },
    clock: { now: async () => 5 },
    state: {
      get: async (r: { key: string }) => ({ value: box[r.key]?.value, version: box[r.key]?.version ?? 0 }),
      set: async (r: { key: string }, value: unknown) => {
        const version = (box[r.key]?.version ?? 0) + 1
        box[r.key] = { value, version }
        return { isSet: true, version }
      },
    },
  }
  await syncAgents(fake)
  await syncAgents(fake)
  const rows = box.agents?.value as { title: string; state: string }[]
  expect(rows.map(a => `${a.title}:${a.state}`)).toEqual(['Deep research:running', 'Summary PDF:done'])
})
