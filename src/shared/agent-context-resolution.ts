// Pure result shapes for the Agent Context Inspector. No electron/Node/React
// imports — this is the shared contract returned over the `agent-context:resolve`
// IPC channel and rendered as-is by the renderer (which does no I/O itself).

import type { HookProvenance } from './agent-hook-provenance'
import type { McpConfigInspection } from './mcp-config'
import type { SkillDiscoveryResult } from './skills'
import type { TuiAgent } from './types'

// Load-order level of an instruction file. `global` = home/user file;
// `project-root`..`cwd` = the walk from repo root down to the working dir;
// `local-override` = a *.local.md that overrides the rest (loaded last).
export type InstructionLevel = 'global' | 'project-root' | 'intermediate' | 'cwd' | 'local-override'

// `empty` (0 bytes) is distinguished from `missing` because an empty global
// instruction file is a config smell (warning), while a missing one is just
// absent. `symlink` is reported instead of silently following the target.
export type InstructionFileState = 'present' | 'empty' | 'symlink' | 'missing'

export type ResolvedInstructionFile = {
  path: string
  level: InstructionLevel
  bytes: number
  state: InstructionFileState
  symlinkTarget?: string
}

// Where a hook entry came from. Mirrors the merge layers an agent reads:
// user (home) → project → project-local → enterprise/managed → plugin.
export type HookSourceLevel = 'user' | 'project' | 'project-local' | 'enterprise' | 'plugin'

// `all` = a single command that runs everywhere; `unix`/`windows` = the
// platform-specific form of a hook entry that ships both a posix `command` and
// a `commandWindows` (or bash/powershell) variant. For a remote workspace,
// platform is evaluated against the connection's OS, not the local one.
export type HookPlatform = 'all' | 'unix' | 'windows'

export type ResolvedHook = {
  event: string
  order: number
  matcher: string | null
  command: string
  provenance: HookProvenance
  pluginName?: string
  // Env vars that must be set for the hook to do anything (see parseHookEnvGates).
  gatedOn: string[]
  // Whether every gate is satisfied in the environment the resolver evaluated.
  // NOTE: this is the env the resolver was given (Orca's process env), not the
  // agent's per-terminal launch env — a hook gated on a launch-time var (e.g.
  // PASEO_TERMINAL_ID) reads as inactive here even if it would fire at runtime.
  activeNow: boolean
  source: { path: string; level: HookSourceLevel }
  timeoutSeconds?: number
  platform: HookPlatform
}

export type ContextWarningKind =
  | 'empty-global-instruction'
  | 'dead-hook-wrapper'
  | 'inconsistent-gating'
  | 'unknown-provenance-hook'
  | 'shadowed-skill'
  | 'duplicate-mcp'
  | 'unreadable-config'

export type ContextDimension = 'instruction' | 'skills' | 'mcp' | 'hooks'

export type ContextWarning = {
  kind: ContextWarningKind
  message: string
  dimension: ContextDimension
  // Optional anchor (file path or row key) the UI can deep-link to.
  ref?: string
}

export type ResolveAgentContextArgs = {
  agent: TuiAgent
  cwd: string
  connectionId: string | null
}

export type AuthorizeContextFileArgs = {
  // Absolute path of a resolved context file to authorize for the editor's
  // read path. A resolved config often lives outside the worktree (e.g.
  // ~/.claude/settings.json); clicking it is explicit intent to open it, so we
  // add it to the editor's authorized-external-paths allowlist (local only —
  // remote reads go through the provider and are not locally sandboxed).
  path: string
  connectionId: string | null
}

export type ResolvedAgentContext = {
  agent: TuiAgent
  workspace: { path: string; connectionId: string | null }
  // false when AGENT_CONTEXT_SOURCES[agent] === null — Orca has no documented
  // context sources for this agent, so the four dimensions are intentionally
  // empty and the UI shows an explicit "no known sources" state.
  hasKnownSources: boolean
  instructionFiles: ResolvedInstructionFile[]
  skills: SkillDiscoveryResult | null
  mcp: McpConfigInspection[]
  hooks: ResolvedHook[]
  warnings: ContextWarning[]
}
