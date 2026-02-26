import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { expect } from 'vitest';

/**
 * Snapshot testing for tool schemas
 * Prevents unintended changes to MCP tool definitions
 */
export async function snapshotTest(
  toolName: string,
  toolDefinition: any,
  snapshotDir: string = '__snapshots__'
): Promise<void> {
  const snapshotPath = join(process.cwd(), 'test', snapshotDir, `${toolName}.json`);

  const shouldUpdate = process.env.UPDATE_SNAPSHOTS === 'true';

  // Ensure snapshot directory exists
  if (!existsSync(dirname(snapshotPath))) {
    mkdirSync(dirname(snapshotPath), { recursive: true });
  }

  // Serialize tool definition (excluding function, only schema)
  const schemaOnly = {
    name: toolDefinition.name,
    title: toolDefinition.title,
    description: toolDefinition.description,
    scopes: toolDefinition.scopes,
    inputSchema: toolDefinition.inputSchema
  };

  const currentSnapshot = JSON.stringify(schemaOnly, null, 2);

  // Update mode: overwrite snapshot
  if (shouldUpdate) {
    writeFileSync(snapshotPath, currentSnapshot, 'utf-8');
    console.log(`✓ Updated snapshot for ${toolName}`);
    return;
  }

  // Test mode: compare against saved snapshot
  if (!existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found for ${toolName}.\n` + `Run: UPDATE_SNAPSHOTS=true npm test`);
  }

  const savedSnapshot = readFileSync(snapshotPath, 'utf-8');

  expect(currentSnapshot).toBe(savedSnapshot);
}
