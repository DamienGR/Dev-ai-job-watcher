import type { CompiledTaxonomy } from '../core/taxonomy';
import type { Stores } from '../storage/store';
import type { Alerter } from './alert';
import type { Logger } from './log';
import { dataTaxonomyVersion, type ReclassifyReport } from './process';
import type { PushReport } from './push';

// Job `update` du VPS (SPEC.md §3.3, §9.3, D67), chaque jour à 04:00 UTC, en deux temps :
//
// 1. `updateCode` : `git fetch` puis avance rapide de `main`, `npm ci` si `package-lock.json`
//    a changé. Refuse une copie de travail modifiée ou une branche qui a divergé.
// 2. `applyTaxonomyUpdate`, lancé dans un nouveau processus pour tourner avec le code à jour :
//    si la version de taxonomy.yaml diffère de celle des données, reclassement complet de
//    l'historique, puis envoi des agrégats.
//
// Les deux temps passent par le verrou de `veille-job` : jamais en même temps qu'un run.

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Lance une commande dans le dépôt et rend la main à la fin (sortie capturée). */
export type CommandRunner = (command: string, args: string[]) => CommandResult;

/** Unités systemd du dépôt : copiées à la main dans ~/.config/systemd/user (deploy/vps/README.md). */
const UNITS_DIR = 'deploy/vps/systemd/';

export interface CodeUpdateReport {
  from: string;
  to: string;
  /** Fichiers modifiés par l'avance rapide. */
  changed: string[];
  npmCi: boolean;
}

export interface UpdateCodeDeps {
  run: CommandRunner;
  log: Logger;
  alert: Alerter;
  branch?: string;
}

const tail = (text: string) => text.trim().split('\n').slice(-5).join('\n');

/** Mise à jour du code du VPS. Lève, après une alerte, si une étape échoue. */
export async function updateCode(deps: UpdateCodeDeps): Promise<CodeUpdateReport> {
  const { run, log, alert, branch = 'main' } = deps;
  const exec = (command: string, args: string[]): string => {
    const result = run(command, args);
    if (result.status !== 0) {
      throw new Error(`${command} ${args.join(' ')} : code ${result.status}${result.stderr.trim() ? `\n${tail(result.stderr)}` : ''}`);
    }
    return result.stdout.trim();
  };

  try {
    const current = exec('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (current !== branch) throw new Error(`le dépôt est sur la branche ${current}, pas sur ${branch}`);
    const dirty = exec('git', ['status', '--porcelain', '--untracked-files=no']);
    if (dirty) throw new Error(`fichiers modifiés dans le dépôt :\n${dirty.split('\n').slice(0, 5).join('\n')}`);

    exec('git', ['fetch', '--quiet', 'origin', branch]);
    const from = exec('git', ['rev-parse', 'HEAD']);
    const to = exec('git', ['rev-parse', 'FETCH_HEAD']);
    if (from === to) {
      log('update.code', { status: 'up-to-date', commit: from });
      return { from, to, changed: [], npmCi: false };
    }
    if (run('git', ['merge-base', '--is-ancestor', 'HEAD', 'FETCH_HEAD']).status !== 0) {
      throw new Error(`${branch} local (${from.slice(0, 7)}) a divergé d'origin/${branch} (${to.slice(0, 7)}) : avance rapide impossible`);
    }
    const changed = exec('git', ['diff', '--name-only', 'HEAD', 'FETCH_HEAD']).split('\n').filter(Boolean);
    exec('git', ['merge', '--ff-only', '--quiet', 'FETCH_HEAD']);
    const npmCi = changed.includes('package-lock.json');
    if (npmCi) exec('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error']);
    log('update.code', { status: 'updated', from, to, files: changed.length, npmCi });

    const units = changed.filter((file) => file.startsWith(UNITS_DIR));
    if (units.length > 0) {
      await alert({
        kind: 'update-units',
        title: 'Mise à jour du VPS : unités systemd modifiées',
        message: `${units.join(', ')}\nÀ recopier : cp ~/Dev-ai-job-watcher/${UNITS_DIR}veille-* ~/.config/systemd/user/ && systemctl --user daemon-reload`,
        priority: 3,
      });
    }
    return { from, to, changed, npmCi };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('update.failed', { message });
    await alert({
      kind: 'update-error',
      title: 'Mise à jour du code du VPS en échec',
      message: `${message}\nLes runs continuent avec le code actuel. Relance : deploy/vps/veille-job update`,
    });
    throw error;
  }
}

export interface ApplyTaxonomyDeps {
  stores: Stores;
  log: Logger;
  alert: Alerter;
  taxonomy: CompiledTaxonomy;
  reclassify: () => Promise<ReclassifyReport>;
  push: () => Promise<PushReport>;
}

export type ApplyTaxonomyResult =
  | { status: 'no-data' | 'up-to-date'; version: number }
  | { status: 'reclassified'; version: number; report: ReclassifyReport; push: PushReport };

const pct = (part: number, total: number) => (total > 0 ? `${String(Math.round((part / total) * 1000) / 10).replace('.', ',')} %` : 'n/a');

/**
 * Applique la taxonomie courante aux données (SPEC.md §9.3) : rien si aucun run n'a été traité
 * ou si les données sont déjà à cette version ; sinon reclassement complet puis envoi.
 */
export async function applyTaxonomyUpdate(deps: ApplyTaxonomyDeps): Promise<ApplyTaxonomyResult> {
  const { stores, log, alert, taxonomy } = deps;
  const version = taxonomy.version;
  const dataVersion = await dataTaxonomyVersion(stores);
  if (dataVersion === null || dataVersion === version) {
    const status = dataVersion === null ? 'no-data' : 'up-to-date';
    log('update.taxonomy', { status, version });
    return { status, version };
  }
  try {
    const report = await deps.reclassify();
    const push = await deps.push();
    const effect = report.effect;
    await alert({
      kind: 'reclassified',
      title: `Taxonomie v${version} appliquée`,
      message:
        `${report.runs.length} runs reclassés (v${dataVersion} → v${version}) en ${Math.round(report.durationMs / 1000)} s, agrégats envoyés.` +
        (effect
          ? `\nDernier run ${effect.run} : ${pct(effect.before.classified, effect.before.retained)} des offres classées avant, ${pct(effect.after.classified, effect.after.retained)} après.`
          : ''),
      priority: 3,
    });
    return { status: 'reclassified', version, report, push };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('update.reclassify-failed', { from: dataVersion, to: version, message });
    await alert({
      kind: 'reclassify-error',
      title: `Reclassement v${dataVersion} → v${version} en échec`,
      message: `${message}\nLe site garde les chiffres précédents. Relance : deploy/vps/veille-job update --apply`,
    });
    throw error;
  }
}
