import type { Config } from '@netlify/functions';
import { createWatchdogHandler } from '../../src/functions/watchdog';

// Alerte si aucun run n'a réussi depuis 8 jours (SPEC.md §3.3, §10), chaque jour à 09:00 UTC.
export default createWatchdogHandler();

export const config: Config = {
  schedule: '0 9 * * *',
};
