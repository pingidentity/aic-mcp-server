#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { authService } from './services/authService.js';
import { searchUsersTool } from './tools/searchUsers.js';
import { queryAICLogsByTransactionIdTool } from './tools/queryAICLogsByTransactionId.js';
import { getManagedObjectSchemaTool } from './tools/getManagedObjectSchema.js';
import { createUserTool } from './tools/createUser.js';
import { getUserTool } from './tools/getUser.js';
import { deleteUserTool } from './tools/deleteUser.js';

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

// Register the queryAICLogsByTransactionId tool (not supported by service accounts)
if (!authService.isServiceAccount()) {
  server.registerTool(
    queryAICLogsByTransactionIdTool.name,
    {
      title: queryAICLogsByTransactionIdTool.title,
      description: queryAICLogsByTransactionIdTool.description,
      inputSchema: queryAICLogsByTransactionIdTool.inputSchema,
    },
    queryAICLogsByTransactionIdTool.toolFunction
  );
}

// Register the getManagedObjectSchema tool
server.registerTool(
  getManagedObjectSchemaTool.name,
  {
    title: getManagedObjectSchemaTool.title,
    description: getManagedObjectSchemaTool.description,
    inputSchema: getManagedObjectSchemaTool.inputSchema,
  },
  getManagedObjectSchemaTool.toolFunction
);

// Register the createUser tool
server.registerTool(
  createUserTool.name,
  {
    title: createUserTool.title,
    description: createUserTool.description,
    inputSchema: createUserTool.inputSchema,
  },
  createUserTool.toolFunction
);

// Register the getUser tool
server.registerTool(
  getUserTool.name,
  {
    title: getUserTool.title,
    description: getUserTool.description,
    inputSchema: getUserTool.inputSchema,
  },
  getUserTool.toolFunction
);

// Register the deleteUser tool
server.registerTool(
  deleteUserTool.name,
  {
    title: deleteUserTool.title,
    description: deleteUserTool.description,
    inputSchema: deleteUserTool.inputSchema,
  },
  deleteUserTool.toolFunction
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);

// Graceful shutdown
function cleanup() {
  process.exit();
}

process.stdin.on('close', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});
