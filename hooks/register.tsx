import { update } from 'claude-code'
import type { AgentInfo, Register } from 'claude-code'

import type { Agent, Call, Msg, Mood, PluginRow, Reading, Rec, Totals, Used } from '../types'

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
const READY: Mood = { face: 'idle', up: false, note: 'Ready when you are' }
const USED = { plugin: 'usage-meter', key: 'used' } as const
const FRAME = { plugin: 'usage-meter', key: 'frame' } as const
const BLINK = { plugin: 'usage-meter', key: 'blink' } as const
const TALK = { plugin: 'usage-meter', key: 'talk' } as const
const LIMIT_NAMES: Record<string, string> = { five_hour: '5-hour limit', seven_day: '7-day limit' }
const SKILL_NOTES = { plugin: 'usage-meter', key: 'skillNotes' } as const
const NO_USE: Used = { plugins: [], connectors: [], skills: [] }
// claude.ai connectors reach the session as tools named by ID, so this maps each ID to its name.
// Add your own connector IDs here to show their names; an unlisted one shows as "Connector <id>".
const CONNECTOR_IDS: Record<string, string> = {}
// The app's own tools, not connectors a person turned on.
const APP_SERVERS = /^(ccd_|Claude_Browser$|terminal$|visualize$|mcp-registry$|scheduled-tasks$|plugin-authoring$)/
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
const CHAT = { plugin: 'usage-meter', key: 'chat' } as const
const MAX_CHAT = 60
const AGENT_TOP = { plugin: 'usage-meter', key: 'agentTop' } as const
const CHAT_BACK = { plugin: 'usage-meter', key: 'chatBack' } as const
const CHAT_RAW = { plugin: 'usage-meter', key: 'chatRaw' } as const
const MAX_RAW = 4000
const AGENT_ROWS = 4
const CHAT_ROWS = 5

// The slice of a list a fixed-size window shows, clamped so it never runs past either end.
export const windowOf = <T,>(list: T[], start: number, size: number) => {
  const top = Math.max(0, Math.min(start, list.length - size))
  return { top, rows: list.slice(top, top + size) }
}

// Row id for Claude's own work in the main session.
const MAIN = 'main'

