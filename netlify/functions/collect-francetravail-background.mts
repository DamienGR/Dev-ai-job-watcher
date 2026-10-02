import { createCollectFranceTravailHandler } from '../../src/functions/collectFranceTravail';
import { netlifyStores } from '../../src/storage/netlify';

// Collecte France Travail d'un run (SPEC.md §4.1), appelée en interne avec le secret partagé.
export default createCollectFranceTravailHandler({ stores: netlifyStores });
