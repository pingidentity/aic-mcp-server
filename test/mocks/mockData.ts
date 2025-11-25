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
