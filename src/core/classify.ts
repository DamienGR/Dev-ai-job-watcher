import { matchesAny, NON_CLASSE, type CompiledRole, type CompiledTaxonomy } from './taxonomy';

export interface Classification {
  /** Id du rôle principal, ou `non_classe`. */
  role: string;
  /** Id du groupe du rôle principal, ou `non_classe`. */
  group: string;
  /** Autres rôles reconnus, par priorité décroissante. */
  secondaryRoles: string[];
  requalified: boolean;
}

function matchesTitle(role: CompiledRole, titleNorm: string): boolean {
  return matchesAny(role.include, titleNorm) && !matchesAny(role.exclude, titleNorm);
}

/**
 * Classification déterministe (SPEC.md §6.5). Le rôle se décide sur l'intitulé normalisé
 * seul ; la description normalisée ne sert qu'à la requalification. À priorité égale, le
 * rôle défini le plus tôt dans taxonomy.yaml l'emporte.
 */
export function classify(
  titleNorm: string,
  descriptionNorm: string,
  taxonomy: CompiledTaxonomy,
): Classification {
  const [main, ...others] = taxonomy.roles
    .filter((role) => matchesTitle(role, titleNorm))
    .sort((a, b) => b.priority - a.priority || a.order - b.order);

  if (!main) {
    return { role: NON_CLASSE, group: NON_CLASSE, secondaryRoles: [], requalified: false };
  }

  let role = main;
  if (main.requalify && matchesAny(taxonomy.signals[main.requalify.signal], descriptionNorm)) {
    // L'existence de la cible est garantie par checkTaxonomy.
    role = taxonomy.roleById.get(main.requalify.to) ?? main;
  }

  return {
    role: role.id,
    group: role.group,
    secondaryRoles: others.map((r) => r.id).filter((roleId) => roleId !== role.id),
    requalified: role !== main,
  };
}
