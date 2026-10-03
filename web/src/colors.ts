import type { Meta } from './lib/types';

// Couleurs des groupes : palette catégorielle à 8 places, dans l'ordre fixe de la taxonomie
// (g1 à g8), validée en clair et en sombre ; gris pour le périmètre élargi et les non
// classés. Les valeurs vivent dans les variables CSS (`--series-1`…), une par thème.

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Couleur d'un groupe, suivant sa place dans la taxonomie (jamais son rang à l'écran). */
export function groupColor(meta: Meta, group: string): string {
  const index = meta.labels.groups.findIndex((g) => g.id === group);
  if (index >= 0 && index < 8) return cssVar(`--series-${index + 1}`);
  return cssVar(group === 'non_classe' ? '--series-other-2' : '--series-other');
}

/**
 * Couleurs des rôles affichés ensemble (8 au plus, dans l'ordre de la taxonomie) : une place
 * de la palette chacun, pour qu'aucune paire de courbes ne partage une couleur.
 */
export function roleColors(roles: readonly string[]): Map<string, string> {
  return new Map(roles.slice(0, 8).map((role, index) => [role, cssVar(`--series-${index + 1}`)]));
}

/** Rampe séquentielle bleue (choroplèthe), du clair au foncé. */
export function sequentialRamp(): string[] {
  return [1, 2, 3, 4, 5, 6].map((i) => cssVar(`--seq-${i}`));
}
