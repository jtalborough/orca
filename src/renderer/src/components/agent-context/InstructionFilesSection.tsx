import { FileText } from 'lucide-react'
import type { ResolvedInstructionFile } from '../../../../shared/agent-context-resolution'
import { formatBytes, instructionLevelLabel } from '../../lib/agent-context-presentation'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { Badge } from '../ui/badge'
import { ContextSection } from './ContextSection'
import type { OpenContextFileArgs } from './context-file-args'

function stateBadge(file: ResolvedInstructionFile): React.JSX.Element {
  const variant = file.state === 'empty' ? 'destructive' : 'outline'
  const label =
    file.state === 'symlink'
      ? translate('agentContext.instruction.symlink', 'symlink')
      : file.state === 'empty'
        ? translate('agentContext.instruction.empty', 'empty')
        : translate('agentContext.instruction.present', 'present')
  return (
    <Badge variant={variant} className="h-5 text-[10px]">
      {label}
    </Badge>
  )
}

export function InstructionFilesSection({
  files,
  onOpenFile
}: {
  files: ResolvedInstructionFile[]
  onOpenFile?: (args: OpenContextFileArgs) => void
}): React.JSX.Element {
  return (
    <ContextSection
      title={translate('agentContext.instruction.title', 'Instruction files')}
      count={files.length}
      icon={<FileText className="size-4" />}
      anchorId="agent-context-instruction"
    >
      {files.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">
          {translate('agentContext.instruction.none', 'No instruction files load here.')}
        </p>
      ) : (
        <ol className="divide-y divide-border/50">
          {files.map((file, index) => (
            <li key={`${file.path}-${index}`} className="flex items-center gap-3 px-3 py-2 text-xs">
              <span className="w-6 shrink-0 text-right font-mono text-muted-foreground">
                {index + 1}
              </span>
              <Badge variant="outline" className="h-5 shrink-0 text-[10px]">
                {instructionLevelLabel(file.level)}
              </Badge>
              <button
                type="button"
                disabled={!onOpenFile}
                onClick={() => onOpenFile?.({ path: file.path })}
                title={file.path}
                className={cn(
                  'min-w-0 flex-1 truncate text-left font-mono',
                  onOpenFile && 'hover:text-foreground hover:underline'
                )}
              >
                {file.path}
              </button>
              {file.symlinkTarget ? (
                <span
                  className="hidden min-w-0 max-w-[30%] truncate text-muted-foreground md:inline"
                  title={file.symlinkTarget}
                >
                  → {file.symlinkTarget}
                </span>
              ) : null}
              <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                {formatBytes(file.bytes)}
              </span>
              {stateBadge(file)}
            </li>
          ))}
        </ol>
      )}
    </ContextSection>
  )
}
