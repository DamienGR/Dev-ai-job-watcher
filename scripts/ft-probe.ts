// Sonde l'API France Travail réelle pour trancher les points [À VÉRIFIER] du lot 1
// (SPEC.md §4.1, §15.2, §15.3) : plafond de pagination, format des dates, sémantique de
// `motsCles`, paramètre `region`, champs des offres, codes ROME M18. Imprime un rapport
// Markdown ; aucune donnée de contact n'y figure (noms de champs, totaux et codes seulement).
//
//   npm run probe:ft          (identifiants FT_CLIENT_ID / FT_CLIENT_SECRET requis)
import { loadTaxonomy } from '../src/core/taxonomy';
import { requireEnv } from '../src/pipeline/env';
import { DEPARTEMENTS } from '../src/refs';
import { LiveFtApi, type FtOffer } from '../src/sources/francetravail/api';
import { formatFtDate, romeCodes } from '../src/sources/francetravail/partitions';
import { HttpError } from '../src/sources/http';

try {
  process.loadEnvFile('.env');
} catch {
  // Pas de fichier .env : on s'en tient à l'environnement.
}

const api = new LiveFtApi({ clientId: requireEnv('FT_CLIENT_ID'), clientSecret: requireEnv('FT_CLIENT_SECRET') });
const taxonomy = await loadTaxonomy();
const lines: string[] = [];
const out = (line = '') => lines.push(line);

/** Total d'une requête, ou le motif de son échec. */
async function probe(params: Record<string, string>, range: [number, number] = [0, 0]): Promise<string> {
  try {
    const page = await api.search(params, range);
    return `${page.total} au total, ${page.offers.length} reçues`;
  } catch (error) {
    return error instanceof HttpError ? `refusé (${error.message})` : `erreur (${String(error)})`;
  }
}

async function total(params: Record<string, string>): Promise<number | null> {
  try {
    return (await api.search(params, [0, 0])).total;
  } catch {
    return null;
  }
}

function distribution(values: unknown[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, n]) => `\`${value}\` ${n}`)
    .join(', ');
}

function keyPresence(objects: unknown[]): string {
  const counts = new Map<string, number>();
  for (const object of objects) {
    if (object && typeof object === 'object') {
      for (const key of Object.keys(object)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, n]) => `\`${key}\` (${n})`)
    .join(', ');
}

await api.preflight();
out(`# Sonde de l'API France Travail — ${new Date().toISOString()}`);
out();
out('Jeton OAuth obtenu (scope `api_offresdemploiv2 o2dsoffre`).');

out();
out('## 1. Plafond de pagination (`range`, §4.1)');
const broad = { codeROME: 'M1805' };
out(`Requête nationale \`codeROME=M1805\` : ${await probe(broad)}.`);
for (const [first, last] of [
  [0, 149],
  [1000, 1149],
  [1050, 1199],
  [1150, 1299],
  [2999, 3148],
  [3000, 3149],
  [3150, 3299],
] as [number, number][]) {
  out(`- \`range=${first}-${last}\` : ${await probe(broad, [first, last])}`);
}

out();
out('## 2. `minCreationDate` / `maxCreationDate` (§4.1)');
const now = Date.now();
const from = now - 30 * 86_400_000;
const dated = { codeROME: 'M1805', departement: '75' };
out(`- sans dates : ${await probe(dated)}`);
out(`- \`${formatFtDate(from)}\` → \`${formatFtDate(now)}\` : ${await probe({ ...dated, minCreationDate: formatFtDate(from), maxCreationDate: formatFtDate(now) })}`);
out(`- \`minCreationDate\` seul : ${await probe({ ...dated, minCreationDate: formatFtDate(from) })}`);
out(`- \`maxCreationDate\` seul : ${await probe({ ...dated, maxCreationDate: formatFtDate(now) })}`);
out(`- date sans heure : ${await probe({ ...dated, minCreationDate: formatFtDate(from).slice(0, 10), maxCreationDate: formatFtDate(now).slice(0, 10) })}`);
out(`- avec millisecondes : ${await probe({ ...dated, minCreationDate: new Date(from).toISOString(), maxCreationDate: new Date(now).toISOString() })}`);

