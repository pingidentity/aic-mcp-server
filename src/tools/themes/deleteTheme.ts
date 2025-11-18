import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../config/managedObjectTypes.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const deleteThemeTool = {
  name: 'deleteTheme',
  title: 'Delete Theme',
  description: 'Delete a theme from a realm in PingOne AIC',
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

      const themeToDelete = realmThemes[themeIndex];
      const themeName = themeToDelete.name;
      const themeId = themeToDelete._id;

      // Safeguard: Prevent deletion of default theme
      if (themeToDelete.isDefault === true) {
        return createToolResponse(
          `Cannot delete the default theme "${themeName}". ` +
          `Set another theme as default using the setDefaultTheme tool first, then delete this theme.`
        );
      }

      // Remove the theme from the array
      const updatedThemes = realmThemes.filter((_: any, index: number) => index !== themeIndex);

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

      const successMessage = `Deleted theme "${themeName}" (${themeId}) from realm "${realm}"`;
      return createToolResponse(formatSuccess({ _id: themeId, name: themeName, message: successMessage }, response));
    } catch (error: any) {
      return createToolResponse(`Failed to delete theme from realm "${realm}": ${error.message}`);
    }
  }
};
