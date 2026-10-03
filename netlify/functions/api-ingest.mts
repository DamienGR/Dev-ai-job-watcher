import type { Config } from '@netlify/functions';
import { createIngestHandler } from '../../src/functions/ingest';

// Réception des agrégats envoyés par le VPS, protégée par INGEST_SECRET (SPEC.md §3.3, D21).
export default createIngestHandler();

export const config: Config = {
  path: '/api/ingest/*',
  method: 'PUT',
};
