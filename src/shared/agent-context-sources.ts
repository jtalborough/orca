// Single source of truth for per-agent context resolution rules, modeled on
// how MCP_CONFIG_CANDIDATES centralizes MCP paths and TUI_AGENT_CONFIG
// centralizes launch data. Declared as an exhaustive `Record<TuiAgent, …>` so
// adding a new TuiAgent fails to compile until its sources (or an explicit
// `null` = "Orca has no documented context sources") are filled in.
//
// Each spec is pure data: which instruction files load and in what precedence,
// which MCP configs the agent reads, and which hook config files to classify.
// The inspector and (eventually) the hook installer share this one spec instead
// of drifting per-agent path literals across src/main/<agent>/hook-service.ts.

import type { HookSourceLevel } from './agent-context-resolution'
import type { McpConfigFormat } from './mcp-config'
import type { TuiAgent } from './types'

export type InstructionSourceSpec = {
  // Home-relative path to the agent's global instruction file; null when none.
  globalPath: string | null
  // Filenames collected from the repo tree (e.g. ['CLAUDE.md'], ['AGENTS.md']).
  projectFilenames: readonly string[]
  // Collect projectFilenames from repo root down to cwd when true; cwd-only when false.
  walkUp: boolean
  // Extra home-relative files loaded after the global (e.g. codex memories).
  extraGlobalFiles?: readonly string[]
  // Filenames treated as local overrides, loaded last (e.g. ['CLAUDE.local.md']).
  localOverrideFilenames?: readonly string[]
}

// On-disk shape of a hook config file. Drives which parser the resolver uses.
export type HookConfigShape =
  | 'claude-settings'
  | 'codex-hooks'
  | 'gemini-settings'
  | 'cursor-hooks'
  | 'copilot-orca'

export type HookConfigSourceSpec = {
  // Path relative to `base`.
  path: string
  // `home` → resolved under the (possibly remote) home dir; `project` → under cwd/repo.
  base: 'home' | 'project'
  shape: HookConfigShape
  level: HookSourceLevel
}

// A per-agent global MCP config that is NOT one of the workspace-relative
// MCP_CONFIG_CANDIDATES (e.g. Codex's ~/.codex/config.toml [mcp_servers]).
export type McpGlobalConfigSpec = {
  // Home-relative path.
  path: string
  format: 'json' | 'toml'
  // Object path to the servers map (e.g. ['mcpServers'] or ['mcp_servers']).
  serversPath: readonly string[]
  label: string
}

export type AgentContextSourceSpec = {
  instruction: InstructionSourceSpec | null
  // Which MCP_CONFIG_CANDIDATES (selected by `format`) this agent reads.
  mcpFormats: readonly McpConfigFormat[]
  mcpGlobalConfig?: McpGlobalConfigSpec
  hookConfigs: readonly HookConfigSourceSpec[]
}

const CLAUDE_SOURCES: AgentContextSourceSpec = {
  instruction: {
    globalPath: '.claude/CLAUDE.md',
    projectFilenames: ['CLAUDE.md'],
    walkUp: true,
    localOverrideFilenames: ['CLAUDE.local.md']
  },
  mcpFormats: ['workspace', 'claude'],
  hookConfigs: [
    { path: '.claude/settings.json', base: 'home', shape: 'claude-settings', level: 'user' },
    { path: '.claude/settings.json', base: 'project', shape: 'claude-settings', level: 'project' },
    {
      path: '.claude/settings.local.json',
      base: 'project',
      shape: 'claude-settings',
      level: 'project-local'
    }
  ]
}

const CODEX_SOURCES: AgentContextSourceSpec = {
  instruction: {
    globalPath: '.codex/AGENTS.md',
    projectFilenames: ['AGENTS.md'],
    walkUp: true,
    extraGlobalFiles: ['.codex/memories/MEMORY.md']
  },
  // Codex resolves MCP servers from ~/.codex/config.toml [mcp_servers], not the
  // workspace-relative JSON candidates.
  mcpFormats: [],
  mcpGlobalConfig: {
    path: '.codex/config.toml',
    format: 'toml',
    serversPath: ['mcp_servers'],
    label: 'Codex config'
  },
  hookConfigs: [{ path: '.codex/hooks.json', base: 'home', shape: 'codex-hooks', level: 'user' }]
}

// Phase 1 ships Claude + Codex across all four dimensions. Remaining agents are
// `null` until their sources are filled in; the exhaustiveness test gates that.
export const AGENT_CONTEXT_SOURCES: Record<TuiAgent, AgentContextSourceSpec | null> = {
  claude: CLAUDE_SOURCES,
  'claude-agent-teams': CLAUDE_SOURCES,
  openclaude: CLAUDE_SOURCES,
  codex: CODEX_SOURCES,
  autohand: null,
  opencode: null,
  'mimo-code': null,
  pi: null,
  omp: null,
  gemini: null,
  antigravity: null,
  aider: null,
  goose: null,
  amp: null,
  kilo: null,
  kiro: null,
  crush: null,
  aug: null,
  cline: null,
  codebuff: null,
  'command-code': null,
  continue: null,
  cursor: null,
  droid: null,
  kimi: null,
  'mistral-vibe': null,
  'qwen-code': null,
  rovo: null,
  hermes: null,
  openclaw: null,
  copilot: null,
  grok: null,
  devin: null,
  ante: null
}

export function getAgentContextSources(agent: TuiAgent): AgentContextSourceSpec | null {
  return AGENT_CONTEXT_SOURCES[agent] ?? null
}
