import { update } from 'claude-code'
import type { AgentInfo, Register } from 'claude-code'

import type { Agent, Call, Mood, PluginRow, Reading, Rec, Totals } from '../types'

const PANE = 'usage-meter'
const ZERO: Rec = { tokIn: 0, tokOut: 0 }
const TOTALS = { plugin: 'usage-meter', key: 'totals' } as const
const READING = { plugin: 'usage-meter', key: 'reading' } as const
const MOOD = { plugin: 'usage-meter', key: 'mood' } as const
const AGENTS = { plugin: 'usage-meter', key: 'agents' } as const
const NOW = { plugin: 'usage-meter', key: 'now' } as const
const PCT = { plugin: 'usage-meter', key: 'pct' } as const
const STEP = { plugin: 'usage-meter', key: 'step' } as const
const EFFORT = { plugin: 'usage-meter', key: 'effort' } as const
const PLUGINS = { plugin: 'usage-meter', key: 'plugins' } as const
const CONNECTORS = { plugin: 'usage-meter', key: 'connectors' } as const
// One-liners for claude.ai connectors; anything not listed shows a generic line.
const CONNECTOR_NOTES: Record<string, string> = {
  'Gmail': 'Read, search and draft email.',
  'Google Calendar': 'See and schedule events.',
  'Google Drive': 'Find and read files in Drive.',
  'Google Docs': 'Read and edit Google Docs.',
  'Notion': 'Search and edit Notion pages.',
  'Slack': 'Read and post in Slack.',
  'Canva': 'Create and edit Canva designs.',
  'Airtable': 'Read and update Airtable bases.',
  'Fireflies': 'Meeting transcripts and notes.',
  'Miro': 'Read and edit Miro boards.',
  'Supabase': 'Manage Supabase projects and databases.',
  'Microsoft 365': 'Outlook, OneDrive and Office files.',
  'ViewMax': 'Generate images and short videos.',
  'Claude Docs': 'Docs you create and edit with Claude.',
  'ZipRecruiter': 'Search job listings.',
  'Unsplash': 'Find stock photos.',
  'AccuWeather®': 'Weather forecasts.',
  'Mobbin': 'Real app screens for design reference.',
}
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
// ponytail: stage-based percent (by tool kind), not true progress; the turn's real length is unknowable
const STAGES: Record<string, [number, string]> = {
  Read: [25, 'Reading and understanding'], Grep: [25, 'Searching the code'], Glob: [25, 'Searching the code'],
  WebSearch: [25, 'Researching'], WebFetch: [25, 'Researching'],
  Edit: [60, 'Making changes'], Write: [60, 'Making changes'],
  Bash: [80, 'Running and checking'], PowerShell: [80, 'Running and checking'],
}
const CONTEXT = { plugin: 'usage-meter', key: 'context' } as const
const HELPERS = { plugin: 'usage-meter', key: 'helpers' } as const
const OPEN = { plugin: 'usage-meter', key: 'open' } as const
// Tint behind each pane zone, tuned for the dark theme (mods can't read the app theme).
const PANEL_BG = '#262626'
const MAX_CALLS = 40
// Row id for Claude's own work in the main session.
const MAIN = 'main'

// The one argument that says what a call did: a file name, a command, a pattern, a URL.
export const callDetail = (e: Record<string, unknown>): string | undefined => {
  for (const k of ['file_path', 'notebook_path', 'command', 'pattern', 'url', 'query', 'description', 'path', 'prompt']) {
    const v = e[k]
    if (typeof v !== 'string' || !v.trim()) continue
    const s = k.endsWith('_path') ? (v.split(/[\\/]/).pop() ?? v) : v.replace(/\s+/g, ' ').trim()
    return s.length > 60 ? `${s.slice(0, 59)}…` : s
  }
  return undefined
}
// Each agent gets its own color, cycling.
const HUES = ['claude', 'suggestion', 'success', 'warning', 'merged', 'planMode'] as const

