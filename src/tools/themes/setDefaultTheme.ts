import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../config/managedObjectUtils.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const setDefaultThemeTool = {
  name: 'setDefaultTheme',
  title: 'Set Default Theme',
  description: 'Set a theme as the default for a realm in PingOne AIC',
  scopes: SCOPES,
  inputSchema: {
    realm: z.enum(REALMS).describe('Realm name'),
    themeIdentifier: z.string().describe('Theme ID or name')
  },
  async toolFunction({ realm, themeIdentifier }: { realm: string; themeIdentifier: string }) {
    try {
      // Get the current theme configuration
      const configUrl = `https://${aicBaseUrl}/openidm/config/ui/themerealm`;
      const { data: config } = await makeAuthenticatedRequest(configUrl, SCOPES);

      // Validate config structure
      if (!config || !(config as any).realm || !(config as any).realm[realm]) {
        return createToolResponse(`Invalid theme configuration structure for realm "${realm}"`);
      }

      const realmThemes = (config as any).realm[realm];

      // Find the theme by ID or name
      const themeIndex = realmThemes.findIndex((t: any) =>
        t._id === themeIdentifier || t.name === themeIdentifier
      );

      if (themeIndex === -1) {
        return createToolResponse(`Theme not found: "${themeIdentifier}" in realm "${realm}"`);
      }

      const targetTheme = realmThemes[themeIndex];
      const themeName = targetTheme.name;
      const themeId = targetTheme._id;

      // Check if it's already the default
      if (targetTheme.isDefault === true) {
        return createToolResponse(`Theme "${themeName}" is already the default theme for realm "${realm}"`);
      }

      // Set all themes to isDefault: false, then set target to true
      const updatedThemes = realmThemes.map((theme: any, index: number) => ({
        ...theme,
        isDefault: index === themeIndex
      }));

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

      const successMessage = `Set theme "${themeName}" (${themeId}) as default for realm "${realm}"`;
      return createToolResponse(formatSuccess({ _id: themeId, name: themeName, isDefault: true, message: successMessage }, response));
    } catch (error: any) {
      return createToolResponse(`Failed to set default theme in realm "${realm}": ${error.message}`);
    }
  }
};
