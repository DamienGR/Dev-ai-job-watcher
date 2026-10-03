import type { Config } from '@netlify/functions';
import { createDataHandler } from '../../src/functions/data';

// Lecture des agrégats par le dashboard (SPEC.md §3.3).
export default createDataHandler();

export const config: Config = {
  path: '/api/data/*',
  method: 'GET',
};
