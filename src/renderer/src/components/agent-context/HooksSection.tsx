import { useMemo } from 'react'
import { Webhook } from 'lucide-react'
import type { ResolvedHook } from '../../../../shared/agent-context-resolution'
import { translate } from '@/i18n/i18n'
import { ContextSection } from './ContextSection'
import { HookEventChain } from './HookEventChain'
import type { OpenContextFileArgs } from './context-file-args'

// Group hooks by event, preserving each event's first-seen order and each
// chain's internal order.
function groupByEvent(hooks: ResolvedHook[]): { event: string; hooks: ResolvedHook[] }[] {
  const order: string[] = []
  const byEvent = new Map<string, ResolvedHook[]>()
  for (const hook of hooks) {
    if (!byEvent.has(hook.event)) {
      byEvent.set(hook.event, [])
      order.push(hook.event)
    }
    byEvent.get(hook.event)!.push(hook)
  }
  return order.map((event) => ({
    event,
    hooks: [...byEvent.get(event)!].sort((a, b) => a.order - b.order)
  }))
}

export function HooksSection({
  hooks,
  onOpenFile
}: {
  hooks: ResolvedHook[]
  onOpenFile?: (args: OpenContextFileArgs) => void
}): React.JSX.Element {
  const groups = useMemo(() => groupByEvent(hooks), [hooks])
  return (
    <ContextSection
      title={translate('agentContext.hooks.title', 'Hooks')}
      count={hooks.length}
      icon={<Webhook className="size-4" />}
      anchorId="agent-context-hooks"
    >
      {groups.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">
          {translate('agentContext.hooks.empty', 'No hooks fire for this agent here.')}
        </p>
      ) : (
        <div className="divide-y divide-border/50">
          {groups.map((group) => (
            <HookEventChain
              key={group.event}
              event={group.event}
              hooks={group.hooks}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </ContextSection>
  )
}
