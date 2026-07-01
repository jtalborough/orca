import { describe, expect, it } from 'vitest'

import { classifyHookProvenance, parseHookEnvGates } from './agent-hook-provenance'

// Real command strings taken verbatim from the co-installed orchestrator
// configs on a live machine (~/.claude/settings.json, ~/.codex/hooks.json,
// ~/.gemini/settings.json, ~/.cursor/hooks.json). Keep these exact so the
// classifier stays grounded in what actually ships.
const PASEO_CLAUDE_NOTIFICATION =
  '[ -n "$PASEO_TERMINAL_ID" ] && "${PASEO_HOOK_CLI:-paseo}" hooks claude Notification'
const PASEO_CODEX_WINDOWS =
  'if defined PASEO_TERMINAL_ID (if defined PASEO_HOOK_CLI ("%PASEO_HOOK_CLI%" hooks codex Stop) else (paseo hooks codex Stop))'
const SUPERSET_CLAUDE_GATED =
  '[ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/hooks/notify.sh" ] && SUPERSET_AGENT_ID=claude "$SUPERSET_HOME_DIR/hooks/notify.sh" || true'
const SUPERSET_CODEX_UNGATED = 'SUPERSET_AGENT_ID=codex "/Users/jta/.superset/hooks/notify.sh"'
const SUPERSET_GEMINI_HARDCODED = '/Users/jta/.superset/hooks/gemini-hook.sh'
const SUPERSET_CURSOR_HARDCODED = '/Users/jta/.superset/hooks/cursor-hook.sh Stop'
const ORCA_POSIX_WRAPPER =
  "if [ -x '/Users/jta/.orca/agent-hooks/claude-hook.sh' ]; then /bin/sh '/Users/jta/.orca/agent-hooks/claude-hook.sh'; fi"
const ORCA_WINDOWS_POST =
  '"%SystemRoot%\\System32\\curl.exe" -sS -X POST "http://127.0.0.1:%ORCA_AGENT_HOOK_PORT%/hook/claude"'

describe('classifyHookProvenance', () => {
  it('classifies Orca managed wrappers (posix + windows)', () => {
    expect(classifyHookProvenance(ORCA_POSIX_WRAPPER).provenance).toBe('orca')
    expect(classifyHookProvenance(ORCA_WINDOWS_POST).provenance).toBe('orca')
  })

  it('classifies Paseo hooks (gated posix + windows defined form)', () => {
    expect(classifyHookProvenance(PASEO_CLAUDE_NOTIFICATION).provenance).toBe('paseo')
    expect(classifyHookProvenance(PASEO_CODEX_WINDOWS).provenance).toBe('paseo')
  })

  it('classifies Superset hooks regardless of gating or script name', () => {
    expect(classifyHookProvenance(SUPERSET_CLAUDE_GATED).provenance).toBe('superset')
    expect(classifyHookProvenance(SUPERSET_CODEX_UNGATED).provenance).toBe('superset')
    expect(classifyHookProvenance(SUPERSET_GEMINI_HARDCODED).provenance).toBe('superset')
    expect(classifyHookProvenance(SUPERSET_CURSOR_HARDCODED).provenance).toBe('superset')
  })

  it('classifies an unknown hand-authored command as user', () => {
    const result = classifyHookProvenance('/usr/local/bin/my-notifier.sh "$1"')
    expect(result.provenance).toBe('user')
    expect(result.pluginName).toBeUndefined()
  })

  it('attributes a command under an enabled plugin root to that plugin', () => {
    const command = '/Users/jta/.claude/plugins/cc-notify/hooks/run.sh Stop'
    const result = classifyHookProvenance(command, {
      pluginRoots: [{ name: 'cc-notify', root: '/Users/jta/.claude/plugins/cc-notify' }]
    })
    expect(result.provenance).toBe('plugin')
    expect(result.pluginName).toBe('cc-notify')
  })

  it('does NOT classify as plugin when the plugin root is not supplied (disabled plugin)', () => {
    const command = '/Users/jta/.claude/plugins/cc-notify/hooks/run.sh Stop'
    expect(classifyHookProvenance(command).provenance).toBe('user')
  })

  it('prefers the most specific (longest) plugin root on overlap', () => {
    const command = '/plugins/parent/child/hooks/run.sh'
    const result = classifyHookProvenance(command, {
      pluginRoots: [
        { name: 'parent', root: '/plugins/parent' },
        { name: 'child', root: '/plugins/parent/child' }
      ]
    })
    expect(result.pluginName).toBe('child')
  })

  it('matches Windows-separator paths via slash normalization', () => {
    const command = 'C:\\Users\\jta\\.orca\\agent-hooks\\codex-hook.cmd'
    expect(classifyHookProvenance(command).provenance).toBe('orca')
  })
})

describe('parseHookEnvGates', () => {
  it('extracts a single gate from a Paseo guard, ignoring the ${VAR:-default} launcher', () => {
    expect(parseHookEnvGates(PASEO_CLAUDE_NOTIFICATION)).toEqual(['PASEO_TERMINAL_ID'])
  })

  it('dedupes a var referenced across multiple test guards', () => {
    expect(parseHookEnvGates(SUPERSET_CLAUDE_GATED)).toEqual(['SUPERSET_HOME_DIR'])
  })

  it('returns no gates for an ungated hardcoded command with a VAR= assignment', () => {
    // SUPERSET_AGENT_ID=codex is an assignment, not a gate.
    expect(parseHookEnvGates(SUPERSET_CODEX_UNGATED)).toEqual([])
  })

  it('lists every var when a hook is gated on multiple ([-n] && [-x] on different vars)', () => {
    const command = '[ -n "$X_FLAG" ] && [ -x "$Y_HOME/run.sh" ] && "$Y_HOME/run.sh"'
    expect(parseHookEnvGates(command)).toEqual(['X_FLAG', 'Y_HOME'])
  })

  it('parses the Windows `if defined VAR` guard', () => {
    expect(parseHookEnvGates(PASEO_CODEX_WINDOWS)).toEqual(['PASEO_TERMINAL_ID', 'PASEO_HOOK_CLI'])
  })

  it('returns an empty list for a plain unguarded command', () => {
    expect(parseHookEnvGates('/usr/local/bin/notify.sh "$ARG"')).toEqual([])
  })

  it('handles ${VAR} braced references inside a test guard', () => {
    expect(parseHookEnvGates('[ -n "${MY_GATE}" ] && run')).toEqual(['MY_GATE'])
  })
})