export const fmtTok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`)
// A bar as two parts, so the empty track can be drawn quieter than the fill.
export const barParts = (frac: number, width: number) => {
  const n = Math.round(Math.max(0, Math.min(1, frac)) * width)
  return { fill: '█'.repeat(n), track: '─'.repeat(width - n) }
}
// A short block sweeping across the track, for work with no known end.
export const sweep = (tick: number, width: number) => {
  const run = Math.max(2, Math.floor(width / 5))
  const at = tick % (width + run) - run
  return Array.from({ length: width }, (_, i) => (i >= at && i < at + run ? '█' : '░')).join('')
}
export const until = (iso: string | undefined, now: number) => {
  if (!iso) return undefined
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}
// "1:01", "12:05", "1:02:03"
export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
const secs = (ms: number) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s` : `${Math.max(1, Math.round(ms / 1000))}s`)
export const moodFor = (reason: string, durationMs: number): Mood =>
  reason === 'answer'
    ? { face: 'happy', up: false, note: `Nice! Done in ${secs(durationMs)}` }
    : { face: 'sad', up: false, note: reason === 'aborted' ? 'Interrupted' : reason === 'refusal' ? 'That one got refused' : 'Ran into an error' }

// "claude-opus-5-5[1m]" -> "Opus 5.5 · 1M context"; a name already readable is kept.
export const modelName = (id: string) => {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id)
  const big = id.includes('[1m]') ? ' · 1M context' : ''
  if (!m) return id.replace('[1m]', '') + big
  const [, fam = '', major, minor] = m
  return `${fam.slice(0, 1).toUpperCase()}${fam.slice(1)} ${major}${minor && minor.length <= 2 ? `.${minor}` : ''}${big}`
}
// Last folder in bold, the rest dim, home shown as ~.
export const splitPath = (cwd: string, home?: string) => {
  const p = home && cwd.toLowerCase().startsWith(home.toLowerCase()) ? '~' + cwd.slice(home.length) : cwd
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i < 0 ? { parent: '', name: p } : { parent: p.slice(0, i + 1), name: p.slice(i + 1) || p }
}

const ART = {
  happy: [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  '],
  sad: [' ▐▙███▟▌ ', '▗▐█████▌▖', '  ▘▘ ▝▝  '],
}
// The small one each agent row carries.
const MINI = ['▐▛█▜▌', '▝▜█▛▘']
// SVG twins of HUES, since SVG can't read theme keys.
const HUE_HEX: Record<(typeof HUES)[number], string> = {
  claude: '#D97757', suggestion: '#5b8def', success: '#3fb950', warning: '#e5a00d', merged: '#a371f7', planMode: '#3fb8af',
}

// Pixel crab, after savvy-progress (johnnyvizz/claude-kit, MIT), itself from DockCrab.
// Desktop draws it as SVG: block glyphs never line up in a proportional font.
// Kept to the same plain markup as ringSvg (bare <rect>s, 0-origin viewBox, no
// <g>/class/<style>): the desktop drew nothing for a richer version.
export const crabSvg = (color: string, o: { sad?: boolean; dim?: boolean; width?: number } = {}) => {
  const w = o.width ?? 26
  const op = o.dim ? ' fill-opacity="0.45"' : ''
  const r = (x: number, y: number, rw: number, rh: number, c = color) => `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${c}"${op}/>`
  const eye = o.sad ? 5 : 4
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round((w * 19) / 26)}" viewBox="0 0 26 19">`
    + r(5, 2, 16, 12) + r(1, 6, 4, 4) + r(21, 6, 4, 4) + r(7, eye, 2, 2, '#1F1E1D') + r(17, eye, 2, 2, '#1F1E1D')
    + r(5, 14, 2, 4) + r(9, 14, 2, 4) + r(15, 14, 2, 4) + r(19, 14, 2, 4)
    + '</svg>'
}

