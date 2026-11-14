/**
 * Theme selection. 'light' is the default identity; 'volt' is the dark, sharp
 * alternative kept in themes/volt.css. No UI switches it yet: call
 * setTheme('volt') (or set localStorage 'memedeck.theme') to try it.
 */
export type ThemeName = 'light' | 'volt';

const THEME_KEY = 'memedeck.theme';

export function getTheme(): ThemeName {
  try {
    return localStorage.getItem(THEME_KEY) === 'volt' ? 'volt' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: ThemeName = getTheme()): void {
  if (theme === 'light') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

export function setTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* applies for this page load only */
  }
  applyTheme(theme);
}
