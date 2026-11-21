import './site.css';
import { loadMeta } from '../data';
import { lastRunId } from '../lib/indicators';
import { weekLongLabel } from '../lib/periods';
import { applyTheme, initThemeButton, storedTheme } from './theme';

// Comportements communs à toutes les pages (SPEC.md §17.3) : thème, lien d'évitement, date de
// la dernière mise à jour dans le pied de page (lue dans `meta.json`).

function initSkipLink(): void {
  // Le tableau de bord route sur le fragment : le lien donne le focus au contenu sans le changer.
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a.skip')) {
    link.addEventListener('click', (event) => {
      const target = document.getElementById('contenu');
      if (!target) return;
      event.preventDefault();
      target.focus();
      target.scrollIntoView();
    });
  }
}

async function fillUpdated(): Promise<void> {
  const slot = document.querySelector<HTMLElement>('[data-site-updated]');
  if (!slot) return;
  try {
    const meta = await loadMeta();
    const date = new Date(meta.generatedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
    slot.textContent = `Dernier run : ${weekLongLabel(lastRunId(meta))} · taxonomie v${meta.taxonomy.version} · mis à jour le ${date}.`;
    slot.hidden = false;
  } catch {
    // Pas encore de données, ou API indisponible : le pied de page s'en passe.
  }
}

applyTheme(storedTheme());
const themeButton = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
if (themeButton) initThemeButton(themeButton);
initSkipLink();
void fillUpdated();
