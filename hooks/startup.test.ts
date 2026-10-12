import { test, expect } from 'claude-code/testing'

const now = Date.parse('2026-10-09T12:00:00Z')

// The engine pieces beneath the mod: what the app would answer.
function engine(on: any, store: Record<string, unknown>, state: Record<string, unknown>) {
  on('state.set', ($: any, e: any) => ((state[e.key] = e.value), { value: { isSet: true, version: 1 } }) as never)
  on('state.get', ($: any, e: any) => ({ value: { value: state[e.key], version: 1 } }) as never)
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: 'C:\\Users\\you\\projects\\launch' }))
  on('env.get', () => ({ value: 'C:\\Users\\you' }))
  on('store.get', ($: any, e: any) => ({ value: store[e.key] }))
  on('store.set', ($: any, e: any) => ((store[e.key] = e.value), { value: undefined }))
  on('store.keys', () => ({ value: Object.keys(store) }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: now }))
  on('clock.every', () => ({ value: undefined }) as never)
  on('clock.after', () => ({ value: undefined }) as never)
  on('session.usage', () => ({
    value: {
      startedAt: now - 61000,
      context: { window: 200000, tokens: 10000, percent: 5 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 20, resetsAt: '2026-10-09T14:15:00Z' }, { kind: 'seven_day', percentUsed: 43 }],
    },
  }) as never)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
  on('turn.complete', () => ({ text: '' }))
}

const turn = { turnId: 't1', answer: 'hi', durationMs: 17000, isAborted: false, reason: 'answer',
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0, model: 'm' } }

// Runs the real hooks against the engine, so a bad $ call or a tree the app refuses fails here.
test('a session with one agent: tokens, limits, agent row, pane and band draw', async ($, on) => {
  const store: Record<string, unknown> = {}
  const state: Record<string, unknown> = {}
  engine(on, store, state)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const reading = state.reading as any
  expect(reading.limits.map((l: any) => l.kind)).toEqual(['seven_day', 'five_hour'])

  await $.agent.spawn({ tool_use_id: 'tu1', prompt: 'go', description: 'Research competitor launches', subagentType: 'careful' } as never)
  await $.turn.complete({ ...turn, agentId: 'a1' } as never)
  const agents = state.agents as any[]
  expect(agents).toHaveLength(1)
  expect(agents[0]).toMatchObject({ title: 'Research competitor launches', model: 'Opus 5.5', state: 'done', tokens: 1150, ms: 17000 })

  await $.turn.complete(turn as never)
  expect(store['s:sess-1']).toEqual({ tokIn: 2200, tokOut: 100 })

  for (const surface of ['desktop', 'terminal'] as const) {
    const pane = await $.ui.mount({
      plugin: 'usage-meter', surface, component: 'Pane', requestId: 'usage-meter',
      props: { isFocused: false, bodyColumns: 44, placement: 'dock' } as never,
    })
    expect(JSON.stringify(await pane.drawn())).toContain('Research competitor launches')
    const p = JSON.stringify(await pane.drawn())
    expect(p).toContain('7-day limit')
    expect(p).toContain('memory used')
    expect(p.includes('"Svg"')).toBe(surface === 'desktop')

    const band = await $.ui.mount({
      plugin: 'usage-meter', surface, component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never,
    })
    const b = JSON.stringify(await band.drawn())
    expect(b).toContain('"Done"')
    expect(b).toContain('1/1 agents')
    expect(b).toContain('Opus 5.5')
    expect(b).toContain('📁 ')
    expect(b.indexOf('"key":"model"')).toBeLessThan(b.indexOf('"Done"'))
  }
})
