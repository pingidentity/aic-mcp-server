import { z } from 'zod';
import { createToolResponse } from '../../utils/apiHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

export const getJourneyPreviewUrlTool = {
  name: 'getJourneyPreviewUrl',
  title: 'Get Journey Preview URL',
  description: 'Generate the preview URL for testing an authentication journey. Returns a URL that can be opened in a browser to test the journey flow.',
  scopes: [],
  annotations: {
    readOnlyHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the journey'),
    journeyName: safePathSegmentSchema.optional().describe(
      'The name of the journey to preview. If omitted, returns the URL for the default journey.'
    )
  },
  async toolFunction({ realm, journeyName }: { realm: string; journeyName?: string }) {
    // Build the base URL
    let previewUrl = `https://${aicBaseUrl}/am/XUI/?realm=/${realm}`;

    // Add journey-specific parameters if a journey name is provided
    if (journeyName) {
      const encodedJourneyName = encodeURIComponent(journeyName);
      previewUrl += `&authIndexType=service&authIndexValue=${encodedJourneyName}`;
    }

    const result = {
      realm,
      journeyName: journeyName || '(default)',
      previewUrl,
    };

    return createToolResponse(JSON.stringify(result, null, 2));
  },
};