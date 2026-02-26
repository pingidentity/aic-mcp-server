import { z } from 'zod';
import { randomUUID } from 'crypto';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_API_HEADERS } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const getDynamicNodeOutcomesTool = {
  name: 'getDynamicNodeOutcomes',
  title: 'Get Dynamic Node Outcomes',
  description:
    'Calculate the dynamic outcomes for a node based on its configuration. ' +
    'Use this for nodes whose outcomes depend on their config, such as: ' +
    'PageNode (outcomes depend on child nodes - pass { nodes: [...] }), ' +
    'ChoiceCollectorNode (outcomes depend on choices array - pass { choices: [...] }), ' +
    'and similar configurable nodes. This helps determine what connections to wire when building journeys.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to query'),
    nodeType: z.string().min(1).describe('The node type (e.g., "PageNode", "ChoiceCollectorNode")'),
    config: z
      .record(z.any())
      .describe(
        'Node configuration object. For PageNode, use { nodes: [{ nodeType, _properties }...] }. ' +
          'For ChoiceCollectorNode, use { choices: ["option1", "option2", ...] }. ' +
          'Check the node schema via getNodeTypeDetails to understand required config properties.'
      )
  },
  async toolFunction({ realm, nodeType, config }: { realm: string; nodeType: string; config: Record<string, any> }) {
    try {
      // All nodes use _action=listOutcomes with config in body
      const url = `${buildAMRealmUrl(realm, `realm-config/authentication/authenticationtrees/nodes/${encodeURIComponent(nodeType)}`)}?_action=listOutcomes`;

      // Prepare the request body
      const requestBody = { ...config };

      // PageNode child nodes require _id fields
      if (nodeType === 'PageNode' && Array.isArray(config.nodes)) {
        requestBody.nodes = config.nodes.map((node: any) => ({
          ...node,
          _id: node._id || randomUUID()
        }));
      }

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        headers: AM_API_HEADERS,
        body: JSON.stringify(requestBody)
      });

      return createToolResponse(
        formatSuccess(
          {
            realm,
            nodeType,
            outcomes: data
          },
          response
        )
      );
    } catch (error: any) {
      return createToolResponse(
        `Failed to get dynamic outcomes for "${nodeType}" in realm "${realm}": ${error.message}`
      );
    }
  }
};
