#!/usr/bin/env node
import './init.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initAuthService, cleanupAuthService } from './services/authService.js';
import { getAllTools, getAllScopes } from './utils/toolHelpers.js';
import { ToolConfig } from './types/tool.js';
import { VERSION } from './utils/version.js';
import { getEnvironmentNames, runWithEnvironment } from './services/environmentContext.js';

// Collect all tools and scopes using shared utility
const allTools = getAllTools();
const allScopes = getAllScopes();
const environmentNames = getEnvironmentNames();
const multiEnvironmentMode = environmentNames.length > 1;

function annotateEnvironment<T>(response: T, environmentName: string | undefined): T {
  const content = (response as { content?: unknown } | null | undefined)?.content;
  if (!environmentName || !Array.isArray(content)) {
    return response;
  }

  return {
    ...response,
    content: [
      {
        type: 'text',
        text: `Target PingOne AIC environment: ${environmentName}`
      },
      ...content
    ]
  };
}

// Create an MCP server
const server = new McpServer({
  name: 'pingone-aic-mcp-server',
  version: VERSION
});

// Initialize auth service with all scopes and MCP server reference
// MCP server is required for device code flow URL elicitation
initAuthService(allScopes, {
  mcpServer: server,
  // Reuse valid tenant-specific tokens across MCP server restarts.
  allowCachedOnFirstRequest: true
});

// Register all tools
allTools.forEach((tool) => {
  const registrations = multiEnvironmentMode ? environmentNames : [undefined];

  registrations.forEach((environmentName) => {
    const toolName = environmentName ? `${environmentName}_${tool.name}` : tool.name;
    const toolConfig: ToolConfig = {
      title: environmentName ? `${tool.title} (${environmentName})` : tool.title,
      description: environmentName ? `${tool.description} Target environment: ${environmentName}.` : tool.description
    };

    // Only add inputSchema if it exists (some tools like getLogSources don't have one)
    if ('inputSchema' in tool && tool.inputSchema) {
      toolConfig.inputSchema = tool.inputSchema;
    }

    // Add annotations if present
    if ('annotations' in tool && tool.annotations) {
      toolConfig.annotations = tool.annotations;
    }

    server.registerTool(toolName, toolConfig, (async (args: unknown) => {
      const response = await runWithEnvironment(environmentName, () => tool.toolFunction(args));
      return annotateEnvironment(response, environmentName);
    }) as any);
  });
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
