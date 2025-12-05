import { describe, it, expect } from 'vitest';
import { generateAuthResultPage } from '../../../src/services/flows/authResultPage.js';

describe('generateAuthResultPage', () => {
  describe('Success State', () => {
    it('should generate success page with countdown script', () => {
      const html = generateAuthResultPage(true);

      expect(html).toContain('Authorization Successful');
      expect(html).toContain('window.close()'); // Has auto-close script
      expect(html).not.toContain('<div class="error-details'); // No error div
    });
  });

  describe('Error State', () => {
    it('should generate error page without countdown script', () => {
      const html = generateAuthResultPage(false);

      expect(html).toContain('Authorization Failed');
      expect(html).not.toContain('window.close()'); // No auto-close script
    });

    it('should include error details when provided', () => {
      const html = generateAuthResultPage(false, 'Invalid state parameter');

      expect(html).toContain('<div class="error-details');
      expect(html).toContain('Invalid state parameter');
    });

    it('should not include error details when omitted', () => {
      const html = generateAuthResultPage(false);

      expect(html).not.toContain('<div class="error-details');
    });
  });
});
