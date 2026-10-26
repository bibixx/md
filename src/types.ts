import type { MarkedToken } from 'marked';

export type Style = (text: string) => string;

export interface Padding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export type ThemeName = 'dark' | 'light';

export interface Theme {
  name: ThemeName;
  /** inline code, and fenced code without a language */
  permission: Style;
  codeBg: Style;
  link: Style;
}

export interface Highlighter {
  supportsLanguage(lang: string | undefined): boolean;
  highlight(code: string, options: { language: string }): string;
}

export interface RenderContext {
  theme: Theme;
  highlight?: Highlighter | null;
  hyperlinks: boolean;
  codePadding?: Partial<Padding>;
  tabWidth?: number;
  listDepth?: number;
  orderedListNumber?: number | null;
  parent?: MarkedToken | null;
  inListItemText?: boolean;
  listIndent?: string;
  quotesAround?: number;
}

/** A piece of the document that wraps itself to any width; `render` must depend only on `cols`. */
export interface Unit {
  blankLineAbove: boolean;
  isPagePadding?: boolean;
  render(cols: number): string[];
  estimate(cols: number): number;
}

/** The screen's top line is line `offset` of unit `unit`. */
export interface Position {
  unit: number;
  offset: number;
}

export type Align = 'left' | 'center' | 'right' | null | undefined;
