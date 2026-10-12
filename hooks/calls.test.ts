import { test, expect } from 'claude-code/testing'
import { callDetail } from './register'

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
  expect(before).not.toContain('scanner.ts')

  await pane.press({ key: 'calls-a1' })
  const after = JSON.stringify(await pane.drawn())
  expect(after).toContain('▾ 2 tool calls')
  expect(after).toContain('scanner.ts')
  expect(after).toContain('bun test')
  expect(after).not.toContain('git status')

  await pane.press({ key: 'calls-a1' })
  expect(JSON.stringify(await pane.drawn())).not.toContain('scanner.ts')
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
  on('state.get', (_$: any, e: any, next: any) => (e.key === 'plugins' ? { value: { value: plugins, version: 1 } } : next(e)) as never)
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
