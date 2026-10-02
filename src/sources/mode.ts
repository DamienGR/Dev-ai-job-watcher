import { env } from '../pipeline/env';

/** `live` : appels réels (défaut) ; `fixtures` : réponses enregistrées dans `fixtures/` (SPEC.md §13). */
export type SourceMode = 'live' | 'fixtures';

export function sourceMode(value: string | undefined = env('SOURCE_MODE')): SourceMode {
  if (value === undefined || value === '' || value === 'live') return 'live';
  if (value === 'fixtures') return 'fixtures';
  throw new Error(`SOURCE_MODE invalide : « ${value} » (attendu : live ou fixtures)`);
}