// A progress ring as SVG: dim track, cool-blue arc from 12 o'clock. Hex colors, since SVG can't read theme keys.
export const ringSvg = (pct: number, size = 36, color?: string) => {
  const r = size / 2 - 3, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, pct)) / 100
  const arc = color ?? (pct >= 90 ? '#e5484d' : pct >= 70 ? '#e5a00d' : '#5b8def')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#8a8f98" stroke-opacity="0.25" stroke-width="4"/>`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${arc}" stroke-width="4" stroke-linecap="round"`
    + ` stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`
}
// Where there's no SVG (the terminal): a quarter-step glyph.
export const ringGlyph = (pct: number) => (pct >= 88 ? '●' : pct >= 63 ? '◕' : pct >= 38 ? '◑' : pct >= 13 ? '◔' : '○')

// Two hops: up, down, up, down.
function hop($: any, mood: Mood) {
  void $.state.set(MOOD, { ...mood, up: true })
  $.clock.after(180, () => void $.state.set(MOOD, { ...mood, up: false }))
  $.clock.after(360, () => void $.state.set(MOOD, { ...mood, up: true }))
  $.clock.after(540, () => void $.state.set(MOOD, { ...mood, up: false }))
}

// update() writes only if nothing changed since the read, else re-reads and
// retries, so agents started or finishing at the same moment all land.
async function editAgents($: Parameters<typeof update>[0], fn: (list: Agent[]) => Agent[]) {
  await update($, AGENTS, list => fn((list ?? []) as Agent[]))
}

// Backstop for missed events (a hot reload, a cleared list): add any agent the
// engine knows about but the pane doesn't, and mark ones the engine says ended.
export async function syncAgents($: any) {
  const live = (await $.agent.list()) as AgentInfo[]
  const ended = (s: AgentInfo['status']): Agent['state'] | undefined => (s === 'completed' ? 'done' : s === 'failed' || s === 'killed' ? 'failed' : undefined)
  const { value: have = [] as Agent[] } = await $.state.get(AGENTS)
  const stale = live.some(l => {
    const a = have.find((x: Agent) => x.id === l.id)
    return !a || (a.state === 'running' && ended(l.status))
  })
  if (!stale) return
  const now = await $.clock.now()
  await editAgents($, list => {
    const next: Agent[] = list.map(a => {
      const l = live.find(x => x.id === a.id)
      const s = l && a.state === 'running' ? ended(l.status) : undefined
      return s ? { ...a, state: s, ms: now - a.startedAt } : a
    })
    for (const l of live) {
      if (next.some(a => a.id === l.id)) continue
      next.push({ id: l.id, title: l.description, type: l.type, model: '', tools: 0, tokens: 0, startedAt: now, ms: 0, state: ended(l.status) ?? 'running' })
    }
    return next
  })
}

// One store key per session id ("s:<id>"), so a resumed session updates its own row.
async function sum($: any): Promise<Totals> {
  const key = `s:${await $.session.id()}`
  const all = { ...ZERO }
  let cur = { ...ZERO }
  let sessions = 0
  for (const k of await $.store.keys()) {
    if (!k.startsWith('s:')) continue
    const r = { ...ZERO, ...((await $.store.get(k)) as Partial<Rec>) }
    if (k === key) cur = r
    all.tokIn += r.tokIn; all.tokOut += r.tokOut
    sessions += 1
  }
  return { cur, all, sessions }
}

async function addTokens($: any, input: number, output: number) {
  const key = `s:${await $.session.id()}`
  const rec = { ...ZERO, ...((await $.store.get(key)) as Partial<Rec> | undefined) }
  await $.store.set(key, { tokIn: rec.tokIn + input, tokOut: rec.tokOut + output })
}

async function saveLimits($: any, raw: { kind: string; percentUsed: number; resetsAt?: string }[]) {
  if (raw.length === 0) return
  const now = await $.clock.now()
  const r: Reading = {
    asOf: now,
    limits: raw
      .map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsIn: until(l.resetsAt, now) }))
      .sort((a, b) => (a.kind === 'seven_day' ? -1 : b.kind === 'seven_day' ? 1 : 0)),
  }
  await $.state.set(READING, r)
  await $.store.set('limits', r)
}

const home = async ($: any) => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

// One toast the first time context crosses 85%, so compaction never surprises.
async function saveContext($: any, percent: number | undefined) {
  if (percent === undefined) return
  const { value: before = 0 } = await $.state.get(CONTEXT)
  await $.state.set(CONTEXT, percent)
  if (before < 85 && percent >= 85) $.ui.toast(`Context is ${percent}% full. Claude will compress older messages soon to keep chatting.`)
}

