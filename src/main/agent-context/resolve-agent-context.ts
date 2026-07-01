// Aggregator: resolve everything for an (agent, workspace) pair. Looks up the
// per-agent spec, then composes the instruction-file resolver, the existing
// skill discovery, MCP inspection (existing parser), and the hook resolver, and
// finally derives linter warnings. Orchestration only — each resolver and the
// warnings live in their own module to respect max-lines.

import { getAgentContextSources } from '../../shared/agent-context-sources'
import type {
  ResolveAgentContextArgs,
  ResolvedAgentContext
} from '../../shared/agent-context-resolution'
import type { HookPluginRoot } from '../../shared/agent-hook-provenance'
import {
  MCP_CONFIG_CANDIDATES,
  inspectMcpConfigContent,
  type McpConfigInspection
} from '../../shared/mcp-config'
import type { SkillDiscoveryResult } from '../../shared/skills'
import type { AgentContextSourceSpec } from '../../shared/agent-context-sources'
import { resolveHooks, type ResolvedHookConfigSource } from './agent-hook-resolution'
import { computeContextWarnings, extractWrapperScriptPath } from './agent-context-warnings'
import type { ContextFilesystem } from './context-filesystem'
import { joinPath } from './context-path'
import { resolveInstructionFiles } from './instruction-file-resolution'

export type ResolveAgentContextDeps = {
  fs: ContextFilesystem
  // (Possibly remote) home dir for this workspace's connection.
  homeDir: string
  repoRoot: string | null
  hostPlatform: 'unix' | 'windows'
  // Path separator for the workspace host ('/' for SSH/posix, '\\' local Windows).
  sep: string
  // Environment the hook gates are evaluated against.
  env: Record<string, string | undefined>
  pluginRoots?: readonly HookPluginRoot[]
  // Existing skill discovery, injected so the aggregator stays composition-only.
  discoverSkills: (args: { cwd?: string; homeDir?: string }) => Promise<SkillDiscoveryResult>
}

async function resolveMcpInspections(
  spec: AgentContextSourceSpec,
  deps: ResolveAgentContextDeps,
  cwd: string
): Promise<McpConfigInspection[]> {
  const inspections: McpConfigInspection[] = []

  const candidates = MCP_CONFIG_CANDIDATES.filter((candidate) =>
    spec.mcpFormats.includes(candidate.format)
  )
  for (const candidate of candidates) {
    const path = joinPath(deps.sep, cwd, candidate.relativePath)
    const content = await deps.fs.readText(path)
    inspections.push(inspectMcpConfigContent(candidate, content))
  }

  // JSON globals reuse the existing JSON inspector. TOML globals (Codex
  // config.toml) are not parsed in Phase 1 — the repo has no TOML parser and we
  // do not fabricate servers; the dimension is simply empty for those agents.
  const globalConfig = spec.mcpGlobalConfig
  if (globalConfig?.format === 'json') {
    const path = joinPath(deps.sep, deps.homeDir, globalConfig.path)
    const content = await deps.fs.readText(path)
    inspections.push(
      inspectMcpConfigContent(
        {
          format: 'claude',
          label: globalConfig.label,
          relativePath: globalConfig.path,
          serversPath: [...globalConfig.serversPath]
        },
        content
      )
    )
  }

  return inspections
}

function resolveHookSources(
  spec: AgentContextSourceSpec,
  deps: ResolveAgentContextDeps,
  cwd: string
): ResolvedHookConfigSource[] {
  const projectBase = deps.repoRoot ?? cwd
  return spec.hookConfigs.map((config) => ({
    ...config,
    absolutePath: joinPath(
      deps.sep,
      config.base === 'home' ? deps.homeDir : projectBase,
      config.path
    )
  }))
}

async function findDeadWrapperPaths(
  commands: readonly string[],
  fs: ContextFilesystem
): Promise<string[]> {
  const dead: string[] = []
  const checked = new Set<string>()
  for (const command of commands) {
    const scriptPath = extractWrapperScriptPath(command)
    if (!scriptPath || checked.has(scriptPath)) {
      continue
    }
    checked.add(scriptPath)
    const info = await fs.statFile(scriptPath)
    if (!info) {
      dead.push(scriptPath)
    }
  }
  return dead
}

export async function resolveAgentContext(
  args: ResolveAgentContextArgs,
  deps: ResolveAgentContextDeps
): Promise<ResolvedAgentContext> {
  const { agent, cwd, connectionId } = args
  const workspace = { path: cwd, connectionId }
  const spec = getAgentContextSources(agent)

  if (!spec) {
    return {
      agent,
      workspace,
      hasKnownSources: false,
      instructionFiles: [],
      skills: null,
      mcp: [],
      hooks: [],
      warnings: []
    }
  }

  const instructionFiles = spec.instruction
    ? await resolveInstructionFiles({
        spec: spec.instruction,
        homeDir: deps.homeDir,
        repoRoot: deps.repoRoot,
        cwd,
        fs: deps.fs,
        sep: deps.sep
      })
    : []

  let skills: SkillDiscoveryResult | null = null
  try {
    skills = await deps.discoverSkills({ cwd })
  } catch {
    skills = null
  }

  const mcp = await resolveMcpInspections(spec, deps, cwd)

  const { hooks, unreadableConfigs } = await resolveHooks({
    sources: resolveHookSources(spec, deps, cwd),
    fs: deps.fs,
    env: deps.env,
    pluginRoots: deps.pluginRoots,
    hostPlatform: deps.hostPlatform
  })

  const deadWrapperPaths = await findDeadWrapperPaths(
    hooks.map((hook) => hook.command),
    deps.fs
  )

  const warnings = computeContextWarnings({
    instructionFiles,
    hooks,
    mcpServers: mcp,
    skills: skills?.skills ?? [],
    homeDir: deps.homeDir,
    repoRoot: deps.repoRoot,
    unreadableConfigs,
    deadWrapperPaths
  })

  return {
    agent,
    workspace,
    hasKnownSources: true,
    instructionFiles,
    skills,
    mcp,
    hooks,
    warnings
  }
}
