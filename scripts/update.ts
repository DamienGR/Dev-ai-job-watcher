// Job `update` du VPS (SPEC.md §3.3, §9.3, D67) : mise à jour du code, puis application de la
// taxonomie (reclassement complet si sa version a changé).
//
//   deploy/vps/veille-job update            git fetch + avance rapide de main, npm ci si besoin,
//                                           puis `update --apply` dans un nouveau processus
//   deploy/vps/veille-job update --apply    reclassement et envoi seulement, si la version de
//                                           taxonomy.yaml diffère de celle des données
//
// Sur le VPS, lancé chaque jour à 04:00 UTC par le timer `veille-update`. Code de sortie 0 si
// tout s'est bien passé, 1 sinon (alerte envoyée).
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { alerterFromEnv } from '../src/pipeline/alert';
import { jsonLogger } from '../src/pipeline/log';
import { reclassifyAll } from '../src/pipeline/process';
import { applyTaxonomyUpdate, updateCode, type CommandRunner } from '../src/pipeline/update';
import { dataDirOf, jobContext, loadDotEnv } from './jobs';

loadDotEnv();

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    'data-dir': { type: 'string' },
  },
});

if (values.apply) {
  const ctx = await jobContext(dataDirOf(values['data-dir']));
  const result = await applyTaxonomyUpdate({
    ...ctx,
    reclassify: () => reclassifyAll({ stores: ctx.stores, log: ctx.log, taxonomy: ctx.taxonomy }),
  });
  console.log(JSON.stringify(result.status === 'reclassified' ? { ...result, push: { files: result.push.files.length } } : result, null, 2));
} else {
  // Le dépôt est le répertoire courant (`veille-job` s'y place).
  const run: CommandRunner = (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr || (result.error?.message ?? '') };
  };
  const report = await updateCode({ run, log: jsonLogger, alert: alerterFromEnv(jsonLogger, { origin: 'VPS' }) });
  console.log(JSON.stringify({ ...report, changed: report.changed.length }, null, 2));
  // Nouveau processus : la suite tourne avec le code et les dépendances à jour.
  const args = ['scripts/update.ts', '--apply', ...(values['data-dir'] ? ['--data-dir', values['data-dir']] : [])];
  const apply = spawnSync('node_modules/.bin/tsx', args, { stdio: 'inherit' });
  process.exitCode = apply.status ?? 1;
}
