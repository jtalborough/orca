// Path joining that works for both local (possibly Windows) and remote (posix)
// workspaces, where the host separator is passed in rather than taken from the
// running OS — main-side code must never assume the local separator for a
// remote workspace.

export function joinPath(sep: string, base: string, relative: string): string {
  const trimmedBase = base.replace(/[\\/]+$/, '')
  const normalizedRelative = relative.replace(/[\\/]+/g, sep)
  return `${trimmedBase}${sep}${normalizedRelative}`
}