// Connectors the claude.ai account has connected, as ~/.claude.json records them.
async function loadConnectors($: any) {
  let names: string[] = []
  try { names = JSON.parse(await $.fs.read(`${await home($)}/.claude.json`)).claudeAiMcpEverConnected ?? [] } catch {}
  const rows = names.map(n => n.replace(/^claude\.ai /, '')).sort((a, b) => a.localeCompare(b))
    .map(name => ({ name, description: CONNECTOR_NOTES[name] ?? 'Connected through claude.ai.', enabled: true }))
  await $.state.set(CONNECTORS, rows)
}

// Prose files only: code can legitimately hold an em dash.
const PROSE = /\.(md|markdown|txt|html?|csv)$/i
export const emDashIn = (args: Record<string, unknown>) => {
  const path = String(args.file_path ?? args.notebook_path ?? '')
  if (path.includes('—')) return 'the file name'
  if (!PROSE.test(path)) return undefined
  const edits = Array.isArray(args.edits) ? (args.edits as Record<string, unknown>[]) : [args]
  return edits.some(x => String(x.content ?? x.new_string ?? x.new_source ?? '').includes('—')) ? 'the text' : undefined
}

// Installed plugins from ~/.claude/plugins, each with its manifest's one-liner.
async function loadPlugins($: any) {
  const dir = `${await home($)}/.claude`
  const json = async (path: string) => { try { return JSON.parse(await $.fs.read(path)) } catch { return undefined } }
  const installed = await json(`${dir}/plugins/installed_plugins.json`)
  const enabled = (await json(`${dir}/settings.json`))?.enabledPlugins ?? {}
  const list: PluginRow[] = []
  for (const [id, copies] of Object.entries(installed?.plugins ?? {}) as [string, { installPath: string }[]][]) {
    const manifest = await json(`${copies[0]?.installPath}/.claude-plugin/plugin.json`)
    list.push({ name: id.split('@')[0] ?? id, description: oneLine(manifest?.description ?? ''), enabled: enabled[id] === true })
  }
  await $.state.set(PLUGINS, list.sort((a, b) => a.name.localeCompare(b.name)))
}

export const oneLine = (text: string) => {
  const first = text.split(/(?<=\.)\s|\n/)[0]?.trim() ?? ''
  return first.length > 80 ? `${first.slice(0, 79)}…` : first
}

