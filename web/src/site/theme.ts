// Thème clair / sombre de tout le site (D36) : suit le système, ou le choix enregistré dans le
// navigateur. `public/theme.js` applique ce choix avant le premier affichage.

export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const LABELS: Record<Theme, string> = { auto: 'Thème : système', light: 'Thème : clair', dark: 'Thème : sombre' };

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem('theme');
    return THEMES.includes(value as Theme) ? (value as Theme) : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(theme: Theme): void {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // Stockage indisponible : le choix vaut pour cette visite.
  }
}

/** Bouton de l'en-tête : système → clair → sombre ; prévient les graphiques (`themechange`). */
export function initThemeButton(button: HTMLButtonElement): void {
  let theme = storedTheme();
  button.textContent = LABELS[theme];
  button.hidden = false;
  button.addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
    applyTheme(theme);
    button.textContent = LABELS[theme];
    window.dispatchEvent(new Event('themechange'));
  });
}
