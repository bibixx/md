import { definePlugin } from '@oxlint/plugins';
import { lowercaseHexEscapes } from './lowercase-hex-escapes.ts';

export default definePlugin({
  meta: { name: 'md' },
  rules: { 'lowercase-hex-escapes': lowercaseHexEscapes },
});
