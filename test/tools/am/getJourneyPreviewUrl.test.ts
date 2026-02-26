import { describe, it, expect, beforeEach } from 'vitest';
import { getJourneyPreviewUrlTool } from '../../../src/tools/am/getJourneyPreviewUrl.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('getJourneyPreviewUrl', () => {
  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
  });

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getJourneyPreviewUrl', getJourneyPreviewUrlTool);
  });

  // ===== URL GENERATION TESTS =====
  describe('URL Generation', () => {
    it('should generate URL for default journey when no journeyName provided', async () => {
      const result = await getJourneyPreviewUrlTool.toolFunction({ realm: 'alpha' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.realm).toBe('alpha');
      expect(parsed.journeyName).toBe('(default)');
      expect(parsed.previewUrl).toBe('https://test.forgeblocks.com/am/XUI/?realm=/alpha');
    });

    it('should generate URL for specific journey', async () => {
      const result = await getJourneyPreviewUrlTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login'
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.realm).toBe('alpha');
      expect(parsed.journeyName).toBe('Login');
      expect(parsed.previewUrl).toBe(
        'https://test.forgeblocks.com/am/XUI/?realm=/alpha&authIndexType=service&authIndexValue=Login'
      );
    });

    it('should URL-encode journey names with special characters', async () => {
      const result = await getJourneyPreviewUrlTool.toolFunction({
        realm: 'bravo',
        journeyName: 'Copy of Login'
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.journeyName).toBe('Copy of Login');
      expect(parsed.previewUrl).toContain('authIndexValue=Copy%20of%20Login');
    });

    it('should work with bravo realm', async () => {
      const result = await getJourneyPreviewUrlTool.toolFunction({ realm: 'bravo' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.realm).toBe('bravo');
      expect(parsed.previewUrl).toBe('https://test.forgeblocks.com/am/XUI/?realm=/bravo');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => getJourneyPreviewUrlTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should accept valid realm values', () => {
      expect(getJourneyPreviewUrlTool.inputSchema.realm.parse('alpha')).toBe('alpha');
      expect(getJourneyPreviewUrlTool.inputSchema.realm.parse('bravo')).toBe('bravo');
    });

    it('should reject invalid realm values', () => {
      expect(() => getJourneyPreviewUrlTool.inputSchema.realm.parse('invalid')).toThrow();
    });

    it('should allow optional journeyName', () => {
      expect(getJourneyPreviewUrlTool.inputSchema.journeyName.parse(undefined)).toBeUndefined();
      expect(getJourneyPreviewUrlTool.inputSchema.journeyName.parse('Login')).toBe('Login');
    });
  });
});
