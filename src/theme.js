const THEME_KEY = "boardly_theme";
const THEMES = new Set(["system", "light", "dark"]);

export function getThemePreference() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  return THEMES.has(savedTheme) ? savedTheme : "system";
}

export function setThemePreference(theme) {
  if (!THEMES.has(theme)) return;
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
}

export function initializeTheme() {
  document.documentElement.dataset.theme = getThemePreference();
}