// Chat lines read like people talking: no file paths or names, citation tags or markdown,
// and only the first sentence or two.
export const plainChat = (raw: string) => {
  const t = raw
    .replace(/["'`][^"'`]*\.(md|html|pdf|png|py|docx|tsx|ts|json|mp4|txt)["'`]/gi, '')
    .replace(/[A-Za-z]:\\[^"'`]*?\.(md|html|pdf|png|py|docx|tsx|ts|json|mp4|txt)\b/gi, '')
    .replace(/[A-Za-z]:\\\S*/g, '')
    .replace(/\S+\.(md|html|pdf|png|py|docx|tsx|ts|json|mp4|txt)\b/gi, '')
    .replace(/\[\d+(?:[,\s\]\[-]*\d+)*\]/g, '')
    .replace(/[*_`#>]+/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  const sentences = t.match(/[^.!?]+[.!?]+/g) ?? [t]
  let out = ''
  for (const x of sentences) {
    if (out && (out + x).length > 180) break
    out += x
  }
  out = out.trim() || t
  return out.length > 200 ? `${out.slice(0, 199)}…` : out
}

// The agent an address names (Claude for main), and the color its Agents row is drawn in,
// so a speaker in the chat matches its row above.
export const agentIdFor = (addr: string | undefined, agents: Agent[]) =>
  !addr || addr === MAIN || addr === 'main' ? MAIN : agents.find(a => a.id === addr || addr.startsWith(a.id))?.id
export const hueFor = (id: string | undefined, agents: Agent[]) => {
  const i = agents.findIndex(a => a.id === id)
  return i >= 0 ? HUES[i % HUES.length] ?? 'claude' : 'claude'
}

// A chat line's speaker: the id it recorded, or for older lines the agent whose
// current "Agent N" label matches the name shown.
export const speaker = (id: string | undefined, name: string, agents: Agent[]) =>
  id ?? (name === 'Claude' ? MAIN : agents.find(a => a.id !== MAIN && who(a.id, agents) === name)?.id)

// Chat names: Claude for the main session, "Agent N" for agents in the order they started.
export const who = (id: string | undefined, agents: Agent[]) => {
  if (!id || id === MAIN || id === 'main') return 'Claude'
  // Number within the current request's agents, so each new team starts at Agent 1.
  const since = agents.find(a => a.id === MAIN)?.startedAt ?? 0
  const all = agents.filter(a => a.id !== MAIN)
  const now = all.filter(a => a.startedAt >= since)
  const match = (list: Agent[]) => list.findIndex(a => a.id === id || id.startsWith(a.id))
  const i = match(now) >= 0 ? match(now) : match(all)
  return i >= 0 ? `Agent ${i + 1}` : 'Agent ?'
}

// The one argument that says what a call did: a file name, a command, a pattern, a URL.
export const callDetail = (e: Record<string, unknown>): string | undefined => {
  for (const k of ['file_path', 'notebook_path', 'description', 'command', 'pattern', 'url', 'query', 'path', 'prompt']) {
    const v = e[k]
    if (typeof v !== 'string' || !v.trim()) continue
    const s = k.endsWith('_path') ? (v.split(/[\\/]/).pop() ?? v) : v.replace(/\s+/g, ' ').trim()
    return s.length > 60 ? `${s.slice(0, 59)}…` : s
  }
  return undefined
}
const VERBS: Record<string, string> = {
  Read: 'Reading', Write: 'Writing', Edit: 'Editing', MultiEdit: 'Editing', NotebookEdit: 'Editing',
  Grep: 'Searching for', Glob: 'Finding', WebSearch: 'Searching the web for', WebFetch: 'Reading',
  Bash: 'Running', PowerShell: 'Running', Skill: 'Using', Agent: 'Starting', SendMessage: 'Messaging',
}
export const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)
// A tool call as a person would say it. Commands stay out of it: Claude's own description of
// the command when it gave one, otherwise a plain phrase.
export const doing = (c: Call | undefined, max = 40) => {
  if (!c) return 'Getting started'
  if (c.tool === 'Bash' || c.tool === 'PowerShell') return short(c.label ? c.label[0]!.toUpperCase() + c.label.slice(1) : 'Running a command', max)
  const mcp = /^mcp__.+?__(.+)$/.exec(c.tool)?.[1]
  const verb = VERBS[c.tool] ?? (mcp ? `Using ${mcp.replace(/[_-]+/g, ' ')}` : c.tool)
  return short(c.detail && !mcp ? `${verb} ${c.detail}` : verb, max)
}
// The step an agent is on, then the two before it, newest first.
export const stepLines = (calls: Call[], max = 40) => ({ now: doing(calls[calls.length - 1], max), before: calls.slice(-3, -1).reverse().map(c => doing(c, max)) })

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
// Kept to the same plain markup as barSvg (bare <rect>s, 0-origin viewBox, no
// <g>/class/<style>): the desktop drew nothing for a richer version.
// Animation is whole redraws, one frame at a time, for the same reason.
export const crabSvg = (color: string, o: { sad?: boolean; dim?: boolean; width?: number; frame?: number; blink?: boolean } = {}) => {
  const w = o.width ?? 26
  const dim = o.dim ? 0.45 : 1
  const r = (x: number, y: number, rw: number, rh: number, c = color, alpha = 1) =>
    `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${c}"${alpha * dim < 1 ? ` fill-opacity="${alpha * dim}"` : ''}/>`
  const walking = o.frame !== undefined
  const step = (o.frame ?? 0) % 2
  const bob = walking ? step * 2 : 0
  const arm = 12 + bob + (walking ? (step ? -2 : 2) : 0)
  const eye = (o.sad ? 13 : 11) + bob
  const eyeAt = (x: number) => o.blink
    ? r(x - 1, eye + 3, 6, 2, '#1F1E1D')
    : r(x, eye, 4, 6, '#1F1E1D') + r(x + 1, eye + 1, 2, 2, '#ffffff')
  // Feet stay planted while the body bobs; the two pairs take turns lifting.
  const leg = (x: number, lifted: boolean) => r(x, 28 + bob, 4, 8 - bob - (walking && lifted ? 2 : 0))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round((w * 19) / 26)}" viewBox="0 0 52 38">`
    + leg(10, step === 0) + leg(18, step === 1) + leg(30, step === 0) + leg(38, step === 1)
    + r(2, arm, 8, 8) + r(42, arm, 8, 8) + r(2, arm, 8, 2, '#ffffff', 0.2) + r(42, arm, 8, 2, '#ffffff', 0.2)
    + r(12, 2 + bob, 28, 2) + r(10, 4 + bob, 32, 22) + r(12, 26 + bob, 28, 2)
    + r(12, 4 + bob, 28, 3, '#ffffff', 0.22) + r(12, 23 + bob, 28, 5, '#000000', 0.14)
    + r(12, 19 + bob, 4, 2, '#ff9e9e', 0.7) + r(36, 19 + bob, 4, 2, '#ff9e9e', 0.7)
    + eyeAt(17) + eyeAt(31)
    + (o.sad ? r(23, 21 + bob, 6, 2, '#1F1E1D') : r(24, 19 + bob, 4, 2, '#1F1E1D'))
    + '</svg>'
}

// One bar look everywhere: a rounded track with a solid fill from `from` to `to` (0 to 1).
export const barSvg = (width: number, color: string, to: number, from = 0, height = 6) => {
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const x = clamp(from) * width, w = Math.max(0, (clamp(to) - clamp(from)) * width)
  const rect = (rx: number, rw: number, fill: string, extra = '') => `<rect x="${rx.toFixed(1)}" y="0" width="${rw.toFixed(1)}" height="${height}" rx="3" fill="${fill}"${extra}/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + rect(0, width, '#8a8f98', ' fill-opacity="0.2"') + (w > 0 ? rect(x, w, color) : '') + '</svg>'
}
// Bars take a pixel width, so columns convert at about one body character.
const PX_PER_COL = 8
// Where a block of a running bar sits this second: it slides across and off the end.
export const sweepSpan = (tick: number) => {
  const at = ((tick % 12) / 12) * 1.2 - 0.2
  return { from: Math.max(0, at), to: Math.min(1, at + 0.2) }
}
// Under 70 stays neutral, because a bar this full shouldn't read as safe.
export const toneFor = (pct: number) => (pct >= 90 ? { key: 'error', hex: '#ef4444' } : pct >= 70 ? { key: 'warning', hex: '#f59e0b' } : { key: 'subtle', hex: '#8b9bb4' })

// Two hops: up, down, up, down.
function hop($: any, mood: Mood) {
  void $.state.set(MOOD, { ...mood, up: true })
  $.clock.after(180, () => void $.state.set(MOOD, { ...mood, up: false }))
  $.clock.after(360, () => void $.state.set(MOOD, { ...mood, up: true }))
  $.clock.after(540, () => void $.state.set(MOOD, { ...mood, up: false }))
  // The win shows for a moment, then back to the greeting.
  $.clock.after(8000, () => void $.state.set(MOOD, READY))
}

// update() writes only if nothing changed since the read, else re-reads and
// retries, so agents started or finishing at the same moment all land.
async function editAgents($: Parameters<typeof update>[0], fn: (list: Agent[]) => Agent[]) {
  await update($, AGENTS, list => fn((list ?? []) as Agent[]))
}

// One line in Agent chat: the short plain version, plus the message as written for Full messages.
async function say($: any, from: string | undefined, to: string | undefined, message: string) {
  const raw = message.trim()
  if (!raw) return
  const { value: agents = [] as Agent[] } = await $.state.get(AGENTS)
  const msg: Msg = { from: who(from, agents), to: who(to, agents), text: plainChat(raw), raw: raw.length > MAX_RAW ? `${raw.slice(0, MAX_RAW)}…` : raw, at: await $.clock.now(), fromId: agentIdFor(from, agents), toId: agentIdFor(to, agents) }
  await update($, CHAT, list => [...((list ?? []) as Msg[]), msg].slice(-MAX_CHAT))
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

// The highest alert line a reading has crossed, and whether that's news. A lower level
// means the window reset, so the next climb alerts again.
export const alertFor = (pct: number, last: number) => {
  const level = pct >= 95 ? 95 : pct >= 80 ? 80 : 0
  return { level, fire: level > last }
}
async function alertLimit($: any, l: Reading['limits'][number]) {
  const key = `alert:${l.kind}`
  const last = Number((await $.store.get(key)) ?? 0)
  const { level, fire } = alertFor(l.percentUsed, last)
  if (level !== last) await $.store.set(key, level)
  if (!fire) return
  const text = `${LIMIT_NAMES[l.kind] ?? l.kind} is at ${Math.round(l.percentUsed)}%${l.resetsIn ? `, resets in ${l.resetsIn}` : ''}.`
  $.ui.toast(text, { timeoutMs: 10000 })
  await $.ui.notify(text, { title: 'Claude usage' }).catch(() => undefined)
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
  for (const l of r.limits) await alertLimit($, l)
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

// Added to every agent's brief while talk is on. Agents can't list their siblings, so it names
// the ones already running; those learn about later ones when the later ones write first.
export const talkNote = (siblings: { id: string; title: string }[]) => [
  'Other agents may be working on this same request. Talk to them with the SendMessage tool (load it with ToolSearch if needed): share findings they could use, ask when you need something from their piece, and flag overlap. Keep messages short, and read any you receive before you finish.',
  siblings.length ? `Running now: ${siblings.map(a => `${a.title} (id ${a.id})`).join('; ')}.` : 'No others are running yet. If one writes to you, reply to it.',
].join(' ')

// Model for an agent nobody picked one for, following ~/.claude/CLAUDE.md: Haiku gathers,
// Sonnet builds, Opus plans and writes what gets submitted. Only the general agent types are
// routed, since a custom agent's own definition already names its model.
// ponytail: keyword match on the task's short description; a miss lands on Sonnet. Name `model` in the Agent call to override.
const ROUTED = ['Explore', 'Plan', 'general-purpose', 'claude']
const OPUS_WORK = /\b(plan|planning|architect\w*|trade-?offs?|strategy|decide|memo|essay|cover letter|lcp|synthesi[sz]e|combine)\b/i
const BUILD_WORK = /\b(write|build|implement|fix|edit|create|refactor|debug|test|draft|make)\b/i
const HAIKU_WORK = /\b(find|locate|search|explore|list|look ?up|read|summari[sz]e|fetch|grep|scan|gather|collect|check)\b/i
export const routeModel = (type: string | undefined, description: string): 'haiku' | 'sonnet' | 'opus' | undefined => {
  if (type && !ROUTED.includes(type)) return undefined
  if (type === 'Explore') return 'haiku'
  if (type === 'Plan' || OPUS_WORK.test(description)) return 'opus'
  return HAIKU_WORK.test(description) && !BUILD_WORK.test(description) ? 'haiku' : 'sonnet'
}

const add = (list: string[], item: string) => (list.includes(item) ? list : [...list, item])

// Folds one tool call into what this session has used. A skill named plugin:skill counts
// for both. Plugin connectors arrive as mcp__plugin_<plugin>_<server>__<tool>.
export const noteUse = (u: Used, tool: string, skill?: string): Used => {
  if (tool === 'Skill' && skill) {
    const parts = skill.split(':')
    const plugin = parts.length > 1 ? parts[0] : undefined
    return { ...u, skills: add(u.skills, parts[parts.length - 1] ?? skill), plugins: plugin ? add(u.plugins, plugin) : u.plugins }
  }
  const server = /^mcp__(.+?)__/.exec(tool)?.[1]
  if (!server || APP_SERVERS.test(server)) return u
  const plugin = /^plugin_([^_]+)/.exec(server)?.[1]
  return plugin ? { ...u, plugins: add(u.plugins, plugin) } : { ...u, connectors: add(u.connectors, server) }
}
export const connectorName = (id: string) => CONNECTOR_IDS[id] ?? (/^[0-9a-f]{8}-/.test(id) ? `Connector ${id.slice(0, 8)}` : id)

// What the transcript already shows, so a reload or a resumed session keeps its history.
async function loadUsed($: any) {
  const messages = await $.session.messages()
  let u = NO_USE
  for (const m of messages) for (const t of m.toolUses ?? []) u = noteUse(u, t.name ?? t.tool ?? '', t.input?.skill)
  await update($, USED, old => {
    const was = old ?? NO_USE
    return { plugins: [...new Set([...was.plugins, ...u.plugins])], connectors: [...new Set([...was.connectors, ...u.connectors])], skills: [...new Set([...was.skills, ...u.skills])] }
  })
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
    await $.state.set(TALK, ((await $.store.get('talk')) as boolean | undefined) ?? true)
    await loadUsed($).catch(() => undefined) // history is a nicety; never let it stop startup
    await $.state.set(TOTALS, await sum($))
    const saved = (await $.store.get('limits')) as Reading | undefined
    if (saved) await $.state.set(READING, saved)
    const usage = await $.session.usage()
    await saveContext($, usage.context.percent)
    await saveLimits($, usage.rateLimits)
    await $.state.set(MOOD, READY)
    await loadPlugins($)
    await loadConnectors($)
    // One tick a second redraws the band and the running agents' sweep.
    $.clock.every(1000, () => void $.clock.now().then(t => $.state.set(NOW, t)))
    $.clock.every(300, () => void $.state.get(AGENTS).then(({ value = [] }) => {
      if (value.some(a => a.state === 'running')) void update($, FRAME, n => (n ?? 0) + 1)
    }))
    $.clock.every(5000, () => {
      void $.state.set(BLINK, true)
      $.clock.after(160, () => void $.state.set(BLINK, false))
    })
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
    const { value: talk = true } = await $.state.get(TALK)
    const { value: current = [] } = await $.state.get(AGENTS)
    const siblings = current.filter(a => a.id !== MAIN && a.state === 'running')
    const briefed = talk ? { ...e, prompt: `${e.prompt}\n\n${talkNote(siblings)}` } : e
    // A fork always runs on the session's model, and a model Claude named is kept.
    const model = e.model || e.isFork ? undefined : routeModel(e.subagentType, e.description ?? '')
    const r = await next(model ? { ...briefed, model } : briefed)
    const id = r.agentId
    if (id) {
      const startedAt = await $.clock.now()
      await editAgents($, list => [
        ...list,
        { id, title: e.description, type: e.subagentType, model: modelName(r.model), tools: 0, tokens: 0, startedAt, ms: 0, state: 'running' },
      ])
      // The brief is the first line of the conversation; the agent's answer is the last.
      await say($, e.agentId, id, e.prompt)
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

  on('skill.prompt', async ($, e, next) => {
    const name = e.skill.split(':').pop() ?? e.skill
    await update($, USED, u => noteUse(u ?? NO_USE, 'Skill', e.skill))
    const about = e.frontmatter.description
    if (typeof about === 'string') await update($, SKILL_NOTES, n => ({ ...n, [name]: oneLine(about) }))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    await update($, USED, u => noteUse(u ?? NO_USE, e.tool, (e as unknown as { skill?: string }).skill))
    const stage = STAGES[e.tool]
    if (!id && stage) {
      const { value: p = 0 } = await $.state.get(PCT)
      await $.state.set(PCT, Math.max(p, stage[0]))
      await $.state.set(STEP, stage[1])
    }
    if (e.tool === 'SendMessage') {
      const args = e as unknown as { to?: unknown; message?: unknown; summary?: unknown }
      await say($, id, String(args.to ?? ''), String(args.message ?? args.summary ?? ''))
    }
    {
      const rowId = id ?? MAIN
      const args = e as unknown as Record<string, unknown>
      const label = typeof args.description === 'string' ? args.description.trim() : ''
      const call: Call = { tool: e.tool, detail: callDetail(args), label: label || undefined }
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
      await say($, id, MAIN, e.answer ?? '')
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
    const { value: helpers = 1 } = await $.state.get(HELPERS)
    const { value: talk = true } = await $.state.get(TALK)

    return (
      <Box flexDirection="column">
        <Box gap={2}>
          <Select key="model" label="Model:" value={modelId} options={models.map(id => ({ value: id, label: modelName(id) }))} onSelect={choose('model')} />
          <Select key="effort" label="Effort:" value={effort || 'default'} options={[...(effort ? [] : [{ value: 'default', label: 'default' }]), ...EFFORTS.map(x => ({ value: x }))]} onSelect={choose('effort')} />
          <Select key="helpers" label="Agents:" value={String(helpers)} options={[{ value: '1', label: 'just Claude' }, ...['2', '3', '4', '5', '6'].map(value => ({ value }))]} onSelect={v => void $.state.set(HELPERS, Number(v))} />
          <Select key="talk" label="Agent talk:" value={talk ? 'on' : 'off'} options={[{ value: 'on' }, { value: 'off' }]} onSelect={v => { void $.state.set(TALK, v === 'on'); void $.store.set('talk', v === 'on') }} />
          <Text color="suggestion" bold wrap="truncate-start">📁 {where.parent}{where.name}</Text>
        </Box>
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
    const { value: chat = [] } = await $.state.get(CHAT)
    const { value: agentTop = 0 } = await $.state.get(AGENT_TOP)
    const { value: frame = 0 } = await $.state.get(FRAME)
    const { value: blink = false } = await $.state.get(BLINK)
    const { value: workPct } = await $.state.get(PCT)
    const { value: workStep = '' } = await $.state.get(STEP)
    const { value: chatBack = 0 } = await $.state.get(CHAT_BACK)
    const { value: chatRaw = false } = await $.state.get(CHAT_RAW)
    const m = mood ?? READY
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
      // Crab, border and padding take about 13 columns of the card.
      const width = Math.max(8, cols - 13)
      const isOpen = open.includes(a.id)
      const calls = a.calls ?? []
      const lines = stepLines(calls, Math.max(16, cols - 18))
      const spin = '◐◓◑◒'[Math.floor(now / 1000) % 4]
      const span = running ? sweepSpan(Math.floor(now / 1000)) : { from: 0, to: 1 }
      return (
        <Box key={a.id} gap={2} alignItems="center" borderStyle="round" borderColor={HUE_HEX[hue]} paddingX={1}>
          {/* Never squeezed: a narrowed column wraps the art's lines and garbles it. */}
          <Box flexDirection="column" flexShrink={0}>
            {Svg
              ? <Svg source={crabSvg(HUE_HEX[hue], { dim: a.state === 'failed', frame: running ? frame + i : undefined, blink: !running && blink })} alt={`${a.title}, ${a.state}`} width={34} height={25} />
              : MINI.map(line => <Text color={hue} dimColor={a.state === 'failed'}>{line}</Text>)}
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
            <Box justifyContent="space-between">
              <Text bold wrap="truncate-end"><Text color={hue}>{a.id === MAIN ? '' : `${who(a.id, agents)}  `}</Text>{a.title}</Text>
              <Text color={a.state === 'failed' ? 'error' : 'success'}>
                {a.state === 'done' ? '✓' : a.state === 'failed' ? '✗' : '●'}
              </Text>
            </Box>
            <Box justifyContent="space-between" gap={2}>
              <Text dimColor wrap="truncate-end">{a.type} · {a.model}</Text>
              <Box flexShrink={0}><Text dimColor>{a.tokens ? `${fmtTok(a.tokens)} tokens · ` : ''}{clock(ms)}</Text></Box>
            </Box>
            {running
              ? <Text color={hue} wrap="truncate-end">{`${spin} Step ${Math.max(1, a.tools)} · ${lines.now}`}</Text>
              : <Text color={a.state === 'failed' ? 'error' : 'success'}>{a.state === 'failed' ? `Failed at step ${a.tools}` : `All done · ${a.tools} ${a.tools === 1 ? 'step' : 'steps'}`}</Text>}
            {running && lines.before.map((line, i) => <Box key={`step-${a.id}-${i}`} paddingLeft={2}><Text dimColor wrap="truncate-end">{line}</Text></Box>)}
            <Button key={`calls-${a.id}`} plain dimColor onPress={flip(a.id)}>
              {`${isOpen ? '▾' : '▸'} ${a.tools} tool ${a.tools === 1 ? 'call' : 'calls'}`}
            </Button>
            {isOpen && (
              <Box flexDirection="column" paddingLeft={2}>
                {calls.length === 0
                  ? <Text dimColor>Not recorded for this agent.</Text>
                  : calls.map(c => (
                      <Text wrap="truncate-end"><Text color={hue}>{c.tool.replace(/^mcp__.+?__/, '')}</Text><Text dimColor>{(c.tool === 'Bash' || c.tool === 'PowerShell' ? c.label : c.detail) ? ` ${short((c.tool === 'Bash' || c.tool === 'PowerShell' ? c.label : c.detail) ?? '', Math.max(12, cols - 26))}` : ''}</Text></Text>
                    ))}
                {calls.length > 0 && a.tools > calls.length && <Text dimColor>Last {calls.length} of {a.tools}</Text>}
              </Box>
            )}
            {Svg
              ? <Svg source={barSvg(width * PX_PER_COL, HUE_HEX[hue], span.to, span.from, 4)} alt={running ? 'Working' : 'Finished'} width={width * PX_PER_COL} height={4} />
              : <Text color={hue} wrap="truncate-end">{running ? sweep(Math.floor(now / 1000), width) : '█'.repeat(width)}</Text>}
          </Box>
        </Box>
      )
    }
    const { value: plugins = [] } = await $.state.get(PLUGINS)
    const { value: connectors = [] } = await $.state.get(CONNECTORS)
    const { value: used = NO_USE } = await $.state.get(USED)
    const { value: skillNotes = {} } = await $.state.get(SKILL_NOTES)
    const fill = ctx ?? 0
    // One scale for every meter, always read as "used": calm teal under 70, amber 70 to 84, red 85 and up.
    const resetText = (l?: { resetsIn?: string }) => (l?.resetsIn ? `resets ${l.resetsIn}` : '')
    const resetCols = Math.max(resetText(fiveHour).length, resetText(weekly).length)
    // Label, percent and three gaps stay fixed. Too narrow for all of it, the reset drops below its bar.
    const room = cols - 13 - 5 - 6 - resetCols
    const stacked = room < 8
    const barWidth = Math.max(8, Math.min(20, stacked ? cols - 24 : room))
    const limitRow = (key: string, label: string, l: { percentUsed: number; resetsIn?: string } | undefined, extra?: unknown) => {
      const pct = l?.percentUsed ?? 0
      const t = toneFor(pct)
      const p = barParts(pct / 100, barWidth)
      return (
      <Box key={key} flexDirection="column">
        <Box gap={2} alignItems="center">
          <Box width={13} flexShrink={0}><Text>{label}</Text></Box>
          {Svg
            ? <Svg source={barSvg(barWidth * PX_PER_COL, l ? t.hex : '#8a8f98', pct / 100)} alt={l ? `${label}, ${Math.round(pct)}% used` : `${label}, not measured yet`} width={barWidth * PX_PER_COL} height={6} />
            : <Text><Text color={l ? t.key : undefined}>{p.fill}</Text><Text dimColor>{p.track}</Text></Text>}
          <Box width={5} flexShrink={0}>{l ? <Text bold>{Math.round(pct)}%</Text> : <Text dimColor>—</Text>}</Box>
          {!stacked && resetText(l) && <Box flexShrink={0}><Text dimColor>{resetText(l)}</Text></Box>}
          {extra}
        </Box>
        {stacked && resetText(l) && <Box paddingLeft={15}><Text dimColor>{resetText(l)}</Text></Box>}
      </Box>
      )
    }
    const enabled = plugins.filter(pl => pl.enabled)
    const off = plugins.filter(pl => !pl.enabled)
    const byName = (a: PluginRow, b: PluginRow) => a.name.localeCompare(b.name)
    const usedPlugins = used.plugins.map(name => plugins.find(pl => pl.name === name) ?? { name, description: 'Used in this session.', enabled: true }).sort(byName)
    const usedConnectors = used.connectors.map(connectorName).map(name => connectors.find(c => c.name === name) ?? { name, description: CONNECTOR_NOTES[name] ?? 'Used in this session.', enabled: true }).sort(byName)
    const usedSkills = used.skills.map(name => ({ name, description: skillNotes[name] ?? 'Used in this session.', enabled: true })).sort(byName)
    const idle = (rows: PluginRow[], inUse: PluginRow[]) => rows.filter(r => !inUse.some(u => u.name === r.name)).map(r => r.name).join(', ')
    const idlePlugins = idle(enabled, usedPlugins)
    const idleConnectors = idle(connectors, usedConnectors)
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
    // Finished agents can pile up, so they show newest first, 4 at a time.
    const agentWin = windowOf([...finished].reverse(), agentTop, AGENT_ROWS)
    const groupBar = (label: string, count: number, background: string, color: string) => (
      <Box backgroundColor={background} paddingX={1}><Text bold color={color}>{`${label} · ${count}`}</Text></Box>
    )
    // Chat window ends at the newest message unless the person has stepped back.
    const chatWin = windowOf(chat, chat.length - CHAT_ROWS - chatBack, CHAT_ROWS)
    // Each zone sits on its own tinted block, so resources, agents and setup read as separate panels.
    const zone = { flexDirection: 'column', gap: 1, backgroundColor: PANEL_BG, paddingX: 1, paddingY: 1 } as const

    return (
      <Box flexDirection="column" gap={2}>
        {running.length > 0 && (() => {
          const subs = agents.filter(a => a.id !== MAIN)
          const subsDone = subs.filter(a => a.state !== 'running').length
          const share = subs.length ? subsDone / subs.length : (workPct ?? 0) / 100
          const workWidth = Math.max(8, Math.min(20, cols - 28))
          const work = barParts(share, workWidth)
          return (
            <Box gap={2} alignItems="center" paddingX={1}>
              <Text bold>Working</Text>
              {Svg
                ? <Svg source={barSvg(workWidth * PX_PER_COL, HUE_HEX.claude, share)} alt={`Working, ${Math.round(share * 100)}%`} width={workWidth * PX_PER_COL} height={6} />
                : <Text><Text color="claude">{work.fill}</Text><Text dimColor>{work.track}</Text></Text>}
              <Text bold>{Math.round(share * 100)}%</Text>
              <Text dimColor wrap="truncate-end">{subs.length ? `${subsDone}/${subs.length} agents` : workStep}</Text>
            </Box>
          )
        })()}
        <Box {...zone}>
          <Text bold>Usage</Text>
        <Box flexDirection="column">
          {limitRow('memory', 'Memory', ctx === undefined ? undefined : { percentUsed: fill }, <Button key="memory-help" plain dimColor onPress={flip('memory-help')}>?</Button>)}
          {limitRow('5h', '5-hour limit', fiveHour)}
          {limitRow('7d', '7-day limit', weekly)}
        </Box>
        {fill >= 70
          ? <Text dimColor wrap="wrap">{fill >= 85 ? 'Almost full. Claude will soon compress older messages into a summary so you can keep chatting.' : 'Filling up. When it runs out, Claude compresses older messages and carries on.'}</Text>
          : open.includes('memory-help') && <Text dimColor wrap="wrap">When memory runs out, Claude compresses older messages and carries on.</Text>}
        <Box gap={3}>
          <Text><Text dimColor>Session </Text><Text>{t ? fmtTok(t.cur.tokIn + t.cur.tokOut) : '0'}</Text></Text>
          <Text><Text dimColor>All-time </Text><Text>{t ? fmtTok(t.all.tokIn + t.all.tokOut) : '0'}</Text></Text>
        </Box>
        </Box>
        <Box {...zone}>
          <Text bold>Agents</Text>
          <Box flexDirection="column">
          {agents.length === 0 && <Text dimColor>Agents appear here while they work on a task.</Text>}
          {running.length > 0 && (
            <Box flexDirection="column" gap={1}>
              {groupBar('Running', running.length, '#1f8a4c', '#ffffff')}
              {running.map(a => row(a, agents.indexOf(a)))}
            </Box>
          )}
          {finished.length > 0 && (
            <Box flexDirection="column" gap={1} paddingTop={running.length > 0 ? 1 : 0}>
              {groupBar('Finished', finished.length, '#e5a00d', '#1a1a1a')}
              {agentWin.rows.map(a => row(a, agents.indexOf(a)))}
            </Box>
          )}
          {finished.length > AGENT_ROWS && (
            <Box gap={2}>
              <Button key="agents-up" plain dimColor={agentWin.top === 0} onPress={() => void update($, AGENT_TOP, n => Math.max(0, (n ?? 0) - AGENT_ROWS))}>▲ Up</Button>
              <Button key="agents-down" plain dimColor={agentWin.top + AGENT_ROWS >= finished.length} onPress={() => void update($, AGENT_TOP, n => Math.min(finished.length - AGENT_ROWS, (n ?? 0) + AGENT_ROWS))}>▼ Down</Button>
              <Text dimColor>{`${agentWin.top + 1}-${agentWin.top + agentWin.rows.length} of ${finished.length}`}</Text>
            </Box>
          )}
          </Box>
        </Box>
        {chat.length > 0 && <Box {...zone}>
          <Box justifyContent="space-between" gap={2}>
            <Text bold>Agent chat</Text>
            <Button key="chat-raw" plain dimColor={!chatRaw} onPress={() => void $.state.set(CHAT_RAW, !chatRaw)}>{`Full messages: ${chatRaw ? 'on' : 'off'}`}</Button>
          </Box>
          {chatWin.rows.map((c, i) => (
                <Box key={`msg-${chatWin.top + i}`} flexDirection="column">
                  <Text wrap="truncate-end"><Text bold color={hueFor(speaker(c.fromId, c.from, agents), agents)}>{c.from}</Text><Text dimColor>{' to '}</Text><Text color={hueFor(speaker(c.toId, c.to, agents), agents)}>{c.to}</Text></Text>
                  <Box paddingLeft={2}><Text wrap="wrap">{chatRaw ? c.raw ?? c.text : c.text}</Text></Box>
                </Box>
              ))}
          {chat.length > CHAT_ROWS && (
            <Box gap={2}>
              <Button key="chat-up" plain dimColor={chatWin.top === 0} onPress={() => void update($, CHAT_BACK, n => Math.min(chat.length - CHAT_ROWS, (n ?? 0) + CHAT_ROWS))}>▲ Earlier</Button>
              <Button key="chat-down" plain dimColor={chatBack === 0} onPress={() => void update($, CHAT_BACK, n => Math.max(0, (n ?? 0) - CHAT_ROWS))}>▼ Later</Button>
              <Text dimColor>{`${chatWin.top + 1}-${chatWin.top + chatWin.rows.length} of ${chat.length}`}</Text>
            </Box>
          )}
        </Box>}
        <Box {...zone}>
          <Text bold>Setup</Text>
        <Text dimColor>Used in this session</Text>
        {section('plugin', 'Plugins', usedPlugins, 'No plugins used yet.', (idlePlugins || off.length > 0) && <Box paddingLeft={2} flexDirection="column">
          {idlePlugins && <Text dimColor wrap="wrap">Turned on, not used yet: {idlePlugins}</Text>}
          {off.length > 0 && <Text dimColor wrap="wrap">Installed but off: {off.map(pl => pl.name).join(', ')}</Text>}
        </Box>)}
        {section('connector', 'Connectors', usedConnectors, 'No connectors used yet.', idleConnectors && <Box paddingLeft={2}><Text dimColor wrap="wrap">Connected, not used yet: {idleConnectors}</Text></Box>)}
        {section('skill', 'Skills', usedSkills, 'No skills used yet.')}
        </Box>
        <Box flexDirection="column" alignItems="center">
          {!m.up && <Text> </Text>}
          {Svg
            ? <Svg source={crabSvg(HUE_HEX.claude, { sad: m.face === 'sad', dim: m.face === 'sad', width: 64, frame: running.length > 0 ? frame : undefined, blink })} alt={m.face === 'sad' ? 'Claude, sad' : 'Claude'} width={64} height={47} />
            : art.map(line => <Text color="claude" dimColor={m.face === 'sad'}>{line}</Text>)}
          {m.up && <Text> </Text>}
          {m.note && <Text color={m.face === 'sad' ? 'error' : undefined} dimColor>{m.note}</Text>}
        </Box>
      </Box>
    )
  })
}
