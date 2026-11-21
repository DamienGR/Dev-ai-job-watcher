// Applique le thème choisi avant le premier affichage (voir web/src/site/theme.ts).
try {
  const theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Stockage indisponible : thème du système.
}
