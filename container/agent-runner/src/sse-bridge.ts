/**
 * SSE-to-stdio MCP bridge.
 * Usage: node sse-bridge.js <sse-url>
 *
 * Connects to an SSE MCP server and exposes it as a stdio MCP server.
 * The Claude Agent SDK only reliably supports stdio MCP servers,
 * so this bridge translates between the two transports.
 */
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const sseUrl = process.argv[2];
if (!sseUrl) {
  process.stderr.write('Usage: node sse-bridge.js <sse-url>\n');
  process.exit(1);
}

async function main() {
  // Connect to the upstream SSE MCP server
  const transport = new SSEClientTransport(new URL(sseUrl));
  const client = new Client({ name: 'sse-bridge', version: '1.0.0' });
  await client.connect(transport);

  // Create a stdio server that proxies requests to the SSE client
  const server = new Server(
    { name: 'sse-bridge', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const result = await client.listTools();
    return { tools: result.tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await client.callTool({
      name: request.params.name,
      arguments: request.params.arguments,
    });
    return result;
  });

  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);

  // Clean shutdown
  process.on('SIGTERM', async () => {
    await server.close();
    await client.close();
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`sse-bridge error: ${err.message}\n`);
  process.exit(1);
});
