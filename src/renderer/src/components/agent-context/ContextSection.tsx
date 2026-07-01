import { useCallback, useState } from 'react'
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

// Why: the panel remounts every time it is reopened, so section collapse state
// must be persisted or it resets to the default each visit. Keyed by anchorId
// so each dimension remembers its own open/closed state across navigation and
// restarts.
function collapseStorageKey(anchorId: string | undefined): string | null {
  return anchorId ? `agentContext.section.${anchorId}.open` : null
}

function readPersistedOpen(anchorId: string | undefined, fallback: boolean): boolean {
  const key = collapseStorageKey(anchorId)
  if (!key) {
    return fallback
  }
  try {
    const stored = window.localStorage.getItem(key)
    if (stored === 'true') {
      return true
    }
    if (stored === 'false') {
      return false
    }
  } catch {
    // localStorage may be unavailable; fall back to the default.
  }
  return fallback
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
  const [open, setOpen] = useState(() => readPersistedOpen(anchorId, defaultOpen))
  const toggle = useCallback(() => {
    setOpen((value) => {
      const next = !value
      const key = collapseStorageKey(anchorId)
      if (key) {
        try {
          window.localStorage.setItem(key, String(next))
        } catch {
          // best effort — persistence is a nicety, not required
        }
      }
      return next
    })
  }, [anchorId])
  return (
    <section id={anchorId} className="rounded-md border border-border/50 bg-muted/20">
      <button
        type="button"
        onClick={toggle}
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
