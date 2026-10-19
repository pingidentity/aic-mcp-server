import { describe, it, expect } from 'vitest';
import { escapeCrestStringLiteral } from '../../src/utils/crestHelpers.js';

/**
 * Single-pass decode model of the CREST filter tokenizer: inside a quoted
 * string literal, `\X` decodes to `X`.
 */
const decodeCrestStringLiteral = (value: string): string => value.replace(/\\(.)/g, '$1');

describe('crestHelpers', () => {
  // ===== escapeCrestStringLiteral =====
  describe('escapeCrestStringLiteral', () => {
    const cases = [
      { name: 'plain text "My App"', input: 'My App', expected: 'My App' },
      { name: 'a"b (embedded double quote)', input: 'a"b', expected: 'a\\"b' },
      { name: 'a\\b (embedded backslash)', input: 'a\\b', expected: 'a\\\\b' },
      {
        name: 'backslash immediately before double quote (a\\")',
        input: 'a\\"',
        expected: 'a\\\\\\"'
      },
      { name: 'trailing backslash (x\\)', input: 'x\\', expected: 'x\\\\' },
      { name: 'bare backslash', input: '\\', expected: '\\\\' },
      { name: 'a\\b"c (backslash then quote)', input: 'a\\b"c', expected: 'a\\\\b\\"c' },
      { name: 'a"\\b (quote then backslash)', input: 'a"\\b', expected: 'a\\"\\\\b' },
      { name: 'unicode text "café 文字 ✓"', input: 'café 文字 ✓', expected: 'café 文字 ✓' },
      { name: 'empty string', input: '', expected: '' }
    ];

    it.each(cases)('escapes $name', ({ input, expected }) => {
      expect(escapeCrestStringLiteral(input)).toBe(expected);
    });

    it.each(cases)('round-trips $name through the single-pass CREST decode', ({ input }) => {
      expect(decodeCrestStringLiteral(escapeCrestStringLiteral(input))).toBe(input);
    });

    it('emits exactly two backslashes for one input backslash (guard against double-escaping)', () => {
      // Input characters: a, \, b. Output must be a, \, \, b — exactly two
      // backslashes, never four. An implementation that matches two
      // backslashes per replacement would emit four.
      const escaped = escapeCrestStringLiteral('a\\b');
      expect(escaped).toBe('a\\\\b');
      expect(escaped.split('\\').length - 1).toBe(2);
    });

    it('emits three backslashes then a quote for backslash-before-quote input (guard against quotes-only escaping)', () => {
      // Input characters: a, \, ". Correct output: a, \, \, \, " — three
      // backslashes then the quote. A quotes-only escape would emit a, \, \, ",
      // whose single-pass decode yields a, \, " — a bare quote that terminates
      // the string literal and turns the rest of the filter into
      // attacker-controlled grammar.
      const input = 'a\\"';
      const escaped = escapeCrestStringLiteral(input);
      const quotesOnly = input.replace(/"/g, '\\"');

      expect(escaped).toBe('a\\\\\\"');
      expect(escaped).not.toBe(quotesOnly);
      expect(decodeCrestStringLiteral(quotesOnly)).toBe('a\\"'); // bare terminating quote
      expect(decodeCrestStringLiteral(escaped)).toBe(input);
    });

    it('is not idempotent — escaping an escaped value doubles its backslashes again', () => {
      // Callers must escape each value exactly once (see module docstring).
      const escaped = escapeCrestStringLiteral('a\\b');
      expect(escapeCrestStringLiteral(escaped)).not.toBe(escaped);
      expect(escapeCrestStringLiteral(escaped)).toBe('a\\\\\\\\b'); // four backslashes
    });
  });
});
