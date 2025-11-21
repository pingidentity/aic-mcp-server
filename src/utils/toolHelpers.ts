import * as managedObjectTools from '../tools/managedObjects/index.js';
import * as logTools from '../tools/logs/index.js';
import * as themeTools from '../tools/themes/index.js';
import * as esvTools from '../tools/esv/index.js';

/**
 * Collects all tools from all tool categories
 * @returns Array of all tool objects
 */
export function getAllTools() {
  return [
    ...Object.values(managedObjectTools),
    ...Object.values(logTools),
    ...Object.values(themeTools),
    ...Object.values(esvTools)
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
