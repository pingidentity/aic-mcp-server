import { z } from 'zod';

/**
 * Tool annotations for MCP hints
 */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * Full tool definition interface
 */
export interface Tool {
  name: string;
  title: string;
  description: string;
  scopes: string[];
  annotations?: ToolAnnotations;
  inputSchema?: Record<string, z.ZodTypeAny>;
  toolFunction: (args: any) => Promise<any>;
}

/**
 * Tool configuration for MCP server registration
 * Subset of Tool interface used when registering tools with MCP
 */
export interface ToolConfig {
  title: string;
  description: string;
  inputSchema?: Record<string, z.ZodTypeAny>;
  annotations?: ToolAnnotations;
}
