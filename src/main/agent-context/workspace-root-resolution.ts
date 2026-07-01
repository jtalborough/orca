// Find the repo root for a workspace by walking up from cwd looking for a
// `.git` entry, through the injected ContextFilesystem so SSH workspaces resolve
// their remote root. Returns null for a folder workspace with no repo (walk-up
// then stops at cwd in the instruction resolver).

import type { ContextFilesystem } from './context-filesystem'
import { joinPath } from './context-path'

function parentDir(path: string, sep: string): string | null {
  const segments = path.split(/[\\/]+/).filter((segment) => segment.length > 0)
  if (segments.length <= 1) {
    return null
  }
  segments.pop()
  const prefix = path.startsWith('/') ? sep : ''
  return prefix + segments.join(sep)
}

export async function resolveWorkspaceRepoRoot(
  fs: ContextFilesystem,
  cwd: string,
  sep: string,
  maxDepth = 64
): Promise<string | null> {
  let current: string | null = cwd
  let depth = 0
  while (current && depth < maxDepth) {
    // `.git` is a directory in a normal clone and a file in a linked worktree;
    // statFile returns non-null for either.
    const gitMarker = await fs.statFile(joinPath(sep, current, '.git'))
    if (gitMarker) {
      return current
    }
    current = parentDir(current, sep)
    depth++
  }
  return null
}
