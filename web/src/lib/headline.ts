import type { Scope } from './filters';
import { fmtDelta, fmtInt, fmtPct, fmtSalary, orMasked } from './format';
import {
  activeEmergingRoles,
  aiShare,
  newOffersTile,
  scopedNewOffers,
  type Mover,
  type NewOfferRow,
  type PremiumRow,
  type ShareValue,
  type WeekTile,
} from './indicators';
import { lastWeeks, weekLongLabel } from './periods';
import type { Meta } from './types';

// Chiffres de tête, communs aux tuiles de la vue d'ensemble du tableau de bord et à l'accueil
// du site (SPEC.md §17.2, §17.4) : mêmes données, mêmes calculs, même mise en forme.

export interface Headline {
  /** Nouvelles offres de la semaine de référence, dans le périmètre des filtres. */
  week: WeekTile;
  /** Part IA de la même semaine (groupes g1 à g8, sans filtre de groupe ni de rôle). */
  ai: ShareValue;
  /** Médianes IA / dev et prime IA, 12 derniers mois, France entière, toutes expériences. */
  premium: PremiumRow | null;
  /** Rôles des groupes émergents actifs sur les 4 dernières semaines. */
  emerging: { active: string[]; total: number };
}

export function headline(meta: Meta, rows: readonly NewOfferRow[], scope: Scope, premiumRows: readonly PremiumRow[]): Headline {
  const anyGroup = rows.filter((r) => scope.rowOk(r));
  const week = newOffersTile(scopedNewOffers(rows, scope), meta);
  return {
    week,
    ai: aiShare(anyGroup, meta, scope.groupOf, [week.week]),
    premium: premiumRows.find((r) => r.month === '*' && r.experience === '*') ?? null,
    emerging: activeEmergingRoles(anyGroup, meta, lastWeeks(week.week, 4)),
  };
}

/** Prime IA en k€, signée (« +8,3 k€ »), ou « n < 5 ». */
export function fmtPremium(premium: PremiumRow | null): string {
  return orMasked(premium?.premium, (v) => `${fmtDelta(v / 1000, 1)} k€`);
}

/** « Ce qui bouge », rôles : écart d'offres (« +12 (20 → 32) »). */
export function fmtRoleMove(m: Mover): string {
  return `${fmtDelta(m.delta)} (${fmtInt(m.previous)} → ${fmtInt(m.recent)})`;
}

/** « Ce qui bouge », technologies : écart de part en points (« +1,2 pt (3 % → 4,2 %) »). */
export function fmtTechMove(m: Mover): string {
  return `${fmtDelta(m.delta * 100, 1)} pt (${fmtPct(m.previous)} → ${fmtPct(m.recent)})`;
}

export interface Figure {
  id: 'offres' | 'part-ia' | 'prime-ia' | 'emergents';
  label: string;
  value: string;
  detail: string;
  /** Période partielle (SPEC.md §8.3). */
  partial: boolean;
}

/** Les quatre chiffres de l'accueil, mis en forme comme les tuiles du tableau de bord. */
export function headlineFigures(h: Headline): Figure[] {
  const { week, ai, premium, emerging } = h;
  return [
    {
      id: 'offres',
      label: 'Nouvelles offres',
      value: fmtInt(week.n),
      detail: `dev, data et IA, publiées en ${weekLongLabel(week.week)}`,
      partial: week.partial,
    },
    {
      id: 'part-ia',
      label: 'Part IA',
      value: orMasked(ai.share, fmtPct),
      detail: `${fmtInt(ai.part)} offres en IA sur n = ${fmtInt(ai.total)}, même semaine`,
      partial: week.partial,
    },
    {
      id: 'prime-ia',
      label: 'Prime IA',
      value: fmtPremium(premium),
      detail: premium
        ? `médiane des salaires annoncés : IA ${orMasked(premium.p50Ai, fmtSalary)} (n = ${fmtInt(premium.nAi)}), dev ${orMasked(premium.p50Dev, fmtSalary)} (n = ${fmtInt(premium.nDev)}), 12 derniers mois`
        : 'pas encore de salaires publiés',
      partial: false,
    },
    {
      id: 'emergents',
      label: 'Rôles émergents actifs',
      value: `${emerging.active.length} / ${emerging.total}`,
      detail: 'métiers nouveaux de l’IA avec au moins une offre sur les 4 dernières semaines',
      partial: week.partial,
    },
  ];
}
