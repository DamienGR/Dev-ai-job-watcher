// Géométrie de la mini-courbe de l'accueil (`site/trend.ts`), sans DOM pour être testée.

/** Repère du SVG, étiré à la largeur de la page. */
export const WIDTH = 600;
export const HEIGHT = 160;

/** Abscisse en pourcentage de la largeur, pour la période `i` sur `count`. */
export function xPercent(i: number, count: number): number {
  return count > 1 ? (i / (count - 1)) * 100 : 50;
}

/** Points de la ligne dans le repère du SVG (0 en bas, maximum à 90 % de la hauteur). */
export function trendPoints(values: readonly number[]): [number, number][] {
  const max = Math.max(1, ...values);
  return values.map((v, i) => [(xPercent(i, values.length) / 100) * WIDTH, HEIGHT - (v / max) * HEIGHT * 0.9]);
}
