// Resolve which instruction files (CLAUDE.md / AGENTS.md / GEMINI.md class) an
// agent loads for a given (workspace, agent), in load order, with level + size
// + present/empty/symlink/missing state. This is the one resolver with no
// existing analog in Orca. All filesystem access goes through an injected
// ContextFilesystem so SSH workspaces resolve their remote files.

import type {
  InstructionLevel,
  ResolvedInstructionFile
} from '../../shared/agent-context-resolution'
import type { InstructionSourceSpec } from '../../shared/agent-context-sources'
import type { ContextFilesystem } from './context-filesystem'
import { joinPath } from './context-path'

export type ResolveInstructionFilesArgs = {
  spec: InstructionSourceSpec
  homeDir: string
  // Repo root (top of the walk-up). null for a folder workspace with no repo.
  repoRoot: string | null
  // Working directory the agent launches in.
  cwd: string
  fs: ContextFilesystem
  // Path separator for THIS workspace's host: '/' for SSH/posix, '\\' for local
  // Windows. Defaults to '/'.
  sep?: string
}

function splitSegments(path: string): string[] {
  return path.split(/[\\/]+/).filter((segment) => segment.length > 0)
}

// Ordered directories from repoRoot down to cwd (inclusive). Falls back to
// [cwd] when cwd is not nested under repoRoot or there is no repo root.
function directoryChain(repoRoot: string | null, cwd: string, sep: string): string[] {
  if (!repoRoot) {
    return [cwd]
  }
  const rootSegments = splitSegments(repoRoot)
  const cwdSegments = splitSegments(cwd)
  const nested =
    cwdSegments.length >= rootSegments.length &&
    rootSegments.every((segment, index) => cwdSegments[index] === segment)
  if (!nested) {
    return [cwd]
  }
  const prefix = repoRoot.startsWith('/') ? sep : ''
  const chain: string[] = []
  for (let depth = rootSegments.length; depth <= cwdSegments.length; depth++) {
    chain.push(prefix + cwdSegments.slice(0, depth).join(sep))
  }
  return chain
}

// repoRoot → 'project-root', cwd → 'cwd', anything between → 'intermediate'.
// When the chain is a single dir (repoRoot === cwd, or no repo), call it
// 'project-root' if there is a repo, else 'cwd'.
function levelForDirectory(
  index: number,
  chainLength: number,
  hasRepoRoot: boolean
): InstructionLevel {
  if (chainLength === 1) {
    return hasRepoRoot ? 'project-root' : 'cwd'
  }
  if (index === 0) {
    return 'project-root'
  }
  if (index === chainLength - 1) {
    return 'cwd'
  }
  return 'intermediate'
}

async function resolveFile(
  fs: ContextFilesystem,
  path: string,
  level: InstructionLevel
): Promise<ResolvedInstructionFile | null> {
  const info = await fs.statFile(path)
  if (!info) {
    return null
  }
  if (info.isSymlink) {
    return {
      path,
      level,
      bytes: info.bytes,
      state: 'symlink',
      symlinkTarget: info.symlinkTarget
    }
  }
  return {
    path,
    level,
    bytes: info.bytes,
    state: info.bytes === 0 ? 'empty' : 'present'
  }
}

export async function resolveInstructionFiles(
  args: ResolveInstructionFilesArgs
): Promise<ResolvedInstructionFile[]> {
  const { spec, homeDir, repoRoot, cwd, fs } = args
  const sep = args.sep ?? '/'
  const resolved: ResolvedInstructionFile[] = []

  // 1. Global instruction file, then any extra global files (e.g. memories).
  if (spec.globalPath) {
    const file = await resolveFile(fs, joinPath(sep, homeDir, spec.globalPath), 'global')
    if (file) {
      resolved.push(file)
    }
  }
  for (const extra of spec.extraGlobalFiles ?? []) {
    const file = await resolveFile(fs, joinPath(sep, homeDir, extra), 'global')
    if (file) {
      resolved.push(file)
    }
  }

  // 2. Project instruction files from repo root down to cwd (or cwd only).
  const chain = args.spec.walkUp ? directoryChain(repoRoot, cwd, sep) : [cwd]
  for (let index = 0; index < chain.length; index++) {
    const level = levelForDirectory(index, chain.length, repoRoot !== null)
    for (const filename of spec.projectFilenames) {
      const file = await resolveFile(fs, joinPath(sep, chain[index], filename), level)
      if (file) {
        resolved.push(file)
      }
    }
  }

  // 3. Local overrides (loaded last), across the same directory chain.
  for (const dir of chain) {
    for (const filename of spec.localOverrideFilenames ?? []) {
      const file = await resolveFile(fs, joinPath(sep, dir, filename), 'local-override')
      if (file) {
        resolved.push(file)
      }
    }
  }

  return resolved
}
