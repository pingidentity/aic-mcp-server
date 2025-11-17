#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { initAuthService } from './services/authService.js';
import { queryManagedObjectsTool } from './tools/queryManagedObjects.js';
import { queryAICLogsByTransactionIdTool } from './tools/queryAICLogsByTransactionId.js';
import { getManagedObjectSchemaTool } from './tools/getManagedObjectSchema.js';
import { createManagedObjectTool } from './tools/createManagedObject.js';
import { getManagedObjectTool } from './tools/getManagedObject.js';
import { deleteManagedObjectTool } from './tools/deleteManagedObject.js';
import { patchManagedObjectTool } from './tools/patchManagedObject.js';
import { getLogSourcesTool } from './tools/getLogSources.js';
import { queryLogsTool } from './tools/queryLogs.js';
import { getRealmThemesTool } from './tools/getRealmThemes.js';
import { getThemeTool } from './tools/getTheme.js';
import { createThemeTool } from './tools/createTheme.js';
import { setDefaultThemeTool } from './tools/setDefaultTheme.js';
import { updateThemeTool } from './tools/updateTheme.js';
import { deleteThemeTool } from './tools/deleteTheme.js';
import { getThemeSchemaTool } from './tools/getThemeSchema.js';

/**
 * Tool configuration structure for MCP tool registration
 */
interface ToolConfig {
  title: string;
  description: string;
  inputSchema?: Record<string, z.ZodTypeAny>;
}

// Check for the required environment variable on startup
if (!process.env.AIC_BASE_URL) {
    console.error('FATAL: AIC_BASE_URL environment variable is not set.');
    process.exit(1);
}

// Collect all tool scopes
const allTools = [
  queryManagedObjectsTool,
  queryAICLogsByTransactionIdTool,
  getManagedObjectSchemaTool,
  createManagedObjectTool,
  getManagedObjectTool,
  deleteManagedObjectTool,
  patchManagedObjectTool,
  getLogSourcesTool,
  queryLogsTool,
  getRealmThemesTool,
  getThemeTool,
  getThemeSchemaTool,
  createThemeTool,
  setDefaultThemeTool,
  updateThemeTool,
  deleteThemeTool
];

// Extract unique scopes from all tools
const allScopes = Array.from(
  new Set(allTools.flatMap(tool => tool.scopes))
);

// Initialize auth service with all scopes
initAuthService(allScopes);

// Create an MCP server
const server = new McpServer({
  name: 'pingone-aic-mcp-server',
  version: '1.0.0'
});

// Register all tools
allTools.forEach(tool => {
  const toolConfig: ToolConfig = {
    title: tool.title,
    description: tool.description,
  };

  // Only add inputSchema if it exists (some tools like getLogSources don't have one)
  if ('inputSchema' in tool && tool.inputSchema) {
    toolConfig.inputSchema = tool.inputSchema;
  }

  server.registerTool(tool.name, toolConfig, tool.toolFunction as any);
});

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
