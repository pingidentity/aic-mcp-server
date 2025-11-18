// src/tools/getLogSources.ts
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:monitoring:*'];

export const getLogSourcesTool = {
  name: 'getLogSources',
  title: 'Get Log Sources',
  description: 'Retrieve the list of available log sources in PingOne AIC',
  scopes: SCOPES,
  async toolFunction() {
    const url = `https://${aicBaseUrl}/monitoring/logs/sources`;

    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES);
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to fetch log sources: ${error.message}`);
    }
  }
};
