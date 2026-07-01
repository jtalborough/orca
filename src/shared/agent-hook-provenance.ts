// Pure, I/O-free classification of agent hook commands for the Context
// Inspector. Orca manages a few agent hook config files (e.g. ~/.claude/
// settings.json, ~/.codex/hooks.json) that are *shared* writeback targets:
// external orchestrators (Paseo, Superset) and plugins co-install their own
// entries into the same files, and users hand-edit them too. The inspector
// needs to tell, for any one hook command string, who put it there and under
// what env gate — without executing anything.
//
// Every orchestrator self-identifies in the command string, so classification
// is deterministic. This module is the single matcher; keep it table-driven
// and unit-tested against the real on-disk forms (see the test file).

// Who installed a hook. `orca` = Orca's own managed wrapper; `paseo`/`superset`
// = co-installed external orchestrators; `plugin` = an enabled agent plugin;
// `user` = anything else (hand-authored or a leftover from an uninstalled tool).
export type HookProvenance = 'orca' | 'paseo' | 'superset' | 'plugin' | 'user'

export type HookProvenanceResult = {
  provenance: HookProvenance
  // Set only when provenance === 'plugin'.
  pluginName?: string
}

// A plugin install root the classifier can attribute commands to. Only plugins
// actually enabled for the inspected agent/scope should be passed in, so a
// disabled plugin's leftover hook is correctly classified `user`, not `plugin`.
export type HookPluginRoot = {
  name: string
  root: string
}

export type ClassifyHookProvenanceOptions = {
  pluginRoots?: readonly HookPluginRoot[]
}

// Why: hook paths are written with the host separator (`\` on Windows), but our
// marker substrings are forward-slashed. Normalize before substring matching so
// a Windows-written Orca/Superset path still classifies. Mirrors the
// normalization in installer-utils' createManagedCommandMatcher.
function normalizeSlashes(command: string): string {
  return command.replaceAll('\\', '/')
}

// Orca writes its managed wrappers to `~/.orca/agent-hooks/<agent>-hook.sh`
// (getSharedManagedScriptPath) and its Windows posts reference ORCA_AGENT_HOOK_*
// env. Either marker is unambiguous — no other installer uses them.
function isOrcaCommand(normalized: string): boolean {
  return normalized.includes('.orca/agent-hooks/') || normalized.includes('ORCA_AGENT_HOOK')
}

// Paseo gates on $PASEO_TERMINAL_ID and invokes `paseo hooks <agent> <event>`
// (or the Windows `if defined PASEO_TERMINAL_ID` form). PASEO_HOOK_CLI is the
// configurable launcher.
function isPaseoCommand(normalized: string): boolean {
  return (
    normalized.includes('PASEO_TERMINAL_ID') ||
    normalized.includes('PASEO_HOOK_CLI') ||
    /\bpaseo\s+hooks\b/.test(normalized)
  )
}

// Superset either gates on $SUPERSET_HOME_DIR, stamps SUPERSET_AGENT_ID, or
// invokes a script under `.superset/hooks/` (notify.sh / gemini-hook.sh /
// cursor-hook.sh — the script name varies per agent).
function isSupersetCommand(normalized: string): boolean {
  return (
    normalized.includes('SUPERSET_HOME_DIR') ||
    normalized.includes('SUPERSET_AGENT_ID') ||
    normalized.includes('.superset/hooks/')
  )
}

// Why: longest-match-wins. A plugin whose install root is a deep path should not
// lose to a coincidental short marker, so compare the most specific root first.
function matchPluginRoot(
  normalized: string,
  pluginRoots: readonly HookPluginRoot[]
): HookPluginRoot | null {
  const byLengthDesc = [...pluginRoots].sort((a, b) => b.root.length - a.root.length)
  for (const plugin of byLengthDesc) {
    if (plugin.root && normalized.includes(normalizeSlashes(plugin.root))) {
      return plugin
    }
  }
  return null
}

// Precedence: orca > paseo > superset > plugin > user. The orchestrator markers
// are mutually exclusive in practice, but a fixed order keeps classification
// deterministic if a future command carries more than one signature.
export function classifyHookProvenance(
  command: string,
  opts: ClassifyHookProvenanceOptions = {}
): HookProvenanceResult {
  const normalized = normalizeSlashes(command)

  if (isOrcaCommand(normalized)) {
    return { provenance: 'orca' }
  }
  if (isPaseoCommand(normalized)) {
    return { provenance: 'paseo' }
  }
  if (isSupersetCommand(normalized)) {
    return { provenance: 'superset' }
  }
  const plugin = matchPluginRoot(normalized, opts.pluginRoots ?? [])
  if (plugin) {
    return { provenance: 'plugin', pluginName: plugin.name }
  }
  return { provenance: 'user' }
}

// Extract the env vars a command is *gated on* — vars whose unset state makes
// the hook a no-op. This is a bounded heuristic over shell test guards, NOT a
// shell parser: it reads `[ -n "$VAR" ]` / `[ -x "$VAR/..." ]`-style POSIX
// tests and the Windows `if defined VAR` form. It deliberately ignores
// `${VAR:-default}` substitutions (not a gate) and `VAR=value` assignments
// (e.g. SUPERSET_AGENT_ID=codex — sets, doesn't gate). New gate shapes need a
// case added here.
export function parseHookEnvGates(command: string): string[] {
  const gates: string[] = []
  const seen = new Set<string>()
  const add = (name: string | undefined): void => {
    if (name && !seen.has(name)) {
      seen.add(name)
      gates.push(name)
    }
  }

  // POSIX `[ ... ]` test expressions. Inside each, collect plain `$VAR` and
  // `${VAR}` references. The variable regex matches `${VAR}` (closed brace) or
  // bare `$VAR` only — so `${VAR:-default}` is skipped, since its brace never
  // closes immediately after the name.
  const testRegex = /\[\s+([^\][]*?)\s+\]/g
  const varRegex = /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g
  for (const testMatch of command.matchAll(testRegex)) {
    const inner = testMatch[1]
    for (const varMatch of inner.matchAll(varRegex)) {
      add(varMatch[1] ?? varMatch[2])
    }
  }

  // Windows `if defined VAR (...)` guard from commandWindows variants.
  const winRegex = /\bif\s+defined\s+([A-Za-z_][A-Za-z0-9_]*)/gi
  for (const winMatch of command.matchAll(winRegex)) {
    add(winMatch[1])
  }

  return gates
}