out();
out('## 3. `motsCles` (§4.1, passe B)');
for (const keyword of ['data', 'engineer', 'data,engineer', 'data engineer', 'forward deployed', 'NLP', 'IA générative', 'développeur agents IA']) {
  out(`- \`motsCles=${keyword}\` : ${await probe({ motsCles: keyword })}`);
}
out('Lecture : si `data,engineer` ≤ min(`data`, `engineer`), les mots-clés sont combinés en ET.');

out();
out('## 4. Paramètres `region` et `departement` (§4.1, passe B)');
const regionTotal = await total({ codeROME: 'M1805', region: '11' });
let sum = 0;
for (const d of DEPARTEMENTS.filter((dep) => dep.region === '11')) sum += (await total({ codeROME: 'M1805', departement: d.code })) ?? 0;
out(`- \`region=11\` : ${regionTotal ?? 'refusé'} ; somme des 8 départements d'Île-de-France : ${sum}`);
out(`- \`departement=75,92\` (plusieurs valeurs) : ${await probe({ codeROME: 'M1805', departement: '75,92' })}`);

out();
out('## 5. Champs des offres (150 offres, Paris, codes ROME de la taxonomie)');
const offers: FtOffer[] = (await api.search({ codeROME: romeCodes(taxonomy).join(','), departement: '75' }, [0, 149])).offers;
const field = (name: string) => offers.map((offer) => offer[name]);
const nested = (name: string) => field(name).filter((value) => value && typeof value === 'object');
out(`- Champs de premier niveau : ${keyPresence(offers)}`);
for (const name of ['lieuTravail', 'entreprise', 'salaire', 'origineOffre', 'contact', 'agence', 'contexteTravail']) {
  out(`- Sous-champs de \`${name}\` : ${keyPresence(nested(name)) || 'absent'}`);
}
for (const name of ['typeContrat', 'natureContrat', 'experienceExige', 'qualificationCode', 'alternance', 'secteurActivite']) {
  out(`- \`${name}\` : ${distribution(field(name))}`);
}
const withNaf = offers.filter((offer) => typeof offer.codeNAF === 'string').length;
out(`- \`codeNAF\` renseigné : ${withNaf}/${offers.length} (ex. ${distribution(field('codeNAF').slice(0, 5))})`);
const sample = (values: unknown[]) => values.filter(Boolean).slice(0, 6).map((v) => `\`${String(v)}\``).join(', ');
out(`- \`lieuTravail.libelle\` : ${sample(nested('lieuTravail').map((l) => (l as Record<string, unknown>).libelle))}`);
out(`- \`lieuTravail.commune\` : ${sample(nested('lieuTravail').map((l) => (l as Record<string, unknown>).commune))}`);
out(`- \`salaire.libelle\` : ${sample(nested('salaire').map((s) => (s as Record<string, unknown>).libelle))}`);
out(`- \`salaire.commentaire\` : ${sample(nested('salaire').map((s) => (s as Record<string, unknown>).commentaire))}`);
out(`- \`experienceLibelle\` : ${sample(field('experienceLibelle'))}`);
out(`- \`dateCreation\` : ${sample(field('dateCreation'))}`);

out();
out('## 6. Codes ROME M18 (§15.3)');
for (let i = 1; i <= 20; i++) {
  const code = `M18${String(i).padStart(2, '0')}`;
  const n = await total({ codeROME: code });
  out(`- \`${code}\` : ${n === null ? 'refusé' : `${n} offres`}${romeCodes(taxonomy).includes(code) ? ' (dans la taxonomie)' : ''}`);
}

out();
out('## 7. Volume de la passe A (§4.1)');
out(`- Codes ROME de la taxonomie, France entière : ${await probe({ codeROME: romeCodes(taxonomy).join(',') })}`);
out();
out(`Appels effectués : ${api.stats.calls}, nouvelles tentatives : ${api.stats.retries}.`);

console.log(lines.join('\n'));
