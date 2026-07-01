import { describe, expect, it } from 'vitest'

import {
  formatBytes,
  gateBadge,
  instructionLevelLabel,
  platformLabel,
  provenanceBadgeVariant,
  provenanceLabel
} from './agent-context-presentation'

describe('provenanceLabel', () => {
  it('labels each provenance, including a named plugin', () => {
    expect(provenanceLabel('orca')).toBe('Orca')
    expect(provenanceLabel('paseo')).toBe('Paseo')
    expect(provenanceLabel('superset')).toBe('Superset')
    expect(provenanceLabel('user')).toBe('User')
    expect(provenanceLabel('plugin', 'guard')).toBe('Plugin: guard')
    expect(provenanceLabel('plugin')).toBe('Plugin')
  })
})

describe('provenanceBadgeVariant', () => {
  it('maps Orca to the primary badge and user/plugin to outline', () => {
    expect(provenanceBadgeVariant('orca')).toBe('default')
    expect(provenanceBadgeVariant('user')).toBe('outline')
    expect(provenanceBadgeVariant('plugin')).toBe('outline')
  })
})

describe('gateBadge', () => {
  it('shows an always-on badge for an ungated hook', () => {
    const badge = gateBadge([], true)
    expect(badge).toMatchObject({ symbol: '●', active: true, vars: [] })
  })

  it('shows a satisfied gate as active with its vars', () => {
    const badge = gateBadge(['PASEO_TERMINAL_ID'], true)
    expect(badge.symbol).toBe('●')
    expect(badge.active).toBe(true)
    expect(badge.vars).toEqual(['$PASEO_TERMINAL_ID'])
  })

  it('shows an unsatisfied gate as conditional and dimmed', () => {
    const badge = gateBadge(['PASEO_TERMINAL_ID'], false)
    expect(badge.symbol).toBe('◐')
    expect(badge.active).toBe(false)
    expect(badge.vars).toEqual(['$PASEO_TERMINAL_ID'])
  })

  it('lists multiple gate vars', () => {
    expect(gateBadge(['A', 'B'], false).vars).toEqual(['$A', '$B'])
  })
})

describe('platformLabel + formatBytes + instructionLevelLabel', () => {
  it('labels platforms', () => {
    expect(platformLabel('all')).toBe('All platforms')
    expect(platformLabel('windows')).toBe('Windows')
  })

  it('formats byte sizes across thresholds', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(138)).toBe('138 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(205295)).toBe('200.5 KB')
  })

  it('labels instruction levels with a fallback', () => {
    expect(instructionLevelLabel('global')).toBe('Global')
    expect(instructionLevelLabel('local-override')).toBe('Local override')
    expect(instructionLevelLabel('mystery')).toBe('mystery')
  })
})
