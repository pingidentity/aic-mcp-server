#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { initAuthService, cleanupAuthService } from './services/authService.js';
import { getAllTools, getAllScopes } from './utils/toolHelpers.js';

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

// Collect all tools and scopes using shared utility
const allTools = getAllTools();
const allScopes = getAllScopes();

// Create an MCP server
const server = new McpServer({
  name: 'pingone-aic-mcp-server',
  version: '1.0.0'
});

// Initialize auth service with all scopes and MCP server reference
// MCP server is required for device code flow URL elicitation
initAuthService(allScopes, {
  mcpServer: server
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
  cleanupAuthService();
  process.exit();
}

process.stdin.on('close', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanup();
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  cleanup();
});
