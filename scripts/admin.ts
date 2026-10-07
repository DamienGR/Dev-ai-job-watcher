// Job `admin` du VPS (SPEC.md §3.3) : relance à la main d'une étape d'un run. Remplace
// `api-admin` (D21) ; s'utilise en SSH ou par Remote Control, sous l'utilisateur `veille` :
//
//   deploy/vps/veille-job admin <commande> [--run-id 2026-W41] [--reset] [--force]
//
// Commandes :
//   collect-ft        collecte France Travail (reprise ; --reset repart de zéro pour ce run)
//   process           traitement du run (rejouable)
//   push              envoi des agrégats au site
//   weekly-run        job complet ; --force autorise de nouvelles tentatives après 3 échecs
//   status            état du run : étapes, tentatives, erreurs, dernière sauvegarde
//   simulate-failure  simule un run en échec et envoie la vraie alerte (test du canal)
//   collect-adzuna    lot 3 ; reclassify : lot 6
import { parseArgs } from 'node:util';
import { BACKUP_STATE_KEY, type BackupState } from '../src/pipeline/backup';
import { loadProcessRecord } from '../src/pipeline/processRecord';
import { isRunId, runIdFor } from '../src/pipeline/runId';
import { loadStepState } from '../src/pipeline/runState';
import { loadWeeklyState, runWeekly } from '../src/pipeline/weeklyRun';
import { collectReport } from '../src/sources/source';
import { memoryStores } from '../src/storage/memory';
import { getJson } from '../src/storage/store';
import { dataDirOf, jobContext, loadDotEnv } from './jobs';

loadDotEnv();

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'run-id': { type: 'string' },
    'data-dir': { type: 'string' },
    reset: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});

const LATER: Record<string, number> = { 'collect-adzuna': 3, reclassify: 6 };
const COMMANDS = ['collect-ft', 'process', 'push', 'weekly-run', 'status', 'simulate-failure'] as const;
type Command = (typeof COMMANDS)[number];

/** Erreur d'usage : message seul, sans pile. */
function usage(message: string): never {
  console.error(`admin : ${message}`);
  process.exit(64);
}

const command = positionals[0];
if (command && command in LATER) usage(`la commande « ${command} » arrive au lot ${LATER[command]}`);
if (!COMMANDS.includes(command as Command)) usage(`commande attendue : ${COMMANDS.join(', ')} (reçu : ${command ?? 'rien'})`);
if (values.reset && command !== 'collect-ft') usage('--reset ne vaut que pour collect-ft');

const runId = values['run-id'] ?? runIdFor();
if (!isRunId(runId)) usage(`runId invalide : ${runId} (attendu : AAAA-Wss)`);
const ctx = await jobContext(dataDirOf(values['data-dir']));

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));

switch (command as Command) {
  case 'collect-ft': {
    const report = await ctx.collectFt(runId, { reset: values.reset });
    print(report);
    process.exitCode = report.status === 'complete' ? 0 : 1;
    break;
  }
  case 'process': {
    const record = await ctx.process(runId);
    print(record);
    process.exitCode = record.status === 'complete' ? 0 : 1;
    break;
  }
  case 'push':
    print(await ctx.push());
    break;
  case 'weekly-run': {
    const state = await runWeekly(runId, { ...ctx, force: values.force });
    print(state);
    process.exitCode = state.status === 'complete' ? 0 : 1;
    break;
  }
  case 'status': {
    const collect = await loadStepState(ctx.stores.state, runId, 'collect-ft');
    const processRecord = await loadProcessRecord(ctx.stores.state, runId);
    print({
      runId,
      dataDir: ctx.dataDir,
      weeklyRun: await loadWeeklyState(ctx.stores, runId),
      collectFt: collect && collectReport('francetravail', collect),
      process: processRecord && {
        status: processRecord.status,
        startedAt: processRecord.startedAt,
        durationMs: processRecord.durationMs,
        retained: processRecord.counters.retained,
        newOffers: processRecord.counters.newOffers,
        error: processRecord.error,
      },
      backup: await getJson<BackupState>(ctx.stores.state, BACKUP_STATE_KEY),
    });
    break;
  }
  case 'simulate-failure': {
    // Run fictif en mémoire, une seule tentative : seule l'alerte sort du VPS.
    const state = await runWeekly('2000-W01', {
      stores: memoryStores(),
      log: ctx.log,
      alert: ctx.alert,
      maxAttempts: 1,
      collectFt: async () => {
        throw new Error('échec simulé (admin simulate-failure), aucune donnée touchée');
      },
      process: async () => {
        throw new Error('non appelé');
      },
      push: async () => {
        throw new Error('non appelé');
      },
    });
    print({ status: state.status, alerts: state.alerts });
    process.exitCode = state.alerts.length > 0 ? 0 : 1;
    break;
  }
}
