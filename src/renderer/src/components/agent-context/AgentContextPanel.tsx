import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Maximize2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { ResolvedAgentContext } from '../../../../shared/agent-context-resolution'
import { AGENT_CONTEXT_SOURCES } from '../../../../shared/agent-context-sources'
import type { TuiAgent } from '../../../../shared/types'
import {
  getRepoIdFromWorktreeId,
  splitWorktreeIdForFilesystem
} from '../../../../shared/worktree-id'
import { getAgentLabel } from '../../lib/agent-catalog'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { ContextWarningsStrip } from './ContextWarningsStrip'
import { InstructionFilesSection } from './InstructionFilesSection'
import { HooksSection } from './HooksSection'
import { McpSection } from './McpSection'
import { SkillsSection } from './SkillsSection'
import { useOpenContextFile } from './use-open-context-file'

const KNOWN_AGENTS = (Object.keys(AGENT_CONTEXT_SOURCES) as TuiAgent[]).filter(
  (agent) => AGENT_CONTEXT_SOURCES[agent] !== null
)

function worktreePath(worktreeId: string): string {
  const parsed = splitWorktreeIdForFilesystem(worktreeId)
  if (parsed?.worktreePath) {
    return parsed.worktreePath
  }
  const idx = worktreeId.indexOf('::')
  return idx === -1 ? worktreeId : worktreeId.slice(idx + 2)
}

// Right-sidebar panel: follows the active worktree (like the file explorer) and
// resolves the picked agent's context there. Every resolved file is clickable to
// open a read-only preview (out-of-worktree config files can't use the sandboxed
// editor read).
export default function AgentContextPanel(): React.JSX.Element {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const repos = useAppStore((s) => s.repos)
  const openAgentContextPage = useAppStore((s) => s.openAgentContextPage)
  const mountedRef = useMountedRef()

  const [agent, setAgent] = useState<TuiAgent>(KNOWN_AGENTS[0] ?? 'claude')
  const [resolved, setResolved] = useState<ResolvedAgentContext | null>(null)
  const [loading, setLoading] = useState(false)

  const workspace = useMemo(() => {
    if (!activeWorktreeId) {
      return null
    }
    const repoId = getRepoIdFromWorktreeId(activeWorktreeId)
    const repo = repos.find((candidate) => candidate.id === repoId)
    return {
      worktreeId: activeWorktreeId,
      path: worktreePath(activeWorktreeId),
      connectionId: repo?.connectionId ?? null
    }
  }, [activeWorktreeId, repos])

  const openContextFile = useOpenContextFile(
    workspace?.worktreeId ?? null,
    workspace?.connectionId ?? null
  )

  const resolve = useCallback(async (): Promise<void> => {
    if (!workspace) {
      setResolved(null)
      return
    }
    setLoading(true)
    try {
      const next = await window.api.agentContext.resolve({
        agent,
        cwd: workspace.path,
        connectionId: workspace.connectionId
      })
      if (mountedRef.current) {
        setResolved(next)
      }
    } catch (error) {
      console.error('Failed to resolve agent context:', error)
      if (mountedRef.current) {
        toast.error(translate('agentContext.resolveFailed', 'Could not resolve agent context'))
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [agent, mountedRef, workspace])

  useEffect(() => {
    void resolve()
  }, [resolve])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Select value={agent} onValueChange={(value) => setAgent(value as TuiAgent)}>
          <SelectTrigger className="h-7 min-w-0 flex-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KNOWN_AGENTS.map((knownAgent) => (
              <SelectItem key={knownAgent} value={knownAgent}>
                {getAgentLabel(knownAgent)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void resolve()}
          disabled={loading || !workspace}
          aria-label={translate('agentContext.refresh', 'Refresh')}
        >
          <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={openAgentContextPage}
          aria-label={translate('agentContext.expand', 'Open full view')}
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </div>

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-2">
        {!workspace ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            {translate('agentContext.noWorkspace', 'Select a workspace to inspect.')}
          </p>
        ) : loading && !resolved ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : resolved && !resolved.hasKnownSources ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            {translate(
              'agentContext.noSources',
              'Orca has no documented context sources for this agent.'
            )}
          </p>
        ) : resolved ? (
          <div className="flex flex-col gap-2">
            <ContextWarningsStrip warnings={resolved.warnings} />
            <InstructionFilesSection
              files={resolved.instructionFiles}
              onOpenFile={openContextFile}
            />
            <HooksSection hooks={resolved.hooks} onOpenFile={openContextFile} />
            <McpSection
              inspections={resolved.mcp}
              workspacePath={workspace.path}
              onOpenFile={openContextFile}
            />
            <SkillsSection skills={resolved.skills} onOpenFile={openContextFile} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
