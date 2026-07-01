import { describe, expect, it } from 'vitest'

import type { SkillDiscoveryResult } from '../../shared/skills'
import type { ContextFilesystem, ContextFileInfo } from './context-filesystem'
import { resolveAgentContext, type ResolveAgentContextDeps } from './resolve-agent-context'

const emptySkills: SkillDiscoveryResult = { skills: [], sources: [], scannedAt: 0 }

function makeFs(
  texts: Record<string, string>,
  stats: Record<string, ContextFileInfo> = {}
): ContextFilesystem {
  return {
    async readText(path) {
      return texts[path] ?? null
    },
    async statFile(path) {
      if (stats[path]) {
        return stats[path]
      }
      // Treat any path with text content as a present file for dead-wrapper checks.
      return texts[path] !== undefined ? { bytes: texts[path].length, isSymlink: false } : null
    }
  }
}

function makeDeps(overrides: Partial<ResolveAgentContextDeps>): ResolveAgentContextDeps {
  return {
    fs: makeFs({}),
    homeDir: '/home',
    repoRoot: '/repo',
    hostPlatform: 'unix',
    sep: '/',
    env: {},
    discoverSkills: async () => emptySkills,
    ...overrides
  }
}

describe('resolveAgentContext', () => {
  it('returns hasKnownSources=false for an agent with no spec', async () => {
    const result = await resolveAgentContext(
      { agent: 'aider', cwd: '/repo', connectionId: null },
      makeDeps({})
    )
    expect(result.hasKnownSources).toBe(false)
    expect(result.instructionFiles).toEqual([])
    expect(result.hooks).toEqual([])
  })

  it('composes all four dimensions for Claude', async () => {
    const fs = makeFs({
      '/home/.claude/CLAUDE.md': 'global guidance',
      '/repo/CLAUDE.md': 'project guidance',
      '/repo/.mcp.json': JSON.stringify({
        mcpServers: { db: { command: 'pg-mcp' } }
      }),
      '/home/.claude/settings.json': JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: 'command',
                  command: '[ -n "$PASEO_TERMINAL_ID" ] && paseo hooks claude Stop'
                }
              ]
            }
          ]
        }
      })
    })
    const result = await resolveAgentContext(
      { agent: 'claude', cwd: '/repo', connectionId: null },
      makeDeps({ fs })
    )
    expect(result.hasKnownSources).toBe(true)
    expect(result.instructionFiles.map((file) => file.level)).toEqual(['global', 'project-root'])
    expect(result.mcp.some((inspection) => inspection.servers.some((s) => s.name === 'db'))).toBe(
      true
    )
    expect(result.hooks).toHaveLength(1)
    expect(result.hooks[0]).toMatchObject({ provenance: 'paseo', activeNow: false })
  })

  it('flags an empty global instruction file as a warning (Codex AGENTS.md)', async () => {
    const fs = makeFs(
      { '/home/.codex/hooks.json': JSON.stringify({ hooks: {} }) },
      { '/home/.codex/AGENTS.md': { bytes: 0, isSymlink: false } }
    )
    const result = await resolveAgentContext(
      { agent: 'codex', cwd: '/repo', connectionId: null },
      makeDeps({ fs })
    )
    expect(result.warnings.some((w) => w.kind === 'empty-global-instruction')).toBe(true)
  })

  it('flags a dead orchestrator wrapper script that is missing on disk', async () => {
    const fs = makeFs({
      '/home/.codex/hooks.json': JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'SUPERSET_AGENT_ID=codex "/x/.superset/hooks/notify.sh"'
                }
              ]
            }
          ]
        }
      })
      // Note: /x/.superset/hooks/notify.sh has no entry → statFile returns null → dead.
    })
    const result = await resolveAgentContext(
      { agent: 'codex', cwd: '/repo', connectionId: null },
      makeDeps({ fs })
    )
    expect(result.warnings.some((w) => w.kind === 'dead-hook-wrapper')).toBe(true)
  })

  it('resolves remote workspaces against the injected (remote) home, not local', async () => {
    const fs = makeFs({
      '/remote/home/.claude/CLAUDE.md': 'remote global',
      '/remote/repo/CLAUDE.md': 'remote project'
    })
    const result = await resolveAgentContext(
      { agent: 'claude', cwd: '/remote/repo', connectionId: 'ssh-1' },
      makeDeps({ fs, homeDir: '/remote/home', repoRoot: '/remote/repo' })
    )
    expect(result.workspace.connectionId).toBe('ssh-1')
    expect(result.instructionFiles.map((file) => file.path)).toContain(
      '/remote/home/.claude/CLAUDE.md'
    )
  })
})
