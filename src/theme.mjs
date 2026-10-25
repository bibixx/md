import chalk from 'chalk';

// Claude Code's built-in theme values for the colours markdown uses.
const themes = {
  dark: { permission: [177, 185, 249], codeBg: [30, 30, 30], link: chalk.blueBright },
  light: { permission: [87, 105, 247], codeBg: [244, 244, 244], link: chalk.blue },
};

// COLORFGBG is "fg;bg" (set by iTerm, rxvt, ...); bg 0-6 or 8 is a dark background.
function detect() {
  const bg = Number(process.env.COLORFGBG?.split(';').at(-1));
  if (Number.isNaN(bg)) return 'dark';
  return bg <= 6 || bg === 8 ? 'dark' : 'light';
}

export function getTheme(name = detect()) {
  const t = themes[name] ?? themes.dark;
  return {
    name,
    permission: (s) => chalk.rgb(...t.permission)(s),
    // md's own: a faint background behind code blocks (Claude Code has none)
    codeBg: (s) => chalk.bgRgb(...t.codeBg)(s),
    link: t.link,
  };
}
