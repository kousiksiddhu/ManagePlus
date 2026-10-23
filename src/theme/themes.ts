// Theme registry. To add a theme: add a [data-theme="..."] token block in
// src/styles/global.css and register it here — nothing else needs to change.
export interface ThemeInfo {
  id: string;
  label: string;
  /** swatch color shown in the theme picker */
  swatch: string;
}

export const THEMES: ThemeInfo[] = [
  { id: 'light', label: 'Light', swatch: '#4f63f5' },
  { id: 'dark', label: 'Dark', swatch: '#171a21' },
  { id: 'ocean', label: 'Ocean', swatch: '#2dd4bf' },
  { id: 'sand', label: 'Sand', swatch: '#c26d3d' },
];

export const DEFAULT_THEME = 'light';
