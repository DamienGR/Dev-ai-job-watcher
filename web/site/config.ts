// Pages du site public (SPEC.md §17.2) et réglages communs, lus au build par le gabarit
// (`template.ts`) et par le plugin Vite. Une page ajoutée par un lot S3 à S6 s'inscrit ici.

export interface SitePage {
  id: string;
  /** Adresse publique, terminée par `/` (ou fichier, pour la 404). */
  path: string;
  /** Fichier HTML d'entrée, relatif à `web/`. */
  file: string;
  title: string;
  description: string;
  /** Libellé dans la navigation de l'en-tête, si la page y figure. */
  nav?: string;
  /** Texte de la page dans `web/content/`, converti en HTML au build. */
  content?: string;
  /**
   * Date (AAAA-MM-JJ) de la dernière révision du texte, affichée avec la mention de
   * rédaction avec Claude (SPEC.md §17.1, exigé) ; requise pour une page qui a un texte.
   */
  updated?: string;
  /** Image de partage `web/public/og/<id>.png` ; à défaut, celle de l'accueil. */
  ogImage?: boolean;
  /** Page d'erreur : ni URL canonique ni indexation. */
  error?: boolean;
}

export const SITE = {
  name: 'Baromètre emploi Dev & IA',
  tagline: 'L’emploi dev, data et IA en France, chaque semaine',
  locale: 'fr_FR',
  /**
   * Adresse publique. Netlify fournit `URL` au build (adresse principale du site, D46 au
   * lancement) ; en local, l'adresse retenue.
   */
  url: (process.env.URL ?? 'https://barometre.dg-tech.dev').replace(/\/$/, ''),
  /** `false` jusqu'au lancement (D47, SPEC.md §17.5) ; `SITE_INDEXABLE=1` pour mesurer. */
  indexable: process.env.SITE_INDEXABLE === '1',
  repository: 'https://github.com/DamienGR/Dev-ai-job-watcher',
  author: { name: 'Damien Gros', site: 'https://dg-tech.dev', label: 'DG Tech' },
} as const;

export const PAGES: SitePage[] = [
  {
    id: 'accueil',
    path: '/',
    file: 'index.html',
    title: SITE.name,
    description:
      'Combien d’offres d’emploi dev, data et IA en France, pour quels métiers, quels salaires, où : statistiques hebdomadaires tirées des offres France Travail.',
    ogImage: true,
  },
  {
    id: 'tableau-de-bord',
    path: '/tableau-de-bord/',
    file: 'tableau-de-bord/index.html',
    title: 'Tableau de bord',
    description:
      'Volumes d’offres, métiers, salaires et carte des offres dev, data et IA en France, mis à jour chaque semaine, avec filtres par région, métier et contrat.',
    nav: 'Tableau de bord',
    ogImage: true,
  },
  {
    id: 'ia',
    path: '/ia/',
    file: 'ia/index.html',
    title: 'L’IA dans ce projet',
    description:
      'Comment Claude a écrit la spécification et le code de ce baromètre, ce que Damien Gros a décidé, et pourquoi les chiffres sont calculés sans IA.',
    nav: 'L’IA dans ce projet',
    content: 'ia.md',
    updated: '2026-11-21',
    ogImage: true,
  },
  {
    id: 'methodologie',
    path: '/methodologie/',
    file: 'methodologie/index.html',
    title: 'Méthodologie',
    description:
      'Source, collecte, classement des offres par métier, règles d’affichage et limites des chiffres du Baromètre emploi Dev & IA.',
    nav: 'Méthodologie',
    content: 'methodologie.md',
    updated: '2026-11-21',
    ogImage: true,
  },
  {
    id: 'a-propos',
    path: '/a-propos/',
    file: 'a-propos/index.html',
    title: 'À propos',
    description: 'Qui publie le Baromètre emploi Dev & IA et pourquoi : Damien Gros, développeur Drupal et PHP indépendant (DG Tech).',
    nav: 'À propos',
    content: 'a-propos.md',
    updated: '2026-11-21',
    ogImage: true,
  },
  {
    id: 'mentions-legales',
    path: '/mentions-legales/',
    file: 'mentions-legales/index.html',
    title: 'Mentions légales',
    description: 'Éditeur, hébergeur, sources des données et licences du Baromètre emploi Dev & IA. Aucun cookie, aucune mesure d’audience.',
    content: 'mentions-legales.md',
    updated: '2026-11-21',
  },
  {
    id: '404',
    path: '/404.html',
    file: '404.html',
    title: 'Page introuvable',
    description: 'Cette adresse ne correspond à aucune page du Baromètre emploi Dev & IA.',
    error: true,
  },
];

export function pageByFile(file: string): SitePage | undefined {
  return PAGES.find((page) => page.file === file);
}
