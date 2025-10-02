#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { authService } from './services/authService.js';
import { getUsersTool } from './tools/getUsers.js';

// Check for the required environment variable on startup
if (!process.env.AIC_BASE_URL) {
    console.error('FATAL: AIC_BASE_URL environment variable is not set.');
    process.exit(1);
}

// The authService is initialized when imported, which will trigger the token acquisition process.
// We can log to confirm it's been triggered.

// Create an MCP server
const server = new McpServer({
  name: 'pingone-aic-mcp-server',
  version: '1.0.0'
});

// Register the getUsers tool
server.registerTool(
  getUsersTool.name,
  {
    title: 'Get Users',
    description: getUsersTool.description,
    inputSchema: getUsersTool.inputSchema,
  },
  getUsersTool.execute
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);

function cleanup() {
  authService.closeRedirectServer();
  process.exit();
}

process.stdin.on('close', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  authService.closeRedirectServer();
  process.exit(1);
});
