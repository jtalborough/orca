import { describe, expect, it } from 'vitest'

import { filterSkillsForProvider, isSkillVisibleToProvider } from './agent-skill-visibility'
import type { SkillProvider } from './skills'

describe('isSkillVisibleToProvider', () => {
  it('shows an agent its own provider roots', () => {
    expect(isSkillVisibleToProvider(['claude'], 'claude')).toBe(true)
    expect(isSkillVisibleToProvider(['codex'], 'codex')).toBe(true)
  })

  it('hides another agent-specific root', () => {
    // ~/.codex/skills is ['codex'] — Claude must not see it.
    expect(isSkillVisibleToProvider(['codex'], 'claude')).toBe(false)
    // ~/.claude/skills is ['claude'] — Codex must not see it.
    expect(isSkillVisibleToProvider(['claude'], 'codex')).toBe(false)
  })

  it('shows the shared agent-skills home to both agents', () => {
    expect(isSkillVisibleToProvider(['agent-skills'], 'claude')).toBe(true)
    expect(isSkillVisibleToProvider(['agent-skills'], 'codex')).toBe(true)
  })

  it('hides the Codex plugin cache from Claude despite its agent-skills tag', () => {
    // ~/.codex/plugins/cache is ['codex','agent-skills'] — a Codex root.
    expect(isSkillVisibleToProvider(['codex', 'agent-skills'], 'claude')).toBe(false)
    expect(isSkillVisibleToProvider(['codex', 'agent-skills'], 'codex')).toBe(true)
  })
})

describe('filterSkillsForProvider', () => {
  const skills: { name: string; providers: SkillProvider[] }[] = [
    { name: 'claude-home', providers: ['claude'] },
    { name: 'codex-home', providers: ['codex'] },
    { name: 'shared-agents', providers: ['agent-skills'] },
    { name: 'codex-plugin', providers: ['codex', 'agent-skills'] }
  ]

  it('keeps only Claude-visible roots for Claude', () => {
    const names = filterSkillsForProvider(skills, 'claude').map((s) => s.name)
    expect(names).toEqual(['claude-home', 'shared-agents'])
  })

  it('keeps only Codex-visible roots for Codex', () => {
    const names = filterSkillsForProvider(skills, 'codex').map((s) => s.name)
    expect(names).toEqual(['codex-home', 'shared-agents', 'codex-plugin'])
  })
})
