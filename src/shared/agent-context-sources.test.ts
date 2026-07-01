import { describe, expect, it } from 'vitest'

import { AGENT_CONTEXT_SOURCES, getAgentContextSources } from './agent-context-sources'
import { TUI_AGENT_CONFIG } from './tui-agent-config'
import type { TuiAgent } from './types'

describe('AGENT_CONTEXT_SOURCES', () => {
  it('has an entry (spec or explicit null) for every shipped TuiAgent', () => {
    const agents = Object.keys(TUI_AGENT_CONFIG) as TuiAgent[]
    for (const agent of agents) {
      expect(Object.prototype.hasOwnProperty.call(AGENT_CONTEXT_SOURCES, agent)).toBe(true)
    }
  })

  it('does not declare sources for agents outside the TuiAgent union', () => {
    const knownAgents = new Set(Object.keys(TUI_AGENT_CONFIG))
    for (const agent of Object.keys(AGENT_CONTEXT_SOURCES)) {
      expect(knownAgents.has(agent)).toBe(true)
    }
  })

  it('ships Claude and Codex with instruction + hook sources in Phase 1', () => {
    const claude = getAgentContextSources('claude')
    expect(claude?.instruction?.globalPath).toBe('.claude/CLAUDE.md')
    expect(claude?.hookConfigs.length).toBeGreaterThan(0)

    const codex = getAgentContextSources('codex')
    expect(codex?.instruction?.globalPath).toBe('.codex/AGENTS.md')
    expect(codex?.mcpGlobalConfig?.format).toBe('toml')
  })

  it('treats every hook config path/base/level as internally consistent', () => {
    for (const spec of Object.values(AGENT_CONTEXT_SOURCES)) {
      if (!spec) {
        continue
      }
      for (const hookConfig of spec.hookConfigs) {
        expect(hookConfig.path.length).toBeGreaterThan(0)
        expect(['home', 'project']).toContain(hookConfig.base)
      }
    }
  })
})
