export type Rec = { tokIn: number; tokOut: number }
export type Totals = { cur: Rec; all: Rec; sessions: number }
export type Limit = { kind: string; percentUsed: number; resetsIn?: string }
export type Reading = { limits: Limit[]; asOf: number }
export type Mood = { face: 'idle' | 'happy' | 'sad'; up: boolean; note: string }
// One tool call an agent made: the tool and its main argument, shortened.
export type Call = { tool: string; detail?: string; label?: string }
// One SendMessage between agents (or Claude), for the live chat view.
export type Msg = { from: string; to: string; text: string; raw?: string; at: number; fromId?: string; toId?: string }
export type PluginRow = { name: string; description: string; enabled: boolean }
// What this session actually called: plugin names, connector server ids, skill names.
export type Used = { plugins: string[]; connectors: string[]; skills: string[] }
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
      used: Used
      // Animation: which frame the working crabs are on, and whether idle ones are blinking.
      frame: number
      blink: boolean
      // Whether new agents are told to message each other.
      talk: boolean
      // One-liners from each skill's own file, by skill name.
      skillNotes: Record<string, string>
      // How many parallel agents to ask for on each prompt; 1 means none.
      helpers: number
      context: number
      // Agent ids whose tool-call list is expanded.
      open: string[]
      // SendMessage traffic between Claude and its agents, newest last.
      chat: Msg[]
      chatRaw: boolean
      // First agent row shown in the Agents list (4 rows at a time).
      agentTop: number
      // How many messages back from the newest the chat window starts.
      chatBack: number
    }
  }
}
