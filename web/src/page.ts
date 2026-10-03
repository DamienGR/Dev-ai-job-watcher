import type { Filters, Scope } from './lib/filters';
import type { Meta } from './lib/types';

/** Ce qu'une page reçoit pour s'afficher. */
export interface PageContext {
  meta: Meta;
  filters: Filters;
  scope: Scope;
  /** Paramètres propres à la page (hors filtres globaux). */
  params: URLSearchParams;
  setParam(name: string, value: string | null): void;
  load<T>(name: string): Promise<T>;
  root: HTMLElement;
  /** Nettoyage à faire en quittant la page (graphiques, carte). */
  onDispose(fn: () => void): void;
}

export interface Page {
  id: string;
  title: string;
  /** Paramètres propres à la page, conservés dans l'URL. */
  params?: string[];
  render(ctx: PageContext): Promise<void>;
}
