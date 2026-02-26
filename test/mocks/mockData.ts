// Minimal generic object for managed object testing
// Works for users, roles, groups, organizations
export const mockManagedObject = {
  _id: 'obj-123',
  _rev: '1',
  name: 'Test Object',
  description: 'Test Description',
};

export const mockManagedObjects = [
  mockManagedObject,
  { _id: 'obj-456', _rev: '1', name: 'Test Object 2', description: 'Test Description 2' },
];

// Mock managed object configuration response
export const mockManagedObjectConfig = {
  objects: [
    { name: 'alpha_user', schema: { required: ['userName'], properties: { userName: { type: 'string' } } } },
    { name: 'bravo_role', schema: { required: ['name'], properties: { name: { type: 'string' } } } },
    { name: 'alpha_device', schema: { required: ['deviceId'], properties: { deviceId: { type: 'string' } } } },
  ],
};

// Minimal theme data
export const mockTheme = {
  _id: 'theme-123',
  name: 'Theme1',
  isDefault: false,
};

export const mockThemes = [
  mockTheme,
  { _id: 'theme-456', name: 'Theme2', isDefault: true },
];

// Minimal ESV data
export const mockVariable = {
  _id: 'esv-test',
  type: 'string',
  valueBase64: Buffer.from('test-value').toString('base64'),
};

export const mockVariables = [mockVariable];

// Minimal log sources (array of strings)
export const mockLogSources = [
  'am-authentication',
  'idm-activity',
];

// AM script mock data
export const mockScripts = {
  scriptedDecisionNode: {
    _id: 'script-123',
    name: 'TestScript',
    description: 'A test script',
    script: Buffer.from('console.log("test");').toString('base64'),
    language: 'JAVASCRIPT',
    context: 'AUTHENTICATION_TREE_DECISION_NODE',
    evaluatorVersion: '2.0',
  }
};

// AM journey mock data
export const mockJourneyData = {
  simple: {
    _id: 'SimpleJourney',
    entryNodeId: 'node-1',
    nodes: {
      'node-1': {
        nodeType: 'UsernameCollectorNode',
        displayName: 'Collect Username',
        connections: { outcome: 'success' },
        config: { _id: 'node-1' }
      }
    },
    staticNodes: {
      startNode: { x: 50, y: 250 },
      '70e691a5-1e33-4ac3-a356-e7b6d60d92e0': { x: 550, y: 150 },
      'e301438c-0bd0-429c-ab0c-66126501069a': { x: 550, y: 350 }
    }
  }
};
