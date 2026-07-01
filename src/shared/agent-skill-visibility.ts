// Pure filter deciding whether a discovered skill is visible to a given agent.
// Skill discovery scans every root (Codex/Claude/shared agent-skills); the
// inspector must narrow that to the roots the *selected* agent actually reads.

import type { SkillProvider } from './skills'

// The agent-owned skill providers (i.e. an agent's own dirs). `agent-skills` is
// the shared convention, not owned by any single agent.
const AGENT_OWNED_PROVIDERS: readonly SkillProvider[] = ['claude', 'codex']

// A skill (identified by its root's providers) is visible to an agent whose own
// provider is `agentProvider` when:
//   - the root is the agent's own provider (e.g. Claude → ~/.claude/skills), or
//   - the root is the shared agent-skills home (~/.agents/skills) — UNLESS that
//     root also belongs to a different agent. The Codex plugin cache is tagged
//     ['codex','agent-skills'], so it is a Codex root that merely carries the
//     agent-skills format tag and must not leak into Claude's view.
export function isSkillVisibleToProvider(
  providers: readonly SkillProvider[],
  agentProvider: SkillProvider
): boolean {
  if (providers.includes(agentProvider)) {
    return true
  }
  if (providers.includes('agent-skills')) {
    return !AGENT_OWNED_PROVIDERS.some(
      (provider) => provider !== agentProvider && providers.includes(provider)
    )
  }
  return false
}

export function filterSkillsForProvider<T extends { providers: SkillProvider[] }>(
  skills: readonly T[],
  agentProvider: SkillProvider
): T[] {
  return skills.filter((skill) => isSkillVisibleToProvider(skill.providers, agentProvider))
}