export const register: Register = (on, options) => {
  let placed = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'usage-meter', description: 'Show the session pane (limits, tokens, agents)' })
    await $.state.set(TOTALS, await sum($))
    const saved = (await $.store.get('limits')) as Reading | undefined
    if (saved) await $.state.set(READING, saved)
    const usage = await $.session.usage()
    await saveContext($, usage.context.percent)
    await saveLimits($, usage.rateLimits)
    await $.state.set(MOOD, { face: 'idle', up: false, note: 'Ready when you are' })
    await loadPlugins($)
    await loadConnectors($)
    // One tick a second redraws the band and the running agents' sweep.
    $.clock.every(1000, () => void $.clock.now().then(t => $.state.set(NOW, t)))
    $.clock.every(3000, () => void syncAgents($).catch(() => {}))
    void syncAgents($).catch(() => {})
    // An open the plugin makes on its own is drawn only on a wide enough
    // window; if it waits, the first prompt below opens it as asked.
    void $.ui.open({ id: PANE, title: 'Session' }).then(r => { placed = r.isPlaced })
    return next(e)
  })

  // An open made while handling a prompt the person entered counts as asked,
  // so it's drawn at any width. Once placed it's never reopened, so closing
  // the pane by hand keeps it closed for the session.
  on('prompt.submit', async ($, e, next) => {
    await $.state.set(PCT, 5)
    await $.state.set(STEP, 'Reading your request')
    if (!e.text.startsWith('/')) {
      // Claude itself is a row too, kept across requests so its earlier work stays visible.
      const startedAt = await $.clock.now()
      const model = modelName(await $.session.model())
      await editAgents($, list => list.some(a => a.id === MAIN)
        ? list.map(a => (a.id === MAIN ? { ...a, model, startedAt, state: 'running' as const } : a))
        : [{ id: MAIN, title: 'Claude', type: 'main session', model, tools: 0, tokens: 0, startedAt, ms: 0, state: 'running' as const }, ...list])
    }
    if (!placed) placed = (await $.ui.open({ id: PANE, title: 'Session' })).isPlaced
    const { value: helpers = 1 } = await $.state.get(HELPERS)
    if (helpers > 1 && !e.text.startsWith('/')) {
      return next({ ...e, text: `${e.text}

(Split this task across ${helpers} parallel subagents with the Agent tool, one independent piece each, then combine their results.)` })
    }
    return next(e)
  })

  on('command.run', { command: 'usage-meter' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Session', focus: true })
    placed = true
    return { text: 'Session pane opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    // Backstop for ~/.claude/CLAUDE.md model routing: search-only agents with no model named run on Haiku.
    const r = await next(e.subagentType === 'Explore' && !e.model && !e.isFork ? { ...e, model: 'haiku' } : e)
    const id = r.agentId
    if (id) {
      const startedAt = await $.clock.now()
      await editAgents($, list => [
        ...list,
        { id, title: e.description, type: e.subagentType, model: modelName(r.model), tools: 0, tokens: 0, startedAt, ms: 0, state: 'running' },
      ])
    }
    return r
  })

  // Opt-in (userConfig blockEmDashes): refuse em dashes in prose files and have Claude rewrite.
  if (options.blockEmDashes === true) {
    on('tool.call', { tool: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'] }, async ($, e, next) => {
      const where = emDashIn(e as unknown as Record<string, unknown>)
      if (where) return { deny: `Em dash found in ${where}. This project doesn't use em dashes. Rewrite with a comma, period, colon or parentheses and try again.` }
      return next(e)
    })
  }

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    const stage = STAGES[e.tool]
    if (!id && stage) {
      const { value: p = 0 } = await $.state.get(PCT)
      await $.state.set(PCT, Math.max(p, stage[0]))
      await $.state.set(STEP, stage[1])
    }
    {
      const rowId = id ?? MAIN
      const call: Call = { tool: e.tool, detail: callDetail(e as unknown as Record<string, unknown>) }
      await editAgents($, list =>
        list.map(a => (a.id === rowId ? { ...a, tools: a.tools + 1, calls: [...(a.calls ?? []), call].slice(-MAX_CALLS) } : a)),
      )
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) {
      await $.state.set(PCT, 100)
      await $.state.set(STEP, 'Done')
      const end = await $.clock.now()
      await editAgents($, list => list.map(a => (a.id === MAIN && a.state === 'running' ? { ...a, state: 'done' as const, ms: end - a.startedAt } : a)))
    }
    const u = e.usage
    if (u) {
      await addTokens($, u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens, u.output_tokens)
      await $.state.set(TOTALS, await sum($))
    }
    const usage = await $.session.usage()
    await saveLimits($, usage.rateLimits)
    await saveContext($, usage.context.percent)
    const id = e.agentId
    if (id) {
      const used = u ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens : 0
      const state = e.reason === 'answer' ? 'done' : 'failed'
      await editAgents($, list => list.map(a => (a.id === id ? { ...a, tokens: a.tokens + used, ms: e.durationMs, state } : a)))
    } else {
      // Only the main loop moves the big mascot.
      const mood = moodFor(e.reason, e.durationMs)
      if (mood.face === 'happy') hop($, mood)
      else await $.state.set(MOOD, mood)
    }
    return r
  })

  on('session.measure', async ($, e, next) => {
    await saveLimits($, e.rateLimits)
    await saveContext($, e.context.percent)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) await $.state.set(EFFORT, e.effort === undefined ? '' : String(e.effort))
    return yield* next(e)
  })

  // The band above the prompt: model, effort, folder; plus progress while working.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Select } = $.ui.resolve(e)
    const { value: agents = [] } = await $.state.get(AGENTS)
    await $.state.get(NOW) // ticks every second, so the band redraws
    const { value: effort = '' } = await $.state.get(EFFORT)
    const model = modelName(await $.session.model())
    const where = splitPath(await $.session.cwd(), await home($))
    const done = agents.filter(a => a.state !== 'running').length
    const busy = e.props.isWorking || done < agents.length
    const frac = agents.length ? done / agents.length : 0
    const width = Math.max(8, Math.min(24, e.props.bodyColumns - 40))
    const { value: pct = 0 } = await $.state.get(PCT)
    const { value: step = '' } = await $.state.get(STEP)
    const choose = (command: string) => async (args: string) => {
      if (command === 'effort') await $.state.set(EFFORT, args)
      try {
        const r = await $.command.run({ command, args })
        $.ui.toast(r.text || `/${command} ${args}`)
      } catch (err) {
        $.ui.toast(`Couldn't run /${command} ${args}: ${String(err)}`)
      }
    }
    const modelId = await $.session.model()
    const models = MODELS.includes(modelId) ? MODELS : [modelId, ...MODELS]
    const steady = !busy && agents.length === 0
    const { value: helpers = 1 } = await $.state.get(HELPERS)

    return (
      <Box flexDirection="column">
        <Box gap={2}>
          <Select key="model" label="Model:" value={modelId} options={models.map(id => ({ value: id, label: modelName(id) }))} onSelect={choose('model')} />
          <Select key="effort" label="Effort:" value={effort || 'default'} options={[...(effort ? [] : [{ value: 'default', label: 'default' }]), ...EFFORTS.map(x => ({ value: x }))]} onSelect={choose('effort')} />
          <Select key="helpers" label="Agents:" value={String(helpers)} options={[{ value: '1', label: 'just Claude' }, ...['2', '3', '4', '5', '6'].map(value => ({ value }))]} onSelect={v => void $.state.set(HELPERS, Number(v))} />
          <Text color="suggestion" bold wrap="truncate-start">📁 {where.parent}{where.name}</Text>
        </Box>
        {steady ? (
          <Text dimColor>Idle</Text>
        ) : (
          <Box gap={2}>
            <Text bold color={busy ? 'text' : 'success'}>{busy ? 'Working' : 'Done'}</Text>
            {(() => { const p = barParts(busy && agents.length === 0 ? pct / 100 : frac, width); return <Text><Text color="success">{p.fill}</Text><Text dimColor>{p.track}</Text></Text> })()}
            <Text bold>{agents.length > 0 ? `${Math.round(frac * 100)}%` : `${pct}%`}</Text>
            <Text>{agents.length > 0 ? `${done}/${agents.length} agents` : step}</Text>
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const { value: open = [] } = await $.state.get(OPEN)
    const { value: ctx } = await $.state.get(CONTEXT)
    const { value: mood } = await $.state.get(MOOD)
    const { value: r } = await $.state.get(READING)
    const { value: t } = await $.state.get(TOTALS)
    const { value: agents = [] } = await $.state.get(AGENTS)
    const { value: now = 0 } = await $.state.get(NOW)
    const m = mood ?? { face: 'idle', up: false, note: '' }
    const cols = e.props.bodyColumns
    const art = ART[m.face === 'sad' ? 'sad' : 'happy']
    const weekly = r?.limits.find(l => l.kind === 'seven_day')
    const fiveHour = r?.limits.find(l => l.kind === 'five_hour')

    const flip = (id: string) => () =>
      void update($, OPEN, ids => (ids ?? []).includes(id) ? (ids ?? []).filter(x => x !== id) : [...(ids ?? []), id])
    const row = (a: Agent, i: number) => {
      const hue = HUES[i % HUES.length] ?? 'claude'
      const running = a.state === 'running'
      const ms = running ? now - a.startedAt : a.ms
      const width = Math.max(8, cols - 9)
      const isOpen = open.includes(a.id)
      const calls = a.calls ?? []
      return (
        <Box key={a.id} gap={1} paddingBottom={1}>
          {/* Never squeezed: a narrowed column wraps the art's lines and garbles it. */}
          <Box flexDirection="column" flexShrink={0}>
            {Svg
              ? <Svg source={crabSvg(HUE_HEX[hue], { dim: a.state === 'failed' })} alt={`${a.title}, ${a.state}`} width={26} height={19} />
              : MINI.map(line => <Text color={hue} dimColor={a.state === 'failed'}>{line}</Text>)}
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            <Box justifyContent="space-between">
              <Text bold wrap="truncate-end">{a.title}</Text>
              <Text color={a.state === 'done' ? 'success' : a.state === 'failed' ? 'error' : 'warning'}>
                {a.state === 'done' ? '✓' : a.state === 'failed' ? '✗' : '…'}
              </Text>
            </Box>
            <Text wrap="truncate-end"><Text color={hue}>{a.type}</Text><Text dimColor> {a.model}</Text></Text>
            <Box justifyContent="space-between">
              <Button key={`calls-${a.id}`} plain dimColor onPress={flip(a.id)}>
                {`${isOpen ? '▾' : '▸'} ${a.tools} tool ${a.tools === 1 ? 'call' : 'calls'}`}
              </Button>
              <Text dimColor>{a.tokens ? `${fmtTok(a.tokens)} tokens, ` : ''}{clock(ms)}</Text>
            </Box>
            {isOpen && (
              <Box flexDirection="column" paddingLeft={2}>
                {calls.length === 0
                  ? <Text dimColor>Not recorded for this agent.</Text>
                  : calls.map(c => (
                      <Text wrap="truncate-end"><Text color={hue}>{c.tool}</Text><Text dimColor>{c.detail ? ` ${c.detail}` : ''}</Text></Text>
                    ))}
                {calls.length > 0 && a.tools > calls.length && <Text dimColor>Last {calls.length} of {a.tools}</Text>}
              </Box>
            )}
            {/* Desktop draws block glyphs wider than a column, so cut at the edge rather than wrap. */}
            <Text color={hue} wrap="truncate-end">{running ? sweep(Math.floor(now / 1000), width) : '█'.repeat(width)}</Text>
          </Box>
        </Box>
      )
    }
    const { value: plugins = [] } = await $.state.get(PLUGINS)
    const { value: connectors = [] } = await $.state.get(CONNECTORS)
    const fill = ctx ?? 0
    // One scale for every meter, always read as "used": calm teal under 70, amber 70 to 84, red 85 and up.
    const tone = (pct: number) => (pct >= 85 ? { key: 'error', hex: '#e5484d' } : pct >= 70 ? { key: 'warning', hex: '#e5a00d' } : { key: 'planMode', hex: '#3fb8af' })
    const ctxTone = tone(fill)
    const barWidth = Math.max(8, Math.min(20, cols - 30))
    const limitRow = (key: string, label: string, l: { percentUsed: number; resetsIn?: string } | undefined) => {
      const p = barParts((l?.percentUsed ?? 0) / 100, barWidth)
      return (
      <Box key={key} gap={2}>
        <Box width={13} flexShrink={0}><Text>{label}</Text></Box>
        <Text><Text color={l ? tone(l.percentUsed).key : undefined}>{p.fill}</Text><Text dimColor>{p.track}</Text></Text>
        <Box width={9} flexShrink={0}>{l ? <Text><Text bold>{Math.round(l.percentUsed)}%</Text><Text dimColor> used</Text></Text> : <Text dimColor>—</Text>}</Box>
        {l?.resetsIn && <Text dimColor wrap="truncate-end">resets in {l.resetsIn}</Text>}
      </Box>
      )
    }
    const enabled = plugins.filter(pl => pl.enabled)
    const off = plugins.filter(pl => !pl.enabled)
    const itemRow = (kind: string) => (pl: PluginRow) => {
      const id = `${kind}-${pl.name}`
      const isOpen = open.includes(id)
      return (
        <Box key={id} flexDirection="column" paddingLeft={2}>
          <Button key={id} plain onPress={flip(id)}>{`${isOpen ? '▾' : '▸'} ${pl.name}`}</Button>
          {isOpen && <Box paddingLeft={2}><Text dimColor wrap="wrap">{pl.description || 'No description given.'}</Text></Box>}
        </Box>
      )
    }
    const section = (kind: string, title: string, rows: PluginRow[], empty: string, extra?: unknown) => {
      const id = `sec-${kind}`
      const isOpen = open.includes(id)
      return (
        <Box flexDirection="column">
          <Button key={id} plain onPress={flip(id)}>{`${isOpen ? '▾' : '▸'} ${title} (${rows.length})`}</Button>
          {isOpen && rows.length === 0 && <Box paddingLeft={2}><Text dimColor>{empty}</Text></Box>}
          {isOpen && rows.map(itemRow(kind))}
          {isOpen && extra}
        </Box>
      )
    }

    const running = agents.filter(a => a.state === 'running')
    const finished = agents.filter(a => a.state !== 'running')
    // Each zone sits on its own tinted block, so resources, agents and setup read as separate panels.
    const zone = { flexDirection: 'column', gap: 1, backgroundColor: PANEL_BG, paddingX: 1, paddingY: 1 } as const

    return (
      <Box flexDirection="column" gap={2}>
        <Box {...zone}>
          <Text bold>Usage</Text>
        <Box gap={2} alignItems="center">
          {Svg
            ? <Svg source={ringSvg(fill, 64, ctxTone.hex)} alt={`${fill}% of conversation memory used`} width={64} height={64} />
            : <Text color={ctxTone.key}>{ringGlyph(fill)}</Text>}
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color={ctxTone.key}>{ctx === undefined ? 'Memory not measured yet' : `${fill}% memory used`}</Text>
            <Text dimColor wrap="wrap">
              {fill >= 85
                ? 'Almost full. Claude will soon compress older messages into a summary so you can keep chatting.'
                : fill >= 70
                  ? 'Filling up. When it runs out, Claude compresses older messages and carries on.'
                  : 'When it runs out, Claude compresses older messages and carries on.'}
            </Text>
          </Box>
        </Box>
        <Box flexDirection="column">
          {limitRow('5h', '5-hour limit', fiveHour)}
          {limitRow('7d', '7-day limit', weekly)}
        </Box>
        <Text>
          <Text bold>{t ? fmtTok(t.cur.tokIn + t.cur.tokOut) : '0'}</Text>
          <Text dimColor> tokens this session, {t ? fmtTok(t.all.tokIn + t.all.tokOut) : '0'} all time</Text>
        </Text>
        </Box>
        <Box {...zone}>
          <Text bold>Agents</Text>
          <Box flexDirection="column">
          {agents.length === 0 && <Text dimColor>Agents appear here while they work on a task.</Text>}
          {running.length > 0 && <Text color="warning">Running {running.length}</Text>}
          {running.map(a => row(a, agents.indexOf(a)))}
          {finished.length > 0 && <Text dimColor>Finished {finished.length}</Text>}
          {finished.map(a => row(a, agents.indexOf(a)))}
          </Box>
        </Box>
        <Box {...zone}>
          <Text bold>Setup</Text>
        {section('plugin', 'Plugins', enabled, 'No plugins turned on.', off.length > 0 && <Box paddingLeft={2}><Text dimColor wrap="wrap">Installed but off: {off.map(pl => pl.name).join(', ')}</Text></Box>)}
        {section('connector', 'Connectors', connectors, 'No connectors found on your claude.ai account.')}
        </Box>
        <Box flexDirection="column" alignItems="center">
          {!m.up && <Text> </Text>}
          {Svg
            ? <Svg source={crabSvg(HUE_HEX.claude, { sad: m.face === 'sad', dim: m.face === 'sad', width: 48 })} alt={m.face === 'sad' ? 'Claude, sad' : 'Claude'} width={48} height={35} />
            : art.map(line => <Text color="claude" dimColor={m.face === 'sad'}>{line}</Text>)}
          {m.up && <Text> </Text>}
          <Text color={m.face === 'sad' ? 'error' : undefined} dimColor>{m.note}</Text>
        </Box>
      </Box>
    )
  })
}
