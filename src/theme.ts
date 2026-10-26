import chalk from 'chalk';
import type { Style, Theme, ThemeName } from './types.ts';

type RGB = [number, number, number];

// Claude Code's built-in theme values for the colours markdown uses.
const themes: Record<ThemeName, { permission: RGB; codeBg: RGB; link: Style }> = {
  dark: { permission: [177, 185, 249], codeBg: [30, 30, 30], link: chalk.blueBright },
  light: { permission: [87, 105, 247], codeBg: [244, 244, 244], link: chalk.blue },
};

// COLORFGBG is "fg;bg" (set by iTerm, rxvt, ...); bg 0-6 or 8 is a dark background.
function detect(): ThemeName {
  const bg = Number(Bun.env.COLORFGBG?.split(';').at(-1));
  if (Number.isNaN(bg)) return 'dark';
  return bg <= 6 || bg === 8 ? 'dark' : 'light';
}

export function getTheme(name: ThemeName = detect()): Theme {
  const t = themes[name];
  return {
    name,
    permission: (s) => chalk.rgb(...t.permission)(s),
    codeBg: (s) => chalk.bgRgb(...t.codeBg)(s),
    link: t.link,
  };
}
