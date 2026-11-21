import { legacyDashboardUrl } from './site/legacy';
import './site/site';

// Accueil (SPEC.md §17.2). Un ancien lien du tableau de bord part vers sa nouvelle adresse,
// sans entrée dans l'historique ; un fragment changé sur la page aussi.
function redirectLegacyLink(): void {
  const target = legacyDashboardUrl(location.hash);
  if (target) location.replace(target);
}

redirectLegacyLink();
window.addEventListener('hashchange', redirectLegacyLink);
