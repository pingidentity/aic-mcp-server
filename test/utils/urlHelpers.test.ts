import { describe, it, expect } from 'vitest';
import { normalizeAicBaseUrl } from '../../src/utils/urlHelpers.js';

describe('normalizeAicBaseUrl', () => {
  it('should pass through clean hostnames unchanged', () => {
    expect(normalizeAicBaseUrl('tenant.forgeblocks.com')).toBe('tenant.forgeblocks.com');
  });

  it('should remove protocols', () => {
    expect(normalizeAicBaseUrl('https://tenant.forgeblocks.com')).toBe('tenant.forgeblocks.com');
    expect(normalizeAicBaseUrl('http://tenant.forgeblocks.com')).toBe('tenant.forgeblocks.com');
  });

  it('should remove paths and trailing components', () => {
    expect(normalizeAicBaseUrl('tenant.forgeblocks.com/admin')).toBe('tenant.forgeblocks.com');
    expect(normalizeAicBaseUrl('tenant.forgeblocks.com/admin/console/users')).toBe('tenant.forgeblocks.com');
    expect(normalizeAicBaseUrl('tenant.forgeblocks.com?param=value')).toBe('tenant.forgeblocks.com');
    expect(normalizeAicBaseUrl('tenant.forgeblocks.com#section')).toBe('tenant.forgeblocks.com');
  });

  it('should remove port numbers', () => {
    expect(normalizeAicBaseUrl('tenant.forgeblocks.com:8080')).toBe('tenant.forgeblocks.com');
    expect(normalizeAicBaseUrl('https://tenant.forgeblocks.com:8080/admin')).toBe('tenant.forgeblocks.com');
  });

  it('should handle full URLs copied from browser', () => {
    expect(normalizeAicBaseUrl('https://tenant.forgeblocks.com/admin/console/realms/alpha/dashboard'))
      .toBe('tenant.forgeblocks.com');
    expect(normalizeAicBaseUrl('https://tenant.forgeblocks.com:443/admin?tab=users#section'))
      .toBe('tenant.forgeblocks.com');
  });

  it('should trim whitespace', () => {
    expect(normalizeAicBaseUrl('  tenant.forgeblocks.com  ')).toBe('tenant.forgeblocks.com');
    expect(normalizeAicBaseUrl('  https://tenant.forgeblocks.com/admin  ')).toBe('tenant.forgeblocks.com');
  });

  it('should handle subdomains', () => {
    expect(normalizeAicBaseUrl('https://my.sub.tenant.forgeblocks.com/admin'))
      .toBe('my.sub.tenant.forgeblocks.com');
  });
});
