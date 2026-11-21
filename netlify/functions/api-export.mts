import type { Config } from '@netlify/functions';
import { createExportHandler } from '../../src/functions/export';

// Export de revue mensuelle de la taxonomie, lu par la tâche planifiée Claude (SPEC.md §9.1).
export default createExportHandler();

export const config: Config = {
  path: '/api/export/*',
  method: 'GET',
};
