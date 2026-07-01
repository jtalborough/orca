import { describe, expect, it } from 'vitest'

import type { ContextFilesystem } from './context-filesystem'
import { resolveHooks, type ResolvedHookConfigSource } from './agent-hook-resolution'

function fsWith(files: Record<string, string>): ContextFilesystem {
  return {
    async statFile() {
      return null
    },
    async readText(path) {
      return files[path] ?? null
    }
  }
}

const CLAUDE_SOURCE: ResolvedHookConfigSource = {
  path: '.claude/settings.json',
  base: 'home',
  shape: 'claude-settings',
  level: 'user',
  absolutePath: '/home/.claude/settings.json'
}

const CODEX_SOURCE: ResolvedHookConfigSource = {
  path: '.codex/hooks.json',
  base: 'home',
  shape: 'codex-hooks',
  level: 'user',
  absolutePath: '/home/.codex/hooks.json'
}

const CURSOR_SOURCE: ResolvedHookConfigSource = {
  path: '.cursor/hooks.json',
  base: 'home',
  shape: 'cursor-hooks',
  level: 'user',
  absolutePath: '/home/.cursor/hooks.json'
}

describe('resolveHooks', () => {
  it('flattens the nested Claude shape, ordering entries within an event', async () => {
    const config = {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command:
                  '[ -n "$SUPERSET_HOME_DIR" ] && SUPERSET_AGENT_ID=claude "$SUPERSET_HOME_DIR/hooks/notify.sh" || true'
              }
            ]
          },
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command:
                  '[ -n "$PASEO_TERMINAL_ID" ] && "${PASEO_HOOK_CLI:-paseo}" hooks claude Stop',
                timeout: 10
              }
            ]
          }
        ]
      }
    }
    const { hooks } = await resolveHooks({
      sources: [CLAUDE_SOURCE],
      fs: fsWith({ [CLAUDE_SOURCE.absolutePath]: JSON.stringify(config) }),
      env: {}
    })
    expect(hooks).toHaveLength(2)
    expect(hooks[0]).toMatchObject({ event: 'Stop', order: 0, provenance: 'superset' })
    expect(hooks[1]).toMatchObject({
      event: 'Stop',
      order: 1,
      provenance: 'paseo',
      gatedOn: ['PASEO_TERMINAL_ID'],
      timeoutSeconds: 10
    })
  })

  it('computes activeNow from the injected env', async () => {
    const config = {
      hooks: {
        Stop: [
          {
            hooks: [
              { type: 'command', command: '[ -n "$PASEO_TERMINAL_ID" ] && paseo hooks claude Stop' }
            ]
          }
        ]
      }
    }
    const fs = fsWith({ [CLAUDE_SOURCE.absolutePath]: JSON.stringify(config) })

    const inactive = await resolveHooks({ sources: [CLAUDE_SOURCE], fs, env: {} })
    expect(inactive.hooks[0].activeNow).toBe(false)

    const active = await resolveHooks({
      sources: [CLAUDE_SOURCE],
      fs,
      env: { PASEO_TERMINAL_ID: 'pane-7' }
    })
    expect(active.hooks[0].activeNow).toBe(true)
  })

  it('an ungated hardcoded Superset hook is activeNow with no gates', async () => {
    const config = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              { type: 'command', command: 'SUPERSET_AGENT_ID=codex "/x/.superset/hooks/notify.sh"' }
            ]
          }
        ]
      }
    }
    const { hooks } = await resolveHooks({
      sources: [CODEX_SOURCE],
      fs: fsWith({ [CODEX_SOURCE.absolutePath]: JSON.stringify(config) }),
      env: {}
    })
    expect(hooks[0]).toMatchObject({ provenance: 'superset', gatedOn: [], activeNow: true })
  })

  it('picks the windows variant on a windows host and does not double-count', async () => {
    const config = {
      hooks: {
        Stop: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: '[ -n "$PASEO_TERMINAL_ID" ] && paseo hooks codex Stop',
                commandWindows: 'if defined PASEO_TERMINAL_ID (paseo hooks codex Stop)'
              }
            ]
          }
        ]
      }
    }
    const fs = fsWith({ [CODEX_SOURCE.absolutePath]: JSON.stringify(config) })

    const onWindows = await resolveHooks({
      sources: [CODEX_SOURCE],
      fs,
      env: {},
      hostPlatform: 'windows'
    })
    expect(onWindows.hooks).toHaveLength(1)
    expect(onWindows.hooks[0].platform).toBe('windows')
    expect(onWindows.hooks[0].command).toContain('if defined')

    const onUnix = await resolveHooks({
      sources: [CODEX_SOURCE],
      fs,
      env: {},
      hostPlatform: 'unix'
    })
    expect(onUnix.hooks).toHaveLength(1)
    expect(onUnix.hooks[0].platform).toBe('unix')
  })

  it('parses the flat Cursor shape (top-level command, no nested hooks)', async () => {
    const config = {
      version: 1,
      hooks: {
        beforeShellExecution: [{ command: '/x/.superset/hooks/cursor-hook.sh PermissionRequest' }]
      }
    }
    const { hooks } = await resolveHooks({
      sources: [CURSOR_SOURCE],
      fs: fsWith({ [CURSOR_SOURCE.absolutePath]: JSON.stringify(config) }),
      env: {}
    })
    expect(hooks).toHaveLength(1)
    expect(hooks[0]).toMatchObject({
      event: 'beforeShellExecution',
      provenance: 'superset',
      platform: 'all'
    })
  })

  it('surfaces a malformed config as unreadable instead of throwing', async () => {
    const { hooks, unreadableConfigs } = await resolveHooks({
      sources: [CLAUDE_SOURCE],
      fs: fsWith({ [CLAUDE_SOURCE.absolutePath]: '{ not json ]' }),
      env: {}
    })
    expect(hooks).toEqual([])
    expect(unreadableConfigs).toEqual([CLAUDE_SOURCE.absolutePath])
  })

  it('treats {hooks:{}} and a missing file as simply empty (no error)', async () => {
    const result = await resolveHooks({
      sources: [
        { ...CURSOR_SOURCE, absolutePath: '/home/.copilot/hooks/orca.json' },
        CLAUDE_SOURCE
      ],
      fs: fsWith({ '/home/.copilot/hooks/orca.json': JSON.stringify({ version: 1, hooks: {} }) }),
      env: {}
    })
    expect(result.hooks).toEqual([])
    expect(result.unreadableConfigs).toEqual([])
  })

  it('attributes a plugin-rooted command when the plugin root is supplied', async () => {
    const config = {
      hooks: {
        PreToolUse: [
          { hooks: [{ type: 'command', command: '/home/.claude/plugins/guard/run.sh' }] }
        ]
      }
    }
    const { hooks } = await resolveHooks({
      sources: [CLAUDE_SOURCE],
      fs: fsWith({ [CLAUDE_SOURCE.absolutePath]: JSON.stringify(config) }),
      env: {},
      pluginRoots: [{ name: 'guard', root: '/home/.claude/plugins/guard' }]
    })
    expect(hooks[0]).toMatchObject({ provenance: 'plugin', pluginName: 'guard' })
  })
})
