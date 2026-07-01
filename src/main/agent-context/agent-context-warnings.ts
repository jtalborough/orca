// Derive config-linter warnings from a resolved agent context. Pure over its
// inputs: the fs-dependent bits (which orchestrator script paths are dead) are
// gathered by the aggregator and passed in, so this stays unit-testable.

import type {
  ContextWarning,
  ResolvedHook,
  ResolvedInstructionFile
} from '../../shared/agent-context-resolution'
import type { McpConfigInspection } from '../../shared/mcp-config'
import type { DiscoveredSkill } from '../../shared/skills'

export type ComputeContextWarningsInput = {
  instructionFiles: readonly ResolvedInstructionFile[]
  hooks: readonly ResolvedHook[]
  mcpServers: readonly McpConfigInspection[]
  skills: readonly DiscoveredSkill[]
  homeDir: string
  repoRoot: string | null
  // Config files that exist but failed to parse.
  unreadableConfigs: readonly string[]
  // Absolute hook wrapper script paths the aggregator confirmed are missing.
  deadWrapperPaths: readonly string[]
}

// Orchestrator provenances whose gating consistency is worth checking. `user`
// and `plugin` are author-controlled, so mixed gating there is not a smell.
const ORCHESTRATOR_PROVENANCES = ['orca', 'paseo', 'superset'] as const

function emptyGlobalInstructionWarnings(
  files: readonly ResolvedInstructionFile[]
): ContextWarning[] {
  return files
    .filter((file) => file.level === 'global' && file.state === 'empty')
    .map((file) => ({
      kind: 'empty-global-instruction',
      dimension: 'instruction',
      ref: file.path,
      message: `Global instruction file is empty (0 bytes): ${file.path}`
    }))
}

// NOTE: intra-agent only. The same orchestrator gated in one entry but ungated
// in another within THIS agent's configs signals a partial/half-migrated
// install. The cross-agent form (Superset gated for Claude but ungated for
// Codex) needs a multi-agent resolve and is out of scope for a single channel.
function inconsistentGatingWarnings(hooks: readonly ResolvedHook[]): ContextWarning[] {
  const warnings: ContextWarning[] = []
  for (const provenance of ORCHESTRATOR_PROVENANCES) {
    const entries = hooks.filter((hook) => hook.provenance === provenance)
    const gated = entries.filter((hook) => hook.gatedOn.length > 0)
    const ungated = entries.filter((hook) => hook.gatedOn.length === 0)
    if (gated.length > 0 && ungated.length > 0) {
      warnings.push({
        kind: 'inconsistent-gating',
        dimension: 'hooks',
        ref: provenance,
        message: `${provenance} hooks are inconsistently gated: ${gated.length} env-gated, ${ungated.length} ungated (always fire).`
      })
    }
  }
  return warnings
}

function firstAbsolutePath(command: string): string | null {
  // Quoted or bare absolute path (posix /… or Windows C:\…). Heuristic.
  const match = command.match(/(?:"([^"]+)"|'([^']+)'|(\/[^\s"']+|[A-Za-z]:[\\/][^\s"']+))/)
  if (!match) {
    return null
  }
  const candidate = match[1] ?? match[2] ?? match[3] ?? ''
  return /^(?:\/|[A-Za-z]:[\\/])/.test(candidate) ? candidate : null
}

function unknownProvenanceWarnings(
  hooks: readonly ResolvedHook[],
  homeDir: string,
  repoRoot: string | null
): ContextWarning[] {
  const warnings: ContextWarning[] = []
  for (const hook of hooks) {
    if (hook.provenance !== 'user') {
      continue
    }
    const scriptPath = firstAbsolutePath(hook.command)
    if (!scriptPath) {
      continue
    }
    const insideHome = homeDir && scriptPath.startsWith(homeDir)
    const insideRepo = repoRoot && scriptPath.startsWith(repoRoot)
    if (!insideHome && !insideRepo) {
      warnings.push({
        kind: 'unknown-provenance-hook',
        dimension: 'hooks',
        ref: `${hook.event}:${hook.order}`,
        message: `Hook on ${hook.event} runs a script outside home and repo (${scriptPath}) — likely a leftover from an uninstalled tool.`
      })
    }
  }
  return warnings
}

function duplicateMcpWarnings(servers: readonly McpConfigInspection[]): ContextWarning[] {
  const byName = new Map<string, Set<string>>()
  for (const inspection of servers) {
    for (const server of inspection.servers) {
      const identity = server.command ?? server.url ?? ''
      const set = byName.get(server.name) ?? new Set<string>()
      set.add(identity)
      byName.set(server.name, set)
    }
  }
  const warnings: ContextWarning[] = []
  for (const [name, identities] of byName) {
    if (identities.size > 1) {
      warnings.push({
        kind: 'duplicate-mcp',
        dimension: 'mcp',
        ref: name,
        message: `MCP server "${name}" resolves to ${identities.size} different commands/URLs across config files.`
      })
    }
  }
  return warnings
}

function shadowedSkillWarnings(skills: readonly DiscoveredSkill[]): ContextWarning[] {
  const byName = new Map<string, Set<string>>()
  for (const skill of skills) {
    const set = byName.get(skill.name) ?? new Set<string>()
    set.add(skill.rootPath)
    byName.set(skill.name, set)
  }
  const warnings: ContextWarning[] = []
  for (const [name, roots] of byName) {
    if (roots.size > 1) {
      warnings.push({
        kind: 'shadowed-skill',
        dimension: 'skills',
        ref: name,
        message: `Skill "${name}" is provided by ${roots.size} roots; only the highest-precedence one is used.`
      })
    }
  }
  return warnings
}

export function computeContextWarnings(input: ComputeContextWarningsInput): ContextWarning[] {
  return [
    ...emptyGlobalInstructionWarnings(input.instructionFiles),
    ...input.deadWrapperPaths.map(
      (path): ContextWarning => ({
        kind: 'dead-hook-wrapper',
        dimension: 'hooks',
        ref: path,
        message: `Hook wrapper script is missing: ${path} — the hook fires as a no-op on every event.`
      })
    ),
    ...inconsistentGatingWarnings(input.hooks),
    ...unknownProvenanceWarnings(input.hooks, input.homeDir, input.repoRoot),
    ...duplicateMcpWarnings(input.mcpServers),
    ...shadowedSkillWarnings(input.skills),
    ...input.unreadableConfigs.map(
      (path): ContextWarning => ({
        kind: 'unreadable-config',
        dimension: 'hooks',
        ref: path,
        message: `Config file could not be parsed: ${path}`
      })
    )
  ]
}

// Exposed for the aggregator: pull candidate absolute wrapper script paths out
// of a hook command so their existence can be checked for dead-wrapper warnings.
export function extractWrapperScriptPath(command: string): string | null {
  const path = firstAbsolutePath(command)
  if (!path) {
    return null
  }
  // Only flag executable-looking wrappers; env-var paths ($VAR/…) are
  // unresolvable statically and intentionally skipped.
  return /\.(sh|cmd|ps1|bat)$/.test(path) ? path : null
}
