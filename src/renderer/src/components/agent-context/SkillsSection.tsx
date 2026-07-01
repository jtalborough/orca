import { BookOpen } from 'lucide-react'
import type { SkillDiscoveryResult } from '../../../../shared/skills'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '../ui/badge'
import { ContextSection } from './ContextSection'
import type { OpenContextFileArgs } from './context-file-args'

const sourceLabels: Record<string, string> = {
  home: 'User',
  repo: 'Project',
  bundled: 'Bundled',
  plugin: 'Plugin'
}

export function SkillsSection({
  skills,
  onOpenFile
}: {
  skills: SkillDiscoveryResult | null
  onOpenFile?: (args: OpenContextFileArgs) => void
}): React.JSX.Element {
  const list = skills?.skills ?? []
  return (
    <ContextSection
      title={translate('agentContext.skills.title', 'Skills')}
      count={list.length}
      icon={<BookOpen className="size-4" />}
      anchorId="agent-context-skills"
      defaultOpen={false}
    >
      {list.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">
          {translate('agentContext.skills.empty', 'No skills are visible here.')}
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {list.map((skill) => (
            <li key={skill.id} className="flex items-center gap-3 px-3 py-2 text-xs">
              <Badge variant="outline" className="h-5 shrink-0 text-[10px]">
                {sourceLabels[skill.sourceKind] ?? skill.sourceKind}
              </Badge>
              <button
                type="button"
                disabled={!onOpenFile}
                onClick={() => onOpenFile?.({ path: skill.skillFilePath, language: 'markdown' })}
                title={skill.skillFilePath}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-3 text-left',
                  onOpenFile && 'hover:underline'
                )}
              >
                <span className="min-w-0 shrink-0 truncate font-medium">{skill.name}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                  {skill.rootPath}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ContextSection>
  )
}
