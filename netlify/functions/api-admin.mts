import type { Config } from '@netlify/functions';
import { createAdminRunHandler } from '../../src/functions/adminRun';

// Relance manuelle d'une étape d'un run, protégée par ADMIN_TOKEN (SPEC.md §3.3).
export default createAdminRunHandler();

export const config: Config = {
  path: '/api/admin/run',
  method: 'POST',
};
