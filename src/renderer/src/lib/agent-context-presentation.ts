// Pure formatting for the Agent Context Inspector: provenance/platform labels
// and gate badges. No React/DOM — unit-tested in agent-context-presentation.test.ts.

import type { HookProvenance } from '../../../shared/agent-hook-provenance'
import type { HookPlatform } from '../../../shared/agent-context-resolution'

export function provenanceLabel(provenance: HookProvenance, pluginName?: string): string {
  switch (provenance) {
    case 'orca':
      return 'Orca'
    case 'paseo':
      return 'Paseo'
    case 'superset':
      return 'Superset'
    case 'plugin':
      return pluginName ? `Plugin: ${pluginName}` : 'Plugin'
    case 'user':
      return 'User'
  }
}

// shadcn Badge variant role per provenance — reuses existing token roles only.
export function provenanceBadgeVariant(
  provenance: HookProvenance
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (provenance) {
    case 'orca':
      return 'default'
    case 'paseo':
    case 'superset':
      return 'secondary'
    case 'plugin':
      return 'outline'
    case 'user':
      return 'outline'
  }
}

export type GateBadge = {
  // '●' always-on, '◐' conditionally gated.
  symbol: string
  // True when the hook would fire in the evaluated environment.
  active: boolean
  // Gate variable names ($-prefixed) for the component to localize into a label.
  vars: string[]
}

// Pure shape only — the visible label is built and localized by the consumer so
// this stays unit-testable without an i18n runtime.
export function gateBadge(gatedOn: readonly string[], activeNow: boolean): GateBadge {
  if (gatedOn.length === 0) {
    return { symbol: '●', active: true, vars: [] }
  }
  return {
    symbol: activeNow ? '●' : '◐',
    active: activeNow,
    vars: gatedOn.map((name) => `$${name}`)
  }
}

export function platformLabel(platform: HookPlatform): string {
  switch (platform) {
    case 'all':
      return 'All platforms'
    case 'unix':
      return 'Unix'
    case 'windows':
      return 'Windows'
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const INSTRUCTION_LEVEL_LABELS: Record<string, string> = {
  global: 'Global',
  'project-root': 'Project root',
  intermediate: 'Intermediate',
  cwd: 'Working dir',
  'local-override': 'Local override'
}

export function instructionLevelLabel(level: string): string {
  return INSTRUCTION_LEVEL_LABELS[level] ?? level
}
