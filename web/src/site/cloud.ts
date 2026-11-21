import { fmtPct } from '../lib/format';
import { h } from '../ui';

// Piste 3 de l'en-tête de l'accueil, « le nuage de compétences » (variante de comparaison,
// D70, `?visuel=competences` sur l'aperçu de la PR) : les technologies les plus citées dans les
// offres du mois de référence, en taille selon leur part ; celles de l'IA sur fond teinté,
// celles en hausse sur 3 mois marquées d'une flèche. Du texte HTML, qui flotte doucement
// (animations CSS), immobile si le lecteur réduit les animations.

export interface CloudTech {
  id: string;
  label: string;
  /** Part des offres du mois qui citent la technologie. */
  share: number;
  ai: boolean;
  rising: boolean;
}

/** Ordre « du centre vers les bords » : les plus citées au milieu du nuage. */
function centerOut<T>(items: readonly T[]): T[] {
  const out: T[] = [];
  items.forEach((item, i) => (i % 2 === 0 ? out.push(item) : out.unshift(item)));
  return out;
}

export function startCloud(figure: HTMLElement, techs: readonly CloudTech[]): void {
  const max = Math.max(...techs.map((t) => t.share));
  const items = centerOut(techs).map((tech, i) => {
    const weight = Math.pow(tech.share / max, 0.85);
    const item = h(
      'li',
      { class: ['cloud-item', weight > 0.6 ? 'cloud-major' : '', tech.ai ? 'cloud-ai' : ''].filter(Boolean).join(' ') },
      tech.label,
      tech.rising ? h('span', { class: 'cloud-arrow', 'aria-hidden': 'true' }, '↑') : null,
      h('span', { class: 'visually-hidden' }, ` : ${fmtPct(tech.share)} des offres${tech.rising ? ', en hausse' : ''}`),
    );
    item.style.setProperty('--size', (13 + 16 * weight).toFixed(1));
    // Durées et départs décalés : aucun mot ne bouge au même rythme que son voisin.
    item.style.setProperty('--float', `${(6 + ((i * 7) % 5)).toFixed(1)}s`);
    item.style.setProperty('--delay', `${(-((i * 13) % 9)).toFixed(1)}s`);
    item.style.setProperty('--drift', `${i % 2 ? 4 : -4}px`);
    return item;
  });
  figure.prepend(h('ul', { class: 'cloud', 'aria-label': 'Technologies les plus citées' }, items));
  figure.classList.add('cloud-ready');
}
