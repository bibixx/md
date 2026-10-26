// Sample for the md/lowercase-hex-escapes rule (see test/lint-lowercase-hex-escapes.test.ts).
// Excluded from linting; the test lints a copy of it.
export const string = '\x1b[0m';
export const unicode = '\u00e9 and \u{1f600}';
export const template = `\x1b[${String(1)}m`;
export const regex = /[\x00-\x1f]/u;

// none of these are escapes with uppercase hex digits
export const lowercase = '\x1b[0m \u00e9';
export const escapedBackslash = '\\x1B';
export const hexNumber = 0x1F;
export const plainText = 'ABCDEF';
