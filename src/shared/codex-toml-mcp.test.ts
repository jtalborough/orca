import { describe, expect, it } from 'vitest'

import { parseCodexTomlMcpServers } from './codex-toml-mcp'

// Real shape from ~/.codex/config.toml on a live machine: bare-name server
// tables with command or url, plus a nested [.env] sub-table.
const CONFIG = `
model = "gpt-5"

[mcp_servers.node_repl]
args = []
command = "/usr/local/bin/node-repl"

[mcp_servers.node_repl.env]
NODE_ENV = "production"
API_TOKEN = "sk-secret-abcdefghijkl"

[mcp_servers.onshape]
command = "/opt/onshape/mcp"

[mcp_servers.monarch]
url = "https://mcp.monarch.example/sse"

[other_section]
command = "should-be-ignored"
`

describe('parseCodexTomlMcpServers', () => {
  it('extracts each server with its transport and command/url, in order', () => {
    const servers = parseCodexTomlMcpServers(CONFIG)
    expect(servers.map((s) => s.name)).toEqual(['node_repl', 'onshape', 'monarch'])

    expect(servers[0]).toMatchObject({
      name: 'node_repl',
      transport: 'stdio',
      command: '/usr/local/bin/node-repl'
    })
    expect(servers[1]).toMatchObject({ name: 'onshape', transport: 'stdio' })
    expect(servers[2]).toMatchObject({
      name: 'monarch',
      transport: 'http',
      url: 'https://mcp.monarch.example/sse'
    })
  })

  it('does not treat a non-mcp_servers table as a server', () => {
    const names = parseCodexTomlMcpServers(CONFIG).map((s) => s.name)
    expect(names).not.toContain('other_section')
  })

  it('captures env from the sub-table and masks sensitive values', () => {
    const nodeRepl = parseCodexTomlMcpServers(CONFIG).find((s) => s.name === 'node_repl')
    expect(nodeRepl?.env?.NODE_ENV).toBe('production')
    // The token value must not appear verbatim.
    expect(nodeRepl?.env?.API_TOKEN).not.toContain('sk-secret')
  })

  it('returns an empty list when there are no mcp_servers tables', () => {
    expect(parseCodexTomlMcpServers('model = "gpt-5"\n[history]\nsize = 1000')).toEqual([])
  })

  it('handles a quoted server name', () => {
    const servers = parseCodexTomlMcpServers('[mcp_servers."my.server"]\ncommand = "run"')
    expect(servers[0]?.name).toBe('my.server')
    expect(servers[0]?.command).toBe('run')
  })
})
