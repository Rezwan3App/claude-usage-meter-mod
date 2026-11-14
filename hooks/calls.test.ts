import { test, expect } from 'claude-code/testing'
import { connectorName, noteUse, agentIdFor, callDetail, hueFor, plainChat, speaker, who, windowOf } from './register'

test('a call is summed up by its main argument', () => {
  expect(callDetail({ file_path: 'C:/repo/src/server.ts' })).toBe('server.ts')
  expect(callDetail({ command: 'bun   test\n  --watch' })).toBe('bun test --watch')
  expect(callDetail({ pattern: 'isChannelId' })).toBe('isChannelId')
  expect(callDetail({})).toBeUndefined()
})

test("clicking an agent's tool calls lists which tools it ran", async ($, on) => {
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/x' }))
  on('env.get', () => ({ value: '/home' }))
  on('clock.now', () => ({ value: 0 }))

  await $.agent.spawn({ tool_use_id: 't', prompt: 'go', description: 'Developer review', subagentType: 'general-purpose' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/scanner.ts', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'bun test', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'git status' } as never) // the main loop's, not the agent's

  const pane = await $.ui.mount({
    plugin: 'usage-meter', surface: 'desktop', component: 'Pane', requestId: 'usage-meter',
    props: { isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
  })
  const before = JSON.stringify(await pane.drawn())
  expect(before).toContain('▸ 2 tool calls')
  expect(before).toContain('Reading scanner.ts')

  await pane.press({ key: 'calls-a1' })
  const after = JSON.stringify(await pane.drawn())
  expect(after).toContain('▾ 2 tool calls')
  expect(after).toContain('scanner.ts')
  expect(after).toContain('Bash')
  expect(after).not.toContain('git status')

  await pane.press({ key: 'calls-a1' })
  expect(JSON.stringify(await pane.drawn())).toContain('▸ 2 tool calls')
})

test('the band picks a model and an effort by click', async ($, on) => {
  const ran: string[] = []
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.cwd', () => ({ value: '/home/x' }))
  on('env.get', () => ({ value: '/home' }))
  on('command.run', (_$, e) => { ran.push(`${e.command} ${e.args}`); return { text: 'ok' } })

  const band = await $.ui.mount({
    plugin: 'usage-meter', surface: 'desktop', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never,
  })
  expect(JSON.stringify(await band.drawn())).toContain('Haiku 5.5')
  await band.select({ key: 'model', value: 'claude-opus-5-5' })
  expect(ran).toContain('model claude-opus-5-5')
  await band.select({ key: 'effort', value: 'high' })
  expect(ran).toContain('effort high')
  expect(JSON.stringify(await band.drawn())).toContain('"value":"high"')
})

test('plugins and connectors fold open, and an item shows its description on click', async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/x' }))
  on('env.get', () => ({ value: '/home' }))
  on('clock.now', () => ({ value: 0 }))
  const plugins = [{ name: 'ponytail', description: 'Lazy senior dev mode.', enabled: true }]
  on('state.get', (_$: any, e: any, next: any) => (e.key === 'plugins' ? { value: { value: plugins, version: 1 } } : e.key === 'used' ? { value: { value: { plugins: ['ponytail'], connectors: [], skills: [] }, version: 1 } } : next(e)) as never)
  const pane = await $.ui.mount({
    plugin: 'usage-meter', surface: 'desktop', component: 'Pane', requestId: 'usage-meter',
    props: { isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
  })
  const draw = async () => JSON.stringify(await pane.drawn())
  expect(await draw()).toContain('▸ Plugins (1)')
  expect(await draw()).not.toContain('ponytail')
  await pane.press({ key: 'sec-plugin' })
  expect(await draw()).toContain('▸ ponytail')
  expect(await draw()).not.toContain('Lazy senior dev mode.')
  await pane.press({ key: 'plugin-ponytail' })
  expect(await draw()).toContain('Lazy senior dev mode.')
})

test('setup counts only what the session used, named for people', () => {
  const none = { plugins: [], connectors: [], skills: [] }
  const skill = noteUse(none, 'Skill', 'superpowers:brainstorming')
  expect(skill).toEqual({ plugins: ['superpowers'], connectors: [], skills: ['brainstorming'] })
  expect(noteUse(skill, 'Skill', 'superpowers:brainstorming')).toEqual(skill)
  expect(noteUse(none, 'Skill', 'my-skill').skills).toEqual(['my-skill'])
  const gmail = '11112222-aaaa-bbbb-cccc-ddddeeeeffff'
  expect(noteUse(none, `mcp__${gmail}__search_threads`).connectors).toEqual([gmail])
  expect(connectorName('Gmail')).toBe('Gmail')
  expect(connectorName('11112222-aaaa')).toBe('Connector 11112222')
  expect(noteUse(none, 'mcp__plugin_data_hex__query').plugins).toEqual(['data'])
  expect(noteUse(none, 'mcp__ccd_turn__update_plan')).toEqual(none)
  expect(noteUse(none, 'mcp__Claude_Browser__navigate')).toEqual(none)
  expect(noteUse(none, 'Read')).toEqual(none)
})

test('the em-dash guard is off unless the option is set', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  const r = await $.tool.call({ tool: 'Write', file_path: 'a.md', content: 'one — two' } as never)
  expect(JSON.stringify(r)).not.toContain('Em dash')
})

test('with blockEmDashes on, an em dash in a .md write is refused', { options: { blockEmDashes: true } }, async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }) as never)
  const r = await $.tool.call({ tool: 'Write', file_path: 'a.md', content: 'one — two' } as never)
  expect(JSON.stringify(r)).toContain('Em dash found in the text')
})

