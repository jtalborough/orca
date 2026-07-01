import { AlertTriangle } from 'lucide-react'
import type { ContextWarning } from '../../../../shared/agent-context-resolution'
import { translate } from '@/i18n/i18n'

const DIMENSION_ANCHORS: Record<string, string> = {
  instruction: 'agent-context-instruction',
  skills: 'agent-context-skills',
  mcp: 'agent-context-mcp',
  hooks: 'agent-context-hooks'
}

// Each warning deep-links to its dimension section by scrolling the anchor into view.
export function ContextWarningsStrip({
  warnings
}: {
  warnings: ContextWarning[]
}): React.JSX.Element | null {
  if (warnings.length === 0) {
    return null
  }
  return (
    <div className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/10 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-destructive">
        <AlertTriangle className="size-3.5" />
        {translate('agentContext.warnings.title', 'Resolution warnings')} ({warnings.length})
      </div>
      <ul className="space-y-1">
        {warnings.map((warning, index) => (
          <li key={`${warning.kind}-${index}`}>
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById(DIMENSION_ANCHORS[warning.dimension])
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="w-full truncate text-left text-xs text-destructive/90 hover:underline"
              title={warning.message}
            >
              {warning.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
