import type { ResolvedHook } from '../../../../shared/agent-context-resolution'
import {
  gateBadge,
  platformLabel,
  provenanceBadgeVariant,
  provenanceLabel
} from '../../lib/agent-context-presentation'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Badge } from '../ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { OpenContextFileArgs } from './context-file-args'

function gateLabel(vars: string[], active: boolean): string {
  if (vars.length === 0) {
    return translate('agentContext.gate.always', 'Always fires')
  }
  const joined = vars.join(', ')
  return active
    ? translate('agentContext.gate.active', 'Active ({{vars}})', { vars: joined })
    : translate('agentContext.gate.gated', 'Only when {{vars}} is set', { vars: joined })
}

// One event's ordered hook chain. Each row: order index, provenance chip, gate
// badge (● always / ◐ only when $VAR), command (mono, truncated), platform.
// Rows whose gate is unsatisfied are dimmed.
export function HookEventChain({
  event,
  hooks,
  onOpenFile
}: {
  event: string
  hooks: ResolvedHook[]
  onOpenFile?: (args: OpenContextFileArgs) => void
}): React.JSX.Element {
  return (
    <div className="px-3 py-2">
      <div className="mb-1 font-mono text-[11px] font-semibold text-muted-foreground">{event}</div>
      <ol className="space-y-1">
        {hooks.map((hook, index) => {
          const badge = gateBadge(hook.gatedOn, hook.activeNow)
          return (
            <li
              key={`${event}-${index}`}
              className={cn(
                'flex items-center gap-2 rounded-sm px-1.5 py-1 text-xs',
                !badge.active && 'opacity-50'
              )}
            >
              <span className="w-4 shrink-0 text-right font-mono text-muted-foreground">
                {hook.order + 1}
              </span>
              <Badge
                variant={provenanceBadgeVariant(hook.provenance)}
                className="h-5 shrink-0 text-[10px]"
              >
                {provenanceLabel(hook.provenance, hook.pluginName)}
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0 cursor-default font-mono text-[11px] text-muted-foreground">
                    {badge.symbol}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  {gateLabel(badge.vars, badge.active)}
                </TooltipContent>
              </Tooltip>
              <button
                type="button"
                disabled={!onOpenFile}
                onClick={() => onOpenFile?.({ path: hook.source.path, language: 'json' })}
                title={`${hook.command}\n\nDefined in: ${hook.source.path}`}
                className={cn(
                  'min-w-0 flex-1 truncate text-left font-mono',
                  onOpenFile && 'hover:text-foreground hover:underline'
                )}
              >
                {hook.command}
              </button>
              {hook.platform !== 'all' ? (
                <Badge variant="outline" className="h-5 shrink-0 text-[10px]">
                  {platformLabel(hook.platform)}
                </Badge>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
