export type OpenContextFileArgs = {
  // Absolute path of a resolved context file (may live outside the worktree,
  // e.g. ~/.claude/settings.json). The inspector opens these in a read-only
  // preview because the editor's file read is sandboxed to the worktree.
  path: string
  label?: string
  language?: string
}
