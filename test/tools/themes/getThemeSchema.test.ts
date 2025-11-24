import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getThemeSchemaTool } from '../../../src/tools/themes/getThemeSchema.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { makeAuthenticatedRequest } from '../../../src/utils/apiHelpers.js';

// Mock apiHelpers to verify NO API calls are made
vi.mock('../../../src/utils/apiHelpers.js', async () => {
  const actual = await vi.importActual('../../../src/utils/apiHelpers.js');
  return {
    ...actual,
    makeAuthenticatedRequest: vi.fn(),
  };
});

describe('getThemeSchema', () => {
  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
    vi.clearAllMocks();
  });

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getThemeSchema', getThemeSchemaTool);
  });

  // ===== RESPONSE HANDLING TESTS =====

  it('should return static schema documentation without making API call', async () => {
    const result = await getThemeSchemaTool.toolFunction();

    // Verify NO API call was made
    expect(makeAuthenticatedRequest).not.toHaveBeenCalled();

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content.length).toBe(1);
    expect(result.content[0].type).toBe('text');

    const schemaData = JSON.parse(result.content[0].text);

    expect(schemaData).toHaveProperty('schemaVersion');
    expect(schemaData).toHaveProperty('description');
    expect(schemaData).toHaveProperty('themeStructure');
    expect(schemaData).toHaveProperty('fields');
    expect(schemaData).toHaveProperty('importantNotes');
    expect(schemaData).toHaveProperty('recommendedWorkflow');

    expect(schemaData.fields).toHaveProperty('name');
    expect(schemaData.fields.name).toHaveProperty('type');
    expect(schemaData.fields.name).toHaveProperty('required');
    expect(schemaData.fields.name.required).toBe(true);

    // Verify enum field documentation
    expect(schemaData.fields).toHaveProperty('journeyLayout');
    expect(schemaData.fields.journeyLayout).toHaveProperty('enum');
    expect(schemaData.fields.journeyLayout.enum).toEqual([
      'card',
      'justified-left',
      'justified-right'
    ]);

    // Verify important notes sections
    expect(schemaData.importantNotes).toHaveProperty('htmlCssFields');
    expect(schemaData.importantNotes).toHaveProperty('localization');
    expect(schemaData.importantNotes).toHaveProperty('colorFormat');
    expect(schemaData.importantNotes).toHaveProperty('imageFields');
    expect(schemaData.importantNotes).toHaveProperty('enumFields');
    expect(schemaData.importantNotes).toHaveProperty('systemControlledFields');
  });

  it('should include complete field type information', async () => {
    const result = await getThemeSchemaTool.toolFunction();
    const schemaData = JSON.parse(result.content[0].text);

    expect(schemaData.fields.primaryColor).toHaveProperty('type', 'string');
    expect(schemaData.fields.primaryColor).toHaveProperty('format', 'hex color (#RRGGBB)');
    expect(schemaData.fields.primaryColor).toHaveProperty('default');
    expect(schemaData.fields.primaryColor).toHaveProperty('example');

    expect(schemaData.fields.logoEnabled).toHaveProperty('type', 'boolean');
    expect(schemaData.fields.logoEnabled).toHaveProperty('default', true);

    expect(schemaData.fields.journeyCardShadow).toHaveProperty('type', 'number');
    expect(schemaData.fields.journeyCardShadow).toHaveProperty('format', 'pixels (0-25)');
    expect(schemaData.fields.journeyCardShadow).toHaveProperty('default', 3);
    expect(schemaData.fields.journeyCardShadow).toHaveProperty('examples');
  });
});
