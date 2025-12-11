import { Tool } from '../types/tool.js';
import * as managedObjectTools from '../tools/managedObjects/index.js';
import * as logTools from '../tools/logs/index.js';
import * as themeTools from '../tools/themes/index.js';
import * as esvTools from '../tools/esv/index.js';

/**
 * Collects all tools from all tool categories
 * @returns Array of all tool objects
 */
export function getAllTools(): Tool[] {
  return [
    ...Object.values(managedObjectTools) as Tool[],
    ...Object.values(logTools) as Tool[],
    ...Object.values(themeTools) as Tool[],
    ...Object.values(esvTools) as Tool[]
  ];
}

/**
 * Extracts unique OAuth scopes from all tools
 * @returns Array of unique scope strings
 */
export function getAllScopes(): string[] {
  const allTools = getAllTools();
  return Array.from(
    new Set(allTools.flatMap(tool => tool.scopes))
  );
}
