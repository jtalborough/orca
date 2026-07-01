import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '../ui/badge'

type ContextSectionProps = {
  title: string
  count: number
  icon: React.ReactNode
  defaultOpen?: boolean
  anchorId?: string
  children: React.ReactNode
}

// Collapsible dimension section. One per dimension (instruction files, skills,
// MCP, hooks). Uses documented tokens only; the count badge reuses the existing
// secondary badge role.
export function ContextSection({
  title,
  count,
  icon,
  defaultOpen = true,
  anchorId,
  children
}: ContextSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section id={anchorId} className="rounded-md border border-border/50 bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
        <Badge variant="secondary" className="h-5 text-[10px]">
          {count}
        </Badge>
      </button>
      <div className={cn('border-t border-border/50', open ? 'block' : 'hidden')}>{children}</div>
    </section>
  )
}
