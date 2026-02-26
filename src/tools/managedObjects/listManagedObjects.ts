import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const listManagedObjectsTool = {
  name: 'listManagedObjects',
  title: 'List Managed Objects',
  description: 'Retrieve the list of all managed object types available in PingOne AIC',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    // No parameters needed
  },
  async toolFunction() {
    const url = `https://${aicBaseUrl}/openidm/config/managed`;

    try {
      const { data } = await makeAuthenticatedRequest(url, SCOPES);

      const config = data as any;

      // Extract just the names
      const objectNames = (config.objects || []).map((obj: any) => obj.name);

      return createToolResponse(JSON.stringify({ managedObjectTypes: objectNames }, null, 2));
    } catch (error: any) {
      return createToolResponse(`Error listing managed objects: ${error.message}`);
    }
  }
};
