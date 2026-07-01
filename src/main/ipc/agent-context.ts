import { ipcMain } from 'electron'
import { homedir } from 'node:os'
import { sep as localPathSep } from 'node:path'

import type {
  AuthorizeContextFileArgs,
  ResolveAgentContextArgs,
  ResolvedAgentContext
} from '../../shared/agent-context-resolution'
import { authorizeExternalPath } from './filesystem-auth'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree-id'
import {
  createLocalContextFilesystem,
  createSshContextFilesystem,
  type ContextFilesystem
} from '../agent-context/context-filesystem'
import {
  resolveAgentContext,
  type ResolveAgentContextDeps
} from '../agent-context/resolve-agent-context'
import { resolveWorkspaceRepoRoot } from '../agent-context/workspace-root-resolution'
import { discoverSkills } from '../skills/discovery'
import { getActiveMultiplexer } from './ssh'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'

// Resolve the (possibly remote) home directory for a connection. Local uses the
// process home; remote asks the SSH multiplexer to expand `~`.
async function resolveHomeDir(connectionId: string | null): Promise<string> {
  if (!connectionId) {
    return homedir()
  }
  try {
    const mux = getActiveMultiplexer(connectionId)
    if (!mux || mux.isDisposed?.()) {
      return homedir()
    }
    const result = (await mux.request('session.resolveHome', { path: '~' })) as {
      resolvedPath?: unknown
    }
    if (typeof result.resolvedPath === 'string' && result.resolvedPath.trim()) {
      return result.resolvedPath.trim().replace(/\/$/, '')
    }
  } catch {
    // Fall through to local home as a last resort.
  }
  return homedir()
}

function buildDepsBase(
  connectionId: string | null,
  fs: ContextFilesystem,
  homeDir: string
): Omit<ResolveAgentContextDeps, 'repoRoot'> {
  const isLocal = connectionId === null
  return {
    fs,
    homeDir,
    // SSH hosts are treated as posix; local follows the running OS.
    hostPlatform: isLocal && process.platform === 'win32' ? 'windows' : 'unix',
    sep: isLocal ? localPathSep : '/',
    // Remote per-terminal env is not available to the inspector; gates on
    // launch-time vars read inactive for SSH (documented on ResolvedHook).
    env: isLocal ? process.env : {},
    discoverSkills: (args) => discoverSkills(args)
  }
}

function buildFilesystem(connectionId: string | null): ContextFilesystem {
  if (!connectionId) {
    return createLocalContextFilesystem()
  }
  const provider = getSshFilesystemProvider(connectionId)
  if (!provider) {
    throw new Error(`No filesystem provider for connection ${connectionId}`)
  }
  return createSshContextFilesystem(provider)
}

export function registerAgentContextHandlers(): void {
  ipcMain.handle(
    'agent-context:resolve',
    async (_event, args: ResolveAgentContextArgs): Promise<ResolvedAgentContext> => {
      const connectionId = args.connectionId
      // Folder sessions carry a UUID suffix on the worktree id; recover the real path.
      const cwd = splitWorktreeIdForFilesystem(args.cwd)?.worktreePath ?? args.cwd

      const fs = buildFilesystem(connectionId)
      const homeDir = await resolveHomeDir(connectionId)
      const base = buildDepsBase(connectionId, fs, homeDir)
      const repoRoot = await resolveWorkspaceRepoRoot(fs, cwd, base.sep)

      return resolveAgentContext({ agent: args.agent, cwd, connectionId }, { ...base, repoRoot })
    }
  )

  // Authorize a resolved config file for the editor's read path so clicking it
  // in the inspector can open it in a real tab, even when it lives outside the
  // worktree (e.g. ~/.claude/settings.json). Mirrors the explicit-open pattern
  // in app.ts (pick-file → authorizeExternalPath). Local only: remote reads go
  // through the SSH provider and are not subject to the local sandbox.
  ipcMain.handle(
    'agent-context:authorize-file',
    async (_event, args: AuthorizeContextFileArgs): Promise<void> => {
      if (!args.connectionId) {
        authorizeExternalPath(args.path)
      }
    }
  )
}
