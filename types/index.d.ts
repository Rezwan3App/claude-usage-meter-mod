export type Rec = { tokIn: number; tokOut: number }
export type Totals = { cur: Rec; all: Rec; sessions: number }
export type Limit = { kind: string; percentUsed: number; resetsIn?: string }
export type Reading = { limits: Limit[]; asOf: number }
export type Mood = { face: 'idle' | 'happy' | 'sad'; up: boolean; note: string }
// One tool call an agent made: the tool and its main argument, shortened.
export type Call = { tool: string; detail?: string }
export type PluginRow = { name: string; description: string; enabled: boolean }
export type Agent = {
  id: string
  title: string
  type: string
  model: string
  tools: number
  calls?: Call[]
  tokens: number
  startedAt: number
  ms: number
  state: 'running' | 'done' | 'failed'
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': {
      totals: Totals | null
      reading: Reading | null
      mood: Mood | null
      agents: Agent[]
      now: number
      pct: number
      step: string
      effort: string
      plugins: PluginRow[]
      connectors: PluginRow[]
      // How many parallel agents to ask for on each prompt; 1 means none.
      helpers: number
      context: number
      // Agent ids whose tool-call list is expanded.
      open: string[]
    }
  }
}
