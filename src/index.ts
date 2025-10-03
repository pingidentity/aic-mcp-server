#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { authService } from './services/authService.js';
import { searchUsersTool } from './tools/searchUsers.js';
import { queryAICLogsByTransactionIdTool } from './tools/queryAICLogsByTransactionId.js';

// Check for the required environment variable on startup
if (!process.env.AIC_BASE_URL) {
    console.error('FATAL: AIC_BASE_URL environment variable is not set.');
    process.exit(1);
}

// Create an MCP server
const server = new McpServer({
  name: 'pingone-aic-mcp-server',
  version: '1.0.0'
});

// Register the searchUsers tool
server.registerTool(
  searchUsersTool.name,
  {
    title: searchUsersTool.title,
    description: searchUsersTool.description,
    inputSchema: searchUsersTool.inputSchema,
  },
  searchUsersTool.toolFunction
);

// Register the queryAICLogsByTransactionId tool
server.registerTool(
  queryAICLogsByTransactionIdTool.name,
  {
    title: queryAICLogsByTransactionIdTool.title,
    description: queryAICLogsByTransactionIdTool.description,
    inputSchema: queryAICLogsByTransactionIdTool.inputSchema,
  },
  queryAICLogsByTransactionIdTool.toolFunction
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);

// Graceful shutdown - ensure the redirect server is closed to free up the port
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
