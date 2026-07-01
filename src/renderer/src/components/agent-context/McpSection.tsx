import { Server } from 'lucide-react'
import { toast } from 'sonner'
import type { McpConfigInspection } from '../../../../shared/mcp-config'
import { joinPath } from '../../lib/path'
import { translate } from '@/i18n/i18n'
import { ContextSection } from './ContextSection'
import { McpConfigFileRow, type LoadedMcpConfigInspection } from '../settings/McpConfigFileRow'
import type { OpenContextFileArgs } from './context-file-args'

// Reuses McpConfigFileRow verbatim. The resolved inspections carry the relative
// path on the candidate; join it to the workspace path for display/reveal.
export function McpSection({
  inspections,
  workspacePath,
  onOpenFile
}: {
  inspections: McpConfigInspection[]
  workspacePath: string
  onOpenFile?: (args: OpenContextFileArgs) => void
}): React.JSX.Element {
  const rows: LoadedMcpConfigInspection[] = inspections.map((inspection) => ({
    ...inspection,
    absolutePath: joinPath(workspacePath, inspection.candidate.relativePath)
  }))
  const present = rows.filter((row) => row.exists || row.status === 'invalid')
  const serverCount = rows.reduce((sum, row) => sum + row.servers.length, 0)

  const handleOpen = (config: LoadedMcpConfigInspection): void => {
    if (onOpenFile) {
      onOpenFile({ path: config.absolutePath, language: 'json' })
      return
    }
    void window.api.shell.openInFileManager(config.absolutePath).then((result) => {
      if (!result.ok) {
        toast.error(translate('agentContext.mcp.revealFailed', 'Could not reveal config file'))
      }
    })
  }

  return (
    <ContextSection
      title={translate('agentContext.mcp.title', 'MCP servers')}
      count={serverCount}
      icon={<Server className="size-4" />}
      anchorId="agent-context-mcp"
      defaultOpen={false}
    >
      {present.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">
          {translate('agentContext.mcp.empty', 'No MCP config files resolve here.')}
        </p>
      ) : (
        <div className="divide-y divide-border/50">
          {present.map((row) => (
            <McpConfigFileRow key={row.candidate.relativePath} config={row} onOpen={handleOpen} />
          ))}
        </div>
      )}
    </ContextSection>
  )
}
