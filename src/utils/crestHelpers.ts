/**
 * CREST filter string-literal escaping.
 *
 * Tools that build CREST `_queryFilter` expressions interpolate caller-supplied
 * values into quoted string literals (`name eq "${value}"`). A raw `"` in the
 * value would terminate the literal and let the rest of the value parse as
 * filter grammar (injection); a raw `\` would escape whatever follows it,
 * including inserted quote escapes or the literal's closing quote.
 *
 * The CREST filter tokenizer decodes `\X` to `X` inside a quoted literal in a
 * single pass, so the backslash must be doubled BEFORE the double quote is
 * escaped. Escaping in the other order lets a caller-supplied backslash
 * neutralize the inserted escape backslash: input `x\"` would produce filter
 * text `x\\"`, which decodes to the value `x\` followed by a literal-
 * terminating quote — everything after it is attacker-controlled grammar.
 *
 * This function is NOT idempotent: escaping an already-escaped value doubles
 * its backslashes again. Escape each value exactly once.
 *
 * @param value - The raw value to interpolate into a CREST string literal
 * @returns The escaped value; applying the single-pass `\X` to `X` decode restores `value`
 * @example
 * escapeCrestStringLiteral('My App') // 'My App'
 * escapeCrestStringLiteral('a"b') // 'a\\"b'
 * escapeCrestStringLiteral('a\\b') // 'a\\\\b'
 * escapeCrestStringLiteral('a\\"') // 'a\\\\\\"'
 */
export function escapeCrestStringLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
