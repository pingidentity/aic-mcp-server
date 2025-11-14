import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../utils/apiHelpers.js';
import { formatSuccess } from '../utils/responseHelpers.js';
import { REALMS } from '../config/managedObjectTypes.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const updateThemeTool = {
  name: 'updateTheme',
  title: 'Update Theme',
  description: 'Update an existing theme in PingOne AIC. Provide only the fields you want to change - all other fields will be preserved. Use getThemeSchema to understand field requirements. Use setDefaultTheme to change the default status.',
  scopes: SCOPES,
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the theme (e.g., "alpha", "bravo")'),
    themeIdentifier: z.string().describe('The theme ID or name to update'),
    updates: z.record(z.any()).describe('Object containing the fields to update. Cannot update _id or isDefault.')
  },
  async toolFunction({ realm, themeIdentifier, updates }: { realm: string; themeIdentifier: string; updates: Record<string, any> }) {
    try {
      // Validate that updates don't contain protected fields
      if ('_id' in updates) {
        return createToolResponse('Error: Cannot update the "_id" field. Theme IDs are immutable.');
      }

      if ('isDefault' in updates) {
        return createToolResponse('Error: Cannot update "isDefault" directly. Use the setDefaultTheme tool to change the default theme.');
      }

      // Get the current theme configuration
      const configUrl = `https://${aicBaseUrl}/openidm/config/ui/themerealm`;
      const { data: config } = await makeAuthenticatedRequest(configUrl, SCOPES);

      // Validate config structure
      if (!config || !(config as any).realm || !(config as any).realm[realm]) {
        return createToolResponse(`Error: Invalid theme configuration structure for realm "${realm}"`);
      }

      const realmThemes = (config as any).realm[realm];

      // Find the theme by ID or name
      const themeIndex = realmThemes.findIndex((t: any) =>
        t._id === themeIdentifier || t.name === themeIdentifier
      );

      if (themeIndex === -1) {
        return createToolResponse(`Error: No theme found with ID or name "${themeIdentifier}" in realm "${realm}"`);
      }

      const existingTheme = realmThemes[themeIndex];
      const themeId = existingTheme._id;
      const originalName = existingTheme.name;

      // If updating the name, check for duplicates
      if (updates.name && updates.name !== originalName) {
        const duplicateTheme = realmThemes.find((t: any) => t.name === updates.name && t._id !== themeId);
        if (duplicateTheme) {
          return createToolResponse(`Error: A theme with name "${updates.name}" already exists in realm "${realm}". Choose a different name.`);
        }
      }

      // Merge updates with existing theme, preserving _id and isDefault
      const updatedTheme = {
        ...existingTheme,
        ...updates,
        _id: themeId,  // Always preserve the ID
        isDefault: existingTheme.isDefault  // Always preserve isDefault
      };

      // Update the themes array
      const updatedThemes = [...realmThemes];
      updatedThemes[themeIndex] = updatedTheme;

      // Update the config
      const updatedConfig = {
        ...config,
        realm: {
          ...(config as any).realm,
          [realm]: updatedThemes
        }
      };

      // PUT the updated configuration back
      const { response } = await makeAuthenticatedRequest(
        configUrl,
        SCOPES,
        {
          method: 'PUT',
          body: JSON.stringify(updatedConfig)
        }
      );

      const themeName = updatedTheme.name;
      const successMessage = `Successfully updated theme "${themeName}" (ID: ${themeId}) in realm "${realm}"`;
      return createToolResponse(formatSuccess({ _id: themeId, name: themeName, message: successMessage }, response));
    } catch (error: any) {
      return createToolResponse(`Error updating theme in realm "${realm}": ${error.message}`);
    }
  }
};
