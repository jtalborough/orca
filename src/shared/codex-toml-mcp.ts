import { maskMcpEnv, type McpServerSummary } from './mcp-config'

// Minimal extractor for Codex's ~/.codex/config.toml [mcp_servers.NAME] tables.
// This is a BOUNDED heuristic, not a full TOML parser: it reads server table
// headers and the command/url/env keys within, enough to LIST the configured
// MCP servers in the inspector. It intentionally ignores arrays, inline tables,
// and multi-line values. New TOML shapes may need a case added here.

type ParsedServer = {
  command?: string
  url?: string
  env: Record<string, string>
}

const HEADER_RE = /^\s*\[\s*mcp_servers\.(.+?)\s*\]\s*$/
const OTHER_HEADER_RE = /^\s*\[/
const KEY_RE = /^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*$/
// Server key: a bare name or a quoted name, optionally followed by a sub-table
// segment (e.g. `.env`).
const NAME_RE = /^("[^"]+"|[A-Za-z0-9_-]+)(?:\.(.+))?$/

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

// Only scalar string values are meaningful for command/url/env. Arrays and
// inline tables are skipped (return null).
function scalarString(rawValue: string): string | null {
  const trimmed = rawValue.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return null
  }
  return unquote(trimmed)
}

export function parseCodexTomlMcpServers(content: string): McpServerSummary[] {
  const servers = new Map<string, ParsedServer>()
  const order: string[] = []
  const ensure = (name: string): ParsedServer => {
    let server = servers.get(name)
    if (!server) {
      server = { env: {} }
      servers.set(name, server)
      order.push(name)
    }
    return server
  }

  let current: { name: string; isRoot: boolean; isEnv: boolean } | null = null

  for (const line of content.split(/\r?\n/)) {
    const headerMatch = line.match(HEADER_RE)
    if (headerMatch) {
      const nameMatch = headerMatch[1].match(NAME_RE)
      if (!nameMatch) {
        current = null
        continue
      }
      const name = unquote(nameMatch[1])
      const sub = nameMatch[2]
      ensure(name)
      current = { name, isRoot: sub === undefined, isEnv: sub === 'env' }
      continue
    }
    if (OTHER_HEADER_RE.test(line)) {
      // A non-mcp_servers table (or a comment-preceded `[`) ends the section.
      current = null
      continue
    }
    if (!current) {
      continue
    }
    const keyMatch = line.match(KEY_RE)
    if (!keyMatch) {
      continue
    }
    const [, key, rawValue] = keyMatch
    const value = scalarString(rawValue)
    if (value === null) {
      continue
    }
    const server = ensure(current.name)
    if (current.isEnv) {
      server.env[key] = value
    } else if (current.isRoot && key === 'command') {
      server.command = value
    } else if (current.isRoot && key === 'url') {
      server.url = value
    }
  }

  return order.map((name) => {
    const server = servers.get(name)!
    const maskedEnv = maskMcpEnv(server.env)
    return {
      name,
      transport: server.command ? 'stdio' : server.url ? 'http' : 'unknown',
      status: 'enabled',
      ...(server.command ? { command: server.command } : {}),
      ...(server.url ? { url: server.url } : {}),
      ...(maskedEnv ? { env: maskedEnv } : {})
    }
  })
}
