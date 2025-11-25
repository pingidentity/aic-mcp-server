import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../config/managedObjectUtils.js';
import { randomUUID } from 'crypto';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const createThemeTool = {
  name: 'createTheme',
  title: 'Create Theme',
  description: 'Create a new theme for a realm in PingOne AIC. IMPORTANT: Call getThemeSchema first to understand all available fields, their types, enum values, and requirements before creating a theme.',
  scopes: SCOPES,
  inputSchema: {
    realm: z.enum(REALMS).describe('Realm name'),
    themeData: z.record(z.any()).describe('Theme configuration object (must include a "name" property)')
  },
  async toolFunction({ realm, themeData }: { realm: string; themeData: Record<string, any> }) {
    try {
      // Validate that theme has a name
      if (!themeData.name || typeof themeData.name !== 'string') {
        return createToolResponse('Theme data must include a "name" property');
      }

      const themeName = themeData.name;

      // Get the current theme configuration
      const configUrl = `https://${aicBaseUrl}/openidm/config/ui/themerealm`;
      const { data: config } = await makeAuthenticatedRequest(configUrl, SCOPES);

      // Validate config structure
      if (!config || !(config as any).realm || !(config as any).realm[realm]) {
        return createToolResponse(`Invalid theme configuration structure for realm "${realm}"`);
      }

      const realmThemes = (config as any).realm[realm];

      // Check if theme with this name already exists
      const existingTheme = realmThemes.find((t: any) => t.name === themeName);
      if (existingTheme) {
        return createToolResponse(`Theme with name "${themeName}" already exists in realm "${realm}". Use a different name or update the existing theme.`);
      }

      // Generate UUID for the new theme
      const themeId = randomUUID();

      // Add system-controlled fields to user-provided theme data
      const newTheme = {
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

      const successMessage = `Created theme "${themeName}" (${themeId}) in realm "${realm}"`;
      return createToolResponse(formatSuccess({ _id: themeId, name: themeName, message: successMessage }, response));
    } catch (error: any) {
      return createToolResponse(`Failed to create theme in realm "${realm}": ${error.message}`);
    }
  }
};