test('chat names: Claude for main, Agent N by start order', () => {
  const agents = [{ id: 'main', title: 'Claude' }, { id: 'abc123', title: 'Deep research' }, { id: 'def456', title: 'Charts' }] as never
  expect(who(undefined, agents)).toBe('Claude')
  expect(who('main', agents)).toBe('Claude')
  expect(who('abc123', agents)).toBe('Agent 1')
  expect(who('def456', agents)).toBe('Agent 2')
  expect(who('zzz', agents)).toBe('Agent ?')
  const later = [{ id: 'main', startedAt: 10 }, { id: 'old', startedAt: 1 }, { id: 'new1', startedAt: 11 }, { id: 'new2', startedAt: 12 }] as never
  expect(who('new2', later)).toBe('Agent 2')
})

test('list windows clamp to both ends', () => {
  const list = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  expect(windowOf(list, 0, 4).rows).toEqual([1, 2, 3, 4])
  expect(windowOf(list, 8, 4).rows).toEqual([6, 7, 8, 9])
  expect(windowOf(list, -3, 4).rows).toEqual([1, 2, 3, 4])
  expect(windowOf([1, 2], 5, 4).rows).toEqual([1, 2])
  expect(windowOf(list, 9 - 5 - 0, 5).rows).toEqual([5, 6, 7, 8, 9])
})

test('chat text drops paths, file names, citations and markdown, and keeps it short', () => {
  expect(plainChat('Agent 2, **fix** the $2.6B in C:\\Users\\x\\Project Summary.html [3][4] now.')).toBe('Agent 2, fix the $2.6B in now.')
  expect(plainChat('Agent 1, I agree. The quadrant names match. Also see "07 Deep Research Round 2.md" for more detail on everything else we checked today.')).toBe('Agent 1, I agree. The quadrant names match. Also see for more detail on everything else we checked today.')
  expect(plainChat('Agent 3, done. ' + 'This sentence is long on purpose to push past the limit. '.repeat(4))).toBe('Agent 3, done. This sentence is long on purpose to push past the limit. This sentence is long on purpose to push past the limit.')
})

test('a chat speaker gets the same color as its Agents row', () => {
  const agents = [{ id: 'main' }, { id: 'abc123' }, { id: 'def456' }] as never
  expect(agentIdFor('main', agents)).toBe('main')
  expect(agentIdFor('abc123', agents)).toBe('abc123')
  expect(hueFor('main', agents)).toBe('claude')
  expect(hueFor('abc123', agents)).toBe('suggestion')
  expect(hueFor('def456', agents)).toBe('success')
})

test('older chat lines without ids still get their agent color by name', () => {
  const agents = [{ id: 'main', startedAt: 0 }, { id: 'a1', startedAt: 1 }, { id: 'a2', startedAt: 2 }, { id: 'a3', startedAt: 3 }] as never
  expect(hueFor(speaker(undefined, 'Agent 3', agents), agents)).toBe('warning')
  expect(hueFor(speaker(undefined, 'Claude', agents), agents)).toBe('claude')
  expect(hueFor(speaker('a1', 'Agent 9', agents), agents)).toBe('suggestion')
})
