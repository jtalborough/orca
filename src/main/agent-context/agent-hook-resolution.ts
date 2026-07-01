// Read each agent hook config, flatten it to per-event ordered entries, and
// label every entry with provenance, env gating, active state, and platform.
// Handles the real on-disk shapes: the Claude/Codex/Gemini nested
// `{hooks:[{command, commandWindows?, timeout?}]}` form, Cursor's flat
// `{command}` form, and Orca's bash/powershell direct keys. Static only — never
// executes a hook.

import {
  classifyHookProvenance,
  parseHookEnvGates,
  type HookPluginRoot
} from '../../shared/agent-hook-provenance'
import type { HookPlatform, ResolvedHook } from '../../shared/agent-context-resolution'
import type { HookConfigSourceSpec } from '../../shared/agent-context-sources'
import type { ContextFilesystem } from './context-filesystem'

export type ResolvedHookConfigSource = HookConfigSourceSpec & { absolutePath: string }

export type ResolveHooksArgs = {
  sources: readonly ResolvedHookConfigSource[]
  fs: ContextFilesystem
  // Environment the gates are evaluated against (see ResolvedHook.activeNow note).
  env: Record<string, string | undefined>
  pluginRoots?: readonly HookPluginRoot[]
  // The inspected workspace's host OS — picks the command/commandWindows or
  // bash/powershell variant that would actually run there.
  hostPlatform?: 'unix' | 'windows'
}

export type ResolveHooksResult = {
  hooks: ResolvedHook[]
  // Absolute paths of config files that exist but failed to parse.
  unreadableConfigs: string[]
}

type CommandVariant = { command: string; platform: HookPlatform; timeoutSeconds?: number }

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

// Pick the platform-appropriate form when both a unix and windows variant of the
// same hook are present, so the inactive-OS variant is not double-counted.
function chooseVariant(
  unix: string | undefined,
  windows: string | undefined,
  hostPlatform: 'unix' | 'windows',
  timeoutSeconds: number | undefined
): CommandVariant | null {
  if (unix && windows) {
    return hostPlatform === 'windows'
      ? { command: windows, platform: 'windows', timeoutSeconds }
      : { command: unix, platform: 'unix', timeoutSeconds }
  }
  if (unix) {
    return { command: unix, platform: 'all', timeoutSeconds }
  }
  if (windows) {
    return { command: windows, platform: 'windows', timeoutSeconds }
  }
  return null
}

// Extract the runnable command variants from one hook definition, across both
// the nested `hooks: [...]` shape and the direct command/bash/powershell keys.
function extractVariants(
  definition: Record<string, unknown>,
  hostPlatform: 'unix' | 'windows'
): CommandVariant[] {
  const variants: CommandVariant[] = []
  const nested = definition.hooks
  if (Array.isArray(nested)) {
    for (const entry of nested) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const raw = entry as Record<string, unknown>
      const variant = chooseVariant(
        asString(raw.command),
        asString(raw.commandWindows),
        hostPlatform,
        asNumber(raw.timeout)
      )
      if (variant) {
        variants.push(variant)
      }
    }
  }

  // Direct top-level command (Cursor's documented shape) — cross-platform.
  const directCommand = asString(definition.command)
  if (directCommand) {
    variants.push({
      command: directCommand,
      platform: 'all',
      timeoutSeconds: asNumber(definition.timeout)
    })
  }

  // Orca's bash/powershell pair on the definition itself.
  const bashWindows = chooseVariant(
    asString(definition.bash),
    asString(definition.powershell),
    hostPlatform,
    asNumber(definition.timeout)
  )
  if (bashWindows && (definition.bash || definition.powershell)) {
    variants.push(bashWindows)
  }

  return variants
}

function parseHooksEnvelope(content: string): Record<string, unknown[]> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') {
    return null
  }
  const hooks = (parsed as Record<string, unknown>).hooks
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
    // A config with no `hooks` map (or `{hooks:{}}`) is valid and simply empty.
    return {}
  }
  const result: Record<string, unknown[]> = {}
  for (const [event, definitions] of Object.entries(hooks as Record<string, unknown>)) {
    if (Array.isArray(definitions)) {
      result[event] = definitions
    }
  }
  return result
}

export async function resolveHooks(args: ResolveHooksArgs): Promise<ResolveHooksResult> {
  const hostPlatform = args.hostPlatform ?? 'unix'
  const hooks: ResolvedHook[] = []
  const unreadableConfigs: string[] = []

  for (const source of args.sources) {
    const content = await args.fs.readText(source.absolutePath)
    if (content === null) {
      // Missing config file is normal, not an error.
      continue
    }
    const envelope = parseHooksEnvelope(content)
    if (envelope === null) {
      unreadableConfigs.push(source.absolutePath)
      continue
    }

    for (const [event, definitions] of Object.entries(envelope)) {
      let order = 0
      for (const definition of definitions) {
        if (!definition || typeof definition !== 'object') {
          continue
        }
        const raw = definition as Record<string, unknown>
        const matcher = asString(raw.matcher) ?? null
        for (const variant of extractVariants(raw, hostPlatform)) {
          const { provenance, pluginName } = classifyHookProvenance(variant.command, {
            pluginRoots: args.pluginRoots
          })
          const gatedOn = parseHookEnvGates(variant.command)
          hooks.push({
            event,
            order: order++,
            matcher,
            command: variant.command,
            provenance,
            ...(pluginName ? { pluginName } : {}),
            gatedOn,
            activeNow: gatedOn.every((variableName) => args.env[variableName] != null),
            source: { path: source.absolutePath, level: source.level },
            ...(variant.timeoutSeconds != null ? { timeoutSeconds: variant.timeoutSeconds } : {}),
            platform: variant.platform
          })
        }
      }
    }
  }

  return { hooks, unreadableConfigs }
}
