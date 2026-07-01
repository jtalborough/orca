import { describe, expect, it } from 'vitest'

import type { ResolvedHook, ResolvedInstructionFile } from '../../shared/agent-context-resolution'
import type { McpConfigInspection } from '../../shared/mcp-config'
import type { DiscoveredSkill } from '../../shared/skills'
import {
  computeContextWarnings,
  extractWrapperScriptPath,
  type ComputeContextWarningsInput
} from './agent-context-warnings'

function baseInput(overrides: Partial<ComputeContextWarningsInput>): ComputeContextWarningsInput {
  return {
    instructionFiles: [],
    hooks: [],
    mcpServers: [],
    skills: [],
    homeDir: '/home',
    repoRoot: '/repo',
    unreadableConfigs: [],
    deadWrapperPaths: [],
    ...overrides
  }
}

function hook(overrides: Partial<ResolvedHook>): ResolvedHook {
  return {
    event: 'Stop',
    order: 0,
    matcher: null,
    command: 'noop',
    provenance: 'user',
    gatedOn: [],
    activeNow: true,
    source: { path: '/home/.claude/settings.json', level: 'user' },
    platform: 'all',
    ...overrides
  }
}

describe('computeContextWarnings', () => {
  it('flags an empty global instruction file', () => {
    const file: ResolvedInstructionFile = {
      path: '/home/.codex/AGENTS.md',
      level: 'global',
      bytes: 0,
      state: 'empty'
    }
    const warnings = computeContextWarnings(baseInput({ instructionFiles: [file] }))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ kind: 'empty-global-instruction', ref: file.path })
  })

  it('does not flag a present (non-empty) global file', () => {
    const file: ResolvedInstructionFile = {
      path: '/home/.claude/CLAUDE.md',
      level: 'global',
      bytes: 138,
      state: 'present'
    }
    expect(computeContextWarnings(baseInput({ instructionFiles: [file] }))).toEqual([])
  })

  it('flags intra-agent inconsistent gating for the same provenance', () => {
    const hooks = [
      hook({ provenance: 'superset', gatedOn: ['SUPERSET_HOME_DIR'], event: 'Stop' }),
      hook({ provenance: 'superset', gatedOn: [], event: 'SessionStart' })
    ]
    const warnings = computeContextWarnings(baseInput({ hooks }))
    expect(warnings.some((w) => w.kind === 'inconsistent-gating' && w.ref === 'superset')).toBe(
      true
    )
  })

  it('does not flag a consistently-gated provenance', () => {
    const hooks = [
      hook({ provenance: 'paseo', gatedOn: ['PASEO_TERMINAL_ID'], event: 'Stop' }),
      hook({ provenance: 'paseo', gatedOn: ['PASEO_TERMINAL_ID'], event: 'SessionStart' })
    ]
    expect(
      computeContextWarnings(baseInput({ hooks })).some((w) => w.kind === 'inconsistent-gating')
    ).toBe(false)
  })

  it('flags a user hook running a script outside home and repo', () => {
    const hooks = [hook({ provenance: 'user', command: '/opt/leftover/old-tool.sh "$1"' })]
    const warnings = computeContextWarnings(baseInput({ hooks }))
    expect(warnings.some((w) => w.kind === 'unknown-provenance-hook')).toBe(true)
  })

  it('does not flag a user hook whose script lives under home', () => {
    const hooks = [hook({ provenance: 'user', command: '/home/scripts/notify.sh' })]
    expect(
      computeContextWarnings(baseInput({ hooks })).some((w) => w.kind === 'unknown-provenance-hook')
    ).toBe(false)
  })

  it('flags an MCP server name resolving to different commands across files', () => {
    const mcpServers: McpConfigInspection[] = [
      {
        candidate: {
          format: 'workspace',
          label: 'Workspace',
          relativePath: '.mcp.json',
          serversPath: ['mcpServers']
        },
        exists: true,
        status: 'valid',
        servers: [{ name: 'db', transport: 'stdio', status: 'enabled', command: 'pg-mcp' }]
      },
      {
        candidate: {
          format: 'claude',
          label: 'Claude',
          relativePath: '.claude.json',
          serversPath: ['mcpServers']
        },
        exists: true,
        status: 'valid',
        servers: [{ name: 'db', transport: 'stdio', status: 'enabled', command: 'other-db-mcp' }]
      }
    ]
    const warnings = computeContextWarnings(baseInput({ mcpServers }))
    expect(warnings.some((w) => w.kind === 'duplicate-mcp' && w.ref === 'db')).toBe(true)
  })

  it('flags a skill name provided by two roots', () => {
    const skills = [
      { name: 'deploy', rootPath: '/home/.claude/skills' },
      { name: 'deploy', rootPath: '/repo/.claude/skills' }
    ] as DiscoveredSkill[]
    const warnings = computeContextWarnings(baseInput({ skills }))
    expect(warnings.some((w) => w.kind === 'shadowed-skill' && w.ref === 'deploy')).toBe(true)
  })

  it('emits dead-wrapper and unreadable-config warnings from passed-in paths', () => {
    const warnings = computeContextWarnings(
      baseInput({
        deadWrapperPaths: ['/x/.superset/hooks/notify.sh'],
        unreadableConfigs: ['/home/.codex/hooks.json']
      })
    )
    expect(warnings.some((w) => w.kind === 'dead-hook-wrapper')).toBe(true)
    expect(warnings.some((w) => w.kind === 'unreadable-config')).toBe(true)
  })
})

describe('extractWrapperScriptPath', () => {
  it('returns an absolute wrapper script path from a hardcoded command', () => {
    expect(
      extractWrapperScriptPath('SUPERSET_AGENT_ID=codex "/Users/jta/.superset/hooks/notify.sh"')
    ).toBe('/Users/jta/.superset/hooks/notify.sh')
  })

  it('returns null for an env-var-based path (unresolvable statically)', () => {
    expect(
      extractWrapperScriptPath('[ -x "$SUPERSET_HOME_DIR/hooks/notify.sh" ] && run')
    ).toBeNull()
  })

  it('returns null for a non-script command', () => {
    expect(extractWrapperScriptPath('paseo hooks claude Stop')).toBeNull()
  })
})
