import { describe, expect, it } from 'vitest'

import type { InstructionSourceSpec } from '../../shared/agent-context-sources'
import type { ContextFilesystem, ContextFileInfo } from './context-filesystem'
import { resolveInstructionFiles } from './instruction-file-resolution'

// A fake filesystem keyed by absolute path. A value of `null` means "exists but
// could not produce info" is not modeled; absence from the map means missing.
function fakeFs(files: Record<string, ContextFileInfo>): ContextFilesystem {
  return {
    async statFile(path) {
      return files[path] ?? null
    },
    async readText() {
      return null
    }
  }
}

const present = (bytes: number): ContextFileInfo => ({ bytes, isSymlink: false })

const CLAUDE_SPEC: InstructionSourceSpec = {
  globalPath: '.claude/CLAUDE.md',
  projectFilenames: ['CLAUDE.md'],
  walkUp: true,
  localOverrideFilenames: ['CLAUDE.local.md']
}

describe('resolveInstructionFiles', () => {
  it('resolves global → project-root → intermediate → cwd → local-override in load order', async () => {
    const fs = fakeFs({
      '/home/.claude/CLAUDE.md': present(100),
      '/repo/CLAUDE.md': present(200),
      '/repo/pkg/CLAUDE.md': present(50),
      '/repo/pkg/app/CLAUDE.md': present(25),
      '/repo/CLAUDE.local.md': present(10)
    })
    const result = await resolveInstructionFiles({
      spec: CLAUDE_SPEC,
      homeDir: '/home',
      repoRoot: '/repo',
      cwd: '/repo/pkg/app',
      fs
    })
    expect(result.map((file) => [file.level, file.path])).toEqual([
      ['global', '/home/.claude/CLAUDE.md'],
      ['project-root', '/repo/CLAUDE.md'],
      ['intermediate', '/repo/pkg/CLAUDE.md'],
      ['cwd', '/repo/pkg/app/CLAUDE.md'],
      ['local-override', '/repo/CLAUDE.local.md']
    ])
  })

  it('with walkUp false, resolves only global + cwd', async () => {
    const fs = fakeFs({
      '/home/.claude/CLAUDE.md': present(100),
      '/repo/CLAUDE.md': present(200),
      '/repo/pkg/CLAUDE.md': present(50)
    })
    const result = await resolveInstructionFiles({
      spec: { ...CLAUDE_SPEC, walkUp: false },
      homeDir: '/home',
      repoRoot: '/repo',
      cwd: '/repo/pkg',
      fs
    })
    expect(result.map((file) => file.path)).toEqual([
      '/home/.claude/CLAUDE.md',
      '/repo/pkg/CLAUDE.md'
    ])
  })

  it('distinguishes empty (0 bytes) from missing global', async () => {
    const fs = fakeFs({ '/home/.claude/CLAUDE.md': present(0) })
    const result = await resolveInstructionFiles({
      spec: CLAUDE_SPEC,
      homeDir: '/home',
      repoRoot: null,
      cwd: '/folder',
      fs
    })
    expect(result).toHaveLength(1)
    expect(result[0].state).toBe('empty')
  })

  it('reports a symlinked instruction file as symlink with its target', async () => {
    const fs = fakeFs({
      '/folder/AGENTS.md': { bytes: 138, isSymlink: true, symlinkTarget: '/folder/CLAUDE.md' }
    })
    const result = await resolveInstructionFiles({
      spec: { globalPath: null, projectFilenames: ['AGENTS.md'], walkUp: true },
      homeDir: '/home',
      repoRoot: null,
      cwd: '/folder',
      fs
    })
    expect(result[0].state).toBe('symlink')
    expect(result[0].symlinkTarget).toBe('/folder/CLAUDE.md')
  })

  it('folder workspace (no repo root) resolves global + cwd, level cwd', async () => {
    const fs = fakeFs({
      '/home/.claude/CLAUDE.md': present(100),
      '/folder/CLAUDE.md': present(40)
    })
    const result = await resolveInstructionFiles({
      spec: CLAUDE_SPEC,
      homeDir: '/home',
      repoRoot: null,
      cwd: '/folder',
      fs
    })
    expect(result.map((file) => file.level)).toEqual(['global', 'cwd'])
  })

  it('appends extra global files (codex memories) after the global', async () => {
    const fs = fakeFs({
      '/home/.codex/AGENTS.md': present(0),
      '/home/.codex/memories/MEMORY.md': present(205295)
    })
    const result = await resolveInstructionFiles({
      spec: {
        globalPath: '.codex/AGENTS.md',
        projectFilenames: ['AGENTS.md'],
        walkUp: true,
        extraGlobalFiles: ['.codex/memories/MEMORY.md']
      },
      homeDir: '/home',
      repoRoot: null,
      cwd: '/folder',
      fs
    })
    expect(result.map((file) => file.path)).toEqual([
      '/home/.codex/AGENTS.md',
      '/home/.codex/memories/MEMORY.md'
    ])
  })

  it('resolves remote (SSH) paths from the injected provider, never local fs', async () => {
    // The fake stands in for an SSH provider; absolute remote paths only.
    const fs = fakeFs({
      '/remote/home/.claude/CLAUDE.md': present(70),
      '/remote/repo/CLAUDE.md': present(80)
    })
    const result = await resolveInstructionFiles({
      spec: CLAUDE_SPEC,
      homeDir: '/remote/home',
      repoRoot: '/remote/repo',
      cwd: '/remote/repo',
      fs,
      sep: '/'
    })
    expect(result.map((file) => file.path)).toEqual([
      '/remote/home/.claude/CLAUDE.md',
      '/remote/repo/CLAUDE.md'
    ])
    // Single-dir chain under a repo root is labeled project-root.
    expect(result[1].level).toBe('project-root')
  })
})
