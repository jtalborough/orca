import { useCallback } from 'react'
import { useAppStore } from '@/store'
import type { OpenContextFileArgs } from './context-file-args'

function basename(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? path
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  json: 'json',
  toml: 'toml',
  md: 'markdown',
  markdown: 'markdown',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell'
}

function languageForPath(path: string): string {
  const extension = basename(path).split('.').at(-1)?.toLowerCase() ?? ''
  return LANGUAGE_BY_EXTENSION[extension] ?? 'plaintext'
}

// Open a resolved context file in an editor tab. The file often lives outside
// the worktree (e.g. ~/.claude/settings.json), which the editor's read path
// sandboxes; clicking is explicit intent, so we authorize the specific path
// first (local only — remote reads go through the provider) then open the tab.
export function useOpenContextFile(
  worktreeId: string | null,
  connectionId: string | null
): (args: OpenContextFileArgs) => void {
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)
  const ensureWorktreeRootGroup = useAppStore((s) => s.ensureWorktreeRootGroup)
  const openFile = useAppStore((s) => s.openFile)
  const setRightSidebarTab = useAppStore((s) => s.setRightSidebarTab)

  return useCallback(
    ({ path, label, language }: OpenContextFileArgs) => {
      if (!worktreeId) {
        return
      }
      // Why: opening a file triggers Orca's reveal-on-open, which switches the
      // right sidebar to the file explorer. When the file is opened FROM the
      // Agent Context panel, keep that panel in view. A synchronous one-shot
      // store subscription reverts the tab the instant the reveal sets it —
      // before React renders (and mounts) the file explorer — so there is no
      // flicker and no mount/unmount race.
      const restoreInspectorPanel = useAppStore.getState().rightSidebarTab === 'agent-context'
      void (async () => {
        try {
          await window.api.agentContext.authorizeFile({ path, connectionId })
        } catch {
          // If authorization fails the editor will surface its own read error;
          // don't block the open attempt.
        }

        let unsubscribe: (() => void) | null = null
        if (restoreInspectorPanel) {
          unsubscribe = useAppStore.subscribe((state, prev) => {
            if (state.rightSidebarTab === 'explorer' && prev.rightSidebarTab !== 'explorer') {
              unsubscribe?.()
              unsubscribe = null
              setRightSidebarTab('agent-context')
            }
          })
          // Safety: stop listening shortly after the open so a later manual
          // switch to the explorer is never reverted.
          setTimeout(() => unsubscribe?.(), 500)
        }

        setActiveWorktree(worktreeId)
        const targetGroupId = ensureWorktreeRootGroup(worktreeId)
        openFile(
          {
            filePath: path,
            relativePath: label ?? basename(path),
            worktreeId,
            language: language ?? languageForPath(path),
            mode: 'edit'
          },
          // Pin each click as its own tab (not a reused preview tab) so opening
          // several resolved files accumulates them instead of replacing one.
          { targetGroupId, preview: false }
        )
      })()
    },
    [
      worktreeId,
      connectionId,
      setActiveWorktree,
      ensureWorktreeRootGroup,
      openFile,
      setRightSidebarTab
    ]
  )
}
