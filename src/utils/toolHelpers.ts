import { Tool } from '../types/tool.js';
import * as managedObjectTools from '../tools/managedObjects/index.js';
import * as logTools from '../tools/logs/index.js';
import * as themeTools from '../tools/themes/index.js';
import * as esvTools from '../tools/esv/index.js';
import * as amTools from '../tools/am/index.js';

/**
 * Collects all tools from all tool categories
 * Note: AM tools are excluded in Docker mode as they require browser-based PKCE authentication
 * @returns Array of all tool objects
 */
export function getAllTools(): Tool[] {
  const isDockerMode = process.env.DOCKER_CONTAINER === 'true';

  const tools: Tool[] = [
    ...(Object.values(managedObjectTools) as Tool[]),
    ...(Object.values(logTools) as Tool[]),
    ...(Object.values(themeTools) as Tool[]),
    ...(Object.values(esvTools) as Tool[])
  ];

  // Only include AM tools in non-Docker mode (requires browser-based PKCE auth)
  if (!isDockerMode) {
    tools.push(...(Object.values(amTools) as Tool[]));
  }

  return tools;
}

/**
 * Extracts unique OAuth scopes from all tools
 * @returns Array of unique scope strings
 */
export function getAllScopes(): string[] {
  const allTools = getAllTools();
  return Array.from(new Set(allTools.flatMap((tool) => tool.scopes)));
}
