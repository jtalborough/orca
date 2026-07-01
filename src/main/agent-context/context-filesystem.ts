// Minimal filesystem abstraction the context resolvers depend on, so they stay
// location-transparent (local or SSH) and trivially unit-testable with a fake.
// Adapters wrap node fs (local) or an IFilesystemProvider (SSH) into the same
// two-method surface: stat metadata + best-effort text read.

import { lstat, readFile, readlink, stat } from 'node:fs/promises'
import type { IFilesystemProvider } from '../providers/types'

export type ContextFileInfo = {
  bytes: number
  isSymlink: boolean
  // Resolved link target when isSymlink; absent otherwise.
  symlinkTarget?: string
}

export type ContextFilesystem = {
  // File metadata, or null when the path does not exist / is not statable.
  statFile(path: string): Promise<ContextFileInfo | null>
  // Text content, or null when missing/unreadable/binary. Never throws.
  readText(path: string): Promise<string | null>
}

export function createLocalContextFilesystem(): ContextFilesystem {
  return {
    async statFile(path) {
      let linkStat: Awaited<ReturnType<typeof lstat>>
      try {
        // lstat (not stat) so a symlinked instruction file (e.g. AGENTS.md →
        // CLAUDE.md) is detected instead of silently followed.
        linkStat = await lstat(path)
      } catch {
        return null
      }
      const isSymlink = linkStat.isSymbolicLink()
      if (!isSymlink) {
        return { bytes: linkStat.size, isSymlink: false }
      }
      // Report the symlink, but size from the followed target so the bytes
      // metadata reflects what the agent actually loads.
      let symlinkTarget: string | undefined
      let bytes = linkStat.size
      try {
        symlinkTarget = await readlink(path)
      } catch {
        // best effort — keep the symlink flag without a target
      }
      try {
        bytes = (await stat(path)).size
      } catch {
        // dangling symlink: keep the link's own size
      }
      return { bytes, isSymlink: true, symlinkTarget }
    },
    async readText(path) {
      try {
        return await readFile(path, 'utf-8')
      } catch {
        return null
      }
    }
  }
}

export function createSshContextFilesystem(provider: IFilesystemProvider): ContextFilesystem {
  return {
    async statFile(path) {
      // lstat is optional on the provider; fall back to stat where absent and
      // detect symlinks via realpath divergence so detection still degrades
      // gracefully on providers without lstat.
      const lstatFn = provider.lstat?.bind(provider) ?? provider.stat.bind(provider)
      let info: Awaited<ReturnType<IFilesystemProvider['stat']>>
      try {
        info = await lstatFn(path)
      } catch {
        return null
      }
      let isSymlink = info.type === 'symlink'
      let symlinkTarget: string | undefined
      if (!provider.lstat) {
        try {
          const real = await provider.realpath(path)
          if (real && real !== path) {
            isSymlink = true
            symlinkTarget = real
          }
        } catch {
          // ignore — treat as non-symlink
        }
      }
      if (!isSymlink) {
        return { bytes: info.size, isSymlink: false }
      }
      let bytes = info.size
      if (symlinkTarget === undefined) {
        try {
          symlinkTarget = await provider.realpath(path)
        } catch {
          // best effort
        }
      }
      try {
        bytes = (await provider.stat(path)).size
      } catch {
        // dangling — keep link size
      }
      return { bytes, isSymlink: true, symlinkTarget }
    },
    async readText(path) {
      try {
        const result = await provider.readFile(path)
        return result.isBinary ? null : result.content
      } catch {
        return null
      }
    }
  }
}
