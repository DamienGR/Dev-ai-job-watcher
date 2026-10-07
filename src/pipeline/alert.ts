import { systemClock, withRetry, type Clock } from '../sources/http';
import { env } from './env';
import type { Logger } from './log';

// Alertes (SPEC.md §10) : canal ntfy (D38), depuis le VPS et depuis le watchdog Netlify.
// Publication en JSON à la racine du serveur ntfy, seule forme qui transporte un titre en UTF-8
// sans encodage particulier (https://docs.ntfy.sh/publish/, « Publish as JSON »).

export interface Alert {
  /** Clé stable du type d'alerte (journal, dédoublonnage par run). */
  kind: string;
  title: string;
  message: string;
  /** Priorité ntfy : 3 par défaut, 4 « high », 5 « urgent ». */
  priority?: 3 | 4 | 5;
}

/** Envoie une alerte ; ne lève jamais : un canal en panne ne doit pas masquer l'erreur d'origine. */
export type Alerter = (alert: Alert) => Promise<boolean>;

export interface NtfyTarget {
  /** Racine du serveur, ex. `https://ntfy.sh/`. */
  server: string;
  topic: string;
}

/** Découpe `ALERT_NTFY_URL` (adresse du sujet, ex. `https://ntfy.sh/veille-x7k2…`). */
export function parseNtfyUrl(value: string): NtfyTarget {
  const url = new URL(value);
  const parts = url.pathname.split('/').filter(Boolean);
  const topic = parts.pop();
  if (url.protocol !== 'https:' || !topic) throw new Error('ALERT_NTFY_URL attendue sous la forme https://serveur/sujet');
  return { server: `${url.origin}/${parts.map((p) => `${p}/`).join('')}`, topic };
}

export interface NtfyOptions {
  url: string;
  /** Jeton d'accès (`tk_…`) si le sujet est protégé. */
  token?: string;
  log: Logger;
  fetch?: typeof fetch;
  clock?: Clock;
  delaysMs?: readonly number[];
  /** Préfixe du titre, pour distinguer l'émetteur (VPS ou Netlify). */
  origin?: string;
}

export function ntfyAlerter(options: NtfyOptions): Alerter {
  const { token, log, fetch: fetchImpl = fetch, clock = systemClock, origin } = options;
  const target = parseNtfyUrl(options.url);
  return async (alert) => {
    const body = {
      topic: target.topic,
      title: origin ? `[${origin}] ${alert.title}` : alert.title,
      message: alert.message,
      priority: alert.priority ?? 4,
      tags: ['warning'],
    };
    try {
      const response = await withRetry(
        () =>
          fetchImpl(target.server, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(body),
          }),
        { clock, delaysMs: options.delaysMs, onRetry: (info) => log('alert.retry', { kind: alert.kind, ...info }) },
      );
      await response.body?.cancel();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      log('alert.sent', { kind: alert.kind, title: alert.title });
      return true;
    } catch (error) {
      log('alert.failed', { kind: alert.kind, title: alert.title, message: error instanceof Error ? error.message : String(error) });
      return false;
    }
  };
}

/**
 * Alerteur d'après l'environnement (`ALERT_NTFY_URL`, `ALERT_NTFY_TOKEN`). Sans canal
 * configuré, l'alerte va seulement au journal, marquée `alert.unconfigured`.
 */
export function alerterFromEnv(log: Logger, options: { origin?: string; fetch?: typeof fetch } = {}): Alerter {
  const url = env('ALERT_NTFY_URL');
  if (!url) {
    return async (alert) => {
      log('alert.unconfigured', { kind: alert.kind, title: alert.title, message: alert.message });
      return false;
    };
  }
  return ntfyAlerter({ url, token: env('ALERT_NTFY_TOKEN') || undefined, log, ...options });
}
