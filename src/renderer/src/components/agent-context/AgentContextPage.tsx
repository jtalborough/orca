import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Layers, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { ResolvedAgentContext } from '../../../../shared/agent-context-resolution'
import { AGENT_CONTEXT_SOURCES } from '../../../../shared/agent-context-sources'
import type { TuiAgent } from '../../../../shared/types'
import { splitWorktreeIdForFilesystem } from '../../../../shared/worktree-id'
import { getAgentLabel } from '../../lib/agent-catalog'
import { useAppStore } from '../../store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { ContextWarningsStrip } from './ContextWarningsStrip'
import { InstructionFilesSection } from './InstructionFilesSection'
import { SkillsSection } from './SkillsSection'
import { McpSection } from './McpSection'
import { HooksSection } from './HooksSection'
import { useOpenContextFile } from './use-open-context-file'

type WorkspaceOption = {
  worktreeId: string
  label: string
  path: string
  connectionId: string | null
}

// Agents Orca has documented context sources for; others render an explicit
// "no known sources" state so the picker stays small and meaningful.
const KNOWN_AGENTS = (Object.keys(AGENT_CONTEXT_SOURCES) as TuiAgent[]).filter(
  (agent) => AGENT_CONTEXT_SOURCES[agent] !== null
)

function worktreePath(worktreeId: string): string {
  const parsed = splitWorktreeIdForFilesystem(worktreeId)
  if (parsed?.worktreePath) {
    return parsed.worktreePath
  }
  const separatorIndex = worktreeId.indexOf('::')
  return separatorIndex === -1 ? worktreeId : worktreeId.slice(separatorIndex + 2)
}

export default function AgentContextPage(): React.JSX.Element {
  const closeAgentContextPage = useAppStore((state) => state.closeAgentContextPage)
  const repos = useAppStore((state) => state.repos)
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const mountedRef = useMountedRef()

  const workspaces = useMemo<WorkspaceOption[]>(() => {
    const options: WorkspaceOption[] = []
    for (const repo of repos) {
      for (const worktree of worktreesByRepo[repo.id] ?? []) {
        options.push({
          worktreeId: worktree.id,
          label: `${repo.path.split(/[\\/]/).filter(Boolean).pop() ?? repo.path} / ${worktree.displayName}`,
          path: worktreePath(worktree.id),
          connectionId: repo.connectionId ?? null
        })
      }
    }
    return options
  }, [repos, worktreesByRepo])

  const [agent, setAgent] = useState<TuiAgent>(KNOWN_AGENTS[0] ?? 'claude')
  const [worktreeId, setWorktreeId] = useState<string | null>(
    activeWorktreeId ?? workspaces[0]?.worktreeId ?? null
  )
  const [resolved, setResolved] = useState<ResolvedAgentContext | null>(null)
  const [loading, setLoading] = useState(false)

  const selectedWorkspace = workspaces.find((option) => option.worktreeId === worktreeId) ?? null
  const openContextFile = useOpenContextFile(
    selectedWorkspace?.worktreeId ?? null,
    selectedWorkspace?.connectionId ?? null
  )

  const resolve = useCallback(async (): Promise<void> => {
    if (!selectedWorkspace) {
      return
    }
    setLoading(true)
    try {
      const next = await window.api.agentContext.resolve({
        agent,
        cwd: selectedWorkspace.path,
        connectionId: selectedWorkspace.connectionId
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
  }, [agent, mountedRef, selectedWorkspace])

  useEffect(() => {
    void resolve()
  }, [resolve])

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={closeAgentContextPage}
          className="shrink-0 gap-1.5"
        >
          <ArrowLeft className="size-3.5" />
          {translate('agentContext.back', 'Back')}
        </Button>
        <Layers className="size-4 text-muted-foreground" />
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold">
            {translate('agentContext.title', 'Agent Context Inspector')}
          </h1>
          <Badge variant="secondary">{translate('agentContext.beta', 'Beta')}</Badge>
        </div>
      </header>

      <section className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <Select value={agent} onValueChange={(value) => setAgent(value as TuiAgent)}>
          <SelectTrigger className="h-8 w-[180px]">
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
        <Select
          value={worktreeId ?? undefined}
          onValueChange={(value) => setWorktreeId(value)}
          disabled={workspaces.length === 0}
        >
          <SelectTrigger className="h-8 w-[280px]">
            <SelectValue
              placeholder={translate('agentContext.pickWorkspace', 'Select a workspace')}
            />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((option) => (
              <SelectItem key={option.worktreeId} value={option.worktreeId}>
                {option.label}
                {option.connectionId ? ` · ${option.connectionId}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={loading || !selectedWorkspace}
          onClick={() => void resolve()}
        >
          <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
          {translate('agentContext.refresh', 'Refresh')}
        </Button>
      </section>

      <section className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          {!selectedWorkspace ? (
            <EmptyState
              message={translate('agentContext.noWorkspace', 'Select a workspace to inspect.')}
            />
          ) : loading && !resolved ? (
            <EmptyState
              loading
              message={translate('agentContext.resolving', 'Resolving context…')}
            />
          ) : resolved && !resolved.hasKnownSources ? (
            <EmptyState
              message={translate(
                'agentContext.noSources',
                'Orca has no documented context sources for this agent.'
              )}
            />
          ) : resolved ? (
            <>
              <ContextWarningsStrip warnings={resolved.warnings} />
              <InstructionFilesSection
                files={resolved.instructionFiles}
                onOpenFile={openContextFile}
              />
              <HooksSection hooks={resolved.hooks} onOpenFile={openContextFile} />
              <McpSection
                inspections={resolved.mcp}
                workspacePath={selectedWorkspace.path}
                onOpenFile={openContextFile}
              />
              <SkillsSection skills={resolved.skills} onOpenFile={openContextFile} />
            </>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function EmptyState({
  message,
  loading
}: {
  message: string
  loading?: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {loading ? (
          <Loader2 className="size-7 animate-spin text-muted-foreground" />
        ) : (
          <Layers className="size-7 text-muted-foreground" />
        )}
        <p className="text-xs leading-5 text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
