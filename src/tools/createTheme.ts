import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../utils/apiHelpers.js';
import { formatSuccess } from '../utils/responseHelpers.js';
import { REALMS } from '../config/managedObjectTypes.js';
import { DEFAULT_THEME } from '../config/themeDefaults.js';
import { randomUUID } from 'crypto';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const createThemeTool = {
  name: 'createTheme',
  title: 'Create Theme',
  description: 'Create a new theme for a realm in PingOne AIC. IMPORTANT: Call getThemeSchema first to understand all available fields, their types, enum values, and requirements before creating a theme. While only "name" is required, you should provide meaningful customizations based on user requirements and schema documentation. All unprovided fields will use sensible defaults.',
  scopes: SCOPES,
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to create the theme in (e.g., "alpha", "bravo")'),
    themeData: z.record(z.any()).describe('The theme configuration object. Must include a "name" property. Any fields not provided will use default values.')
  },
  async toolFunction({ realm, themeData }: { realm: string; themeData: Record<string, any> }) {
    try {
      // Validate that theme has a name
      if (!themeData.name || typeof themeData.name !== 'string') {
        return createToolResponse('Error: Theme data must include a "name" property');
      }

      const themeName = themeData.name;

      // Get the current theme configuration
      const configUrl = `https://${aicBaseUrl}/openidm/config/ui/themerealm`;
      const { data: config } = await makeAuthenticatedRequest(configUrl, SCOPES);

      // Validate config structure
      if (!config || !(config as any).realm || !(config as any).realm[realm]) {
        return createToolResponse(`Error: Invalid theme configuration structure for realm "${realm}"`);
      }

      const realmThemes = (config as any).realm[realm];

      // Check if theme with this name already exists
      const existingTheme = realmThemes.find((t: any) => t.name === themeName);
      if (existingTheme) {
        return createToolResponse(`Error: A theme with name "${themeName}" already exists in realm "${realm}". Use a different name or update the existing theme.`);
      }

      // Generate UUID for the new theme
      const themeId = randomUUID();

      // Merge defaults with provided theme data, then add system-controlled fields
      // This ensures: defaults < user data < system fields (in order of precedence)
      const newTheme = {
        ...DEFAULT_THEME,
        ...themeData,
        _id: themeId,
        isDefault: false
      };

      // Add the new theme to the realm's themes array
      realmThemes.push(newTheme);

      // Update the config
      const updatedConfig = {
        ...config,
        realm: {
          ...(config as any).realm,
          [realm]: realmThemes
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

      const successMessage = `Successfully created theme "${themeName}" with ID "${themeId}" in realm "${realm}"`;
      return createToolResponse(formatSuccess({ _id: themeId, name: themeName, message: successMessage }, response));
    } catch (error: any) {
      return createToolResponse(`Error creating theme in realm "${realm}": ${error.message}`);
    }
  }
};
