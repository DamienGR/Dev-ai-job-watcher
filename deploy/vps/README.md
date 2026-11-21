# VPS : installation des jobs, des alertes et de la sauvegarde (lot 5)

Procédure pour le VPS OVH (Ubuntu 26.04), préparé le 3 octobre 2026 :
utilisateur dédié `veille` (sans `sudo` ni `docker`, `Linger=yes`), Node 22, clé de déploiement
en lecture seule, dépôt cloné dans `/home/veille/Dev-ai-job-watcher`. Références : SPEC.md §3,
§10, §12 et décisions D21, D37 à D42.

Ce qui tourne sur le VPS, en unités systemd **utilisateur** de `veille` (aucune unité système,
aucun port entrant) :

| Unité | Quand (UTC) | Rôle |
|---|---|---|
| `veille-weekly-run.timer` | lundi 05:00, 06:00, 07:00 | Collecte France Travail, traitement, envoi des agrégats. Une relance reprend à l'étape incomplète, ne fait rien si le run est complet ; alerte après la 3e tentative. |
| `veille-backup.timer` | lundi 09:00 | Copie chiffrée de `DATA_DIR` vers Cloudflare R2 (restic), alerte en cas d'échec. |
| `veille-update.timer` | chaque jour 04:00 | Avance rapide de `main`, `npm ci` si besoin ; si la version de `taxonomy.yaml` a changé, reclassement de tout l'historique puis envoi des agrégats (lot 6, D67). |
| `veille-remote-control.service` | au démarrage | Facultatif : Remote Control dans une session tmux (étape 10). |

Chaque job passe par `deploy/vps/veille-job`, qui charge le fichier d'environnement et prend le
verrou `DATA_DIR/.lock` : un seul job à la fois, un job qui trouve le verrou pris attend.

Qui fait quoi : les étapes 1 à 5 te reviennent (`sudo`, comptes, secrets). Les étapes 6 à 9 ne
demandent aucun secret ; je peux les faire par Remote Control si tu me le dis.

---

## 1. Installer restic (sous `ubuntu`)

```bash
sudo apt install -y restic
restic version
```

## 2. Alertes ntfy (D38)

1. Installe l'application ntfy sur ton téléphone (App Store ou Google Play).
2. Choisis un sujet impossible à deviner : sur ntfy.sh, quiconque connaît le nom du sujet peut
   lire ses messages. Les alertes ne contiennent aucun secret, mais autant rester discret :

   ```bash
   echo "veille-$(openssl rand -hex 12)"
   ```

3. Dans l'application : « + », serveur `ntfy.sh` par défaut, colle le nom du sujet.
4. L'adresse complète, `https://ntfy.sh/<sujet>`, va dans `ALERT_NTFY_URL` (étape 4) **et** dans
   les variables du site Netlify (étape 5).

## 3. Bucket Cloudflare R2 (D39)

Dans le tableau de bord Cloudflare :

1. R2 Object Storage : active R2 si ce n'est pas fait (formule gratuite : 10 Go-mois).
2. Crée un bucket `veille-backup`, emplacement automatique, classe de stockage **Standard**
   (le gratuit ne couvre pas « Infrequent Access »).
3. « Manage API tokens » > « Create API token » : permission **Object Read & Write**, limitée au
   seul bucket `veille-backup`. Note l'*Access Key ID*, la *Secret Access Key* et l'adresse
   S3, de la forme `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
4. Génère le mot de passe de chiffrement de restic et **range-le aussi dans ton gestionnaire de
   mots de passe** : sans lui, la sauvegarde est illisible si le VPS est perdu.

   ```bash
   openssl rand -hex 32
   ```

## 4. Fichier d'environnement (sous `veille`)

```bash
sudo -iu veille
nano ~/.config/dev-ai-job-watcher/env
```

Le fichier existe déjà (droits 600) avec `INGEST_SECRET` et `SITE_URL`. Complète-le :

```bash
# Envoi des agrégats au site (déjà en place)
INGEST_SECRET=...
SITE_URL=https://dev-ai-job-watcher.netlify.app

# France Travail (identifiants de l'application francetravail.io)
FT_CLIENT_ID=...
FT_CLIENT_SECRET=...

# Alertes (étape 2)
ALERT_NTFY_URL=https://ntfy.sh/veille-...

# Sauvegarde (étape 3)
RESTIC_REPOSITORY=s3:https://<ACCOUNT_ID>.r2.cloudflarestorage.com/veille-backup
RESTIC_PASSWORD=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Facultatif : répertoire des données, /home/veille/data par défaut
# DATA_DIR=/home/veille/data
```

Le fichier est lu par le shell : une ligne `NOM=valeur`, sans espace autour du `=`. Une valeur
qui contient une espace, un `$` ou un guillemet se met entre apostrophes (`'...'`). Vérifie les
droits : `ls -l ~/.config/dev-ai-job-watcher/env` doit afficher `-rw-------` ; sinon
`chmod 600 ~/.config/dev-ai-job-watcher/env` (`veille-job` refuse de démarrer autrement).

## 5. Variables du site Netlify

Dans Netlify : Project configuration > Environment variables.

- Ajoute `ALERT_NTFY_URL`, même valeur que sur le VPS (utilisée par la fonction `watchdog`).
- Supprime `FT_CLIENT_ID` et `FT_CLIENT_SECRET` : la collecte ne passe plus par Netlify.

Les fonctions ne voient une variable modifiée qu'au déploiement suivant : fais-le avant de
fusionner la PR du lot 5, son déploiement s'en chargera.

## 6. Mettre le code à jour (sous `veille`, après fusion de la PR)

```bash
cd ~/Dev-ai-job-watcher
git pull --ff-only
npm ci
```

Le dépôt s'appelle `Dg-tech-dev/barometre-emploi-dev-ia` depuis le 21 novembre 2026 (D64).
GitHub redirige l'ancienne adresse, mais mieux vaut mettre à jour celle du dépôt distant, une
fois, en gardant sa forme (SSH avec la clé de déploiement) :

```bash
git remote get-url origin   # ancienne adresse : …DamienGR/Dev-ai-job-watcher.git
git remote set-url origin git@github.com:Dg-tech-dev/barometre-emploi-dev-ia.git
git fetch origin main       # doit passer sans erreur
```

Le dossier garde son nom, `~/Dev-ai-job-watcher` : les unités systemd y renvoient.

## 7. Vérifier les alertes et la sauvegarde

```bash
cd ~/Dev-ai-job-watcher
deploy/vps/veille-job admin simulate-failure   # une notification doit arriver sur le téléphone
deploy/vps/veille-job restic init              # une seule fois : crée le dépôt chiffré dans R2
```

`simulate-failure` joue un run fictif en mémoire, sans toucher aux données ni au site, et envoie
la vraie alerte « Run 2000-W01 en échec ». `veille-job` fait passer Node par l'IPv4 : ntfy.sh
limite les envois par bloc IPv6 /64, que le VPS partage avec d'autres clients OVH (D43). Si
l'alerte échoue malgré tout, le journal du job contient `alert.failed` avec la réponse de ntfy.

## 8. Installer les timers

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)   # nécessaire après « sudo -iu veille »
mkdir -p ~/.config/systemd/user
cp ~/Dev-ai-job-watcher/deploy/vps/systemd/veille-* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now veille-weekly-run.timer veille-backup.timer veille-update.timer
systemctl --user list-timers
```

Attendu : les trois timers, prochain passage le lundi suivant à 07:00 et 11:00 heure de Paris
(05:00 et 09:00 UTC) pour le run et la sauvegarde, et à 04:00 UTC le jour suivant pour la mise
à jour.

## 9. Premier run, sans attendre lundi

```bash
systemctl --user start veille-weekly-run.service   # rend la main à la fin du run (1 à 2 min)
journalctl --user -u veille-weekly-run -n 30
deploy/vps/veille-job admin status
```

`admin status` doit montrer `"status": "complete"` et les trois étapes `done` ; le tableau de
bord affiche alors le run de la semaine en cours. Puis la première sauvegarde :

```bash
systemctl --user start veille-backup.service
deploy/vps/veille-job restic snapshots
```

Si `journalctl --user` ne trouve aucun journal, lis-le depuis `ubuntu` :
`sudo journalctl _UID=$(id -u veille) -n 50`.

## 10. Remote Control en service (facultatif)

Pour que Remote Control redémarre avec le VPS. Sous `veille`, avec `XDG_RUNTIME_DIR` exporté :

```bash
tmux kill-session -t claude          # arrête la session lancée à la main
systemctl --user enable --now veille-remote-control.service
tmux attach -t claude                # vérifie qu'il tourne, puis Ctrl+b d pour détacher
```

Le service lance `claude remote-control --spawn worktree` dans une session tmux `claude`, comme
à la main. À vérifier au premier démarrage : si une question s'affiche dans tmux, réponds-y une
fois ; elle ne reviendra pas.

## 11. Mise à jour automatique (lot 6, installation existante)

Le VPS installé avant le lot 6 n'a pas encore le timer `veille-update`. Sous `veille`, après
la fusion de la PR du lot 6 :

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
cd ~/Dev-ai-job-watcher
git pull --ff-only && npm ci                     # dernière mise à jour à la main
cp deploy/vps/systemd/veille-update.* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now veille-update.timer
systemctl --user start veille-update.service     # premier passage, sans attendre la nuit
journalctl --user -u veille-update -n 20
```

Attendu dans le journal : `update.code` avec `up-to-date`, puis `update.taxonomy` avec
`up-to-date` et la version en cours. Le service doit pouvoir lancer `git fetch` seul, avec la
clé de déploiement : une erreur d'authentification apparaît ici et part aussi en alerte.

À partir de là, le dépôt se met à jour seul chaque nuit : tout ce qui est fusionné sur `main`
tourne sur le VPS le lendemain matin.

---

## Au quotidien

Toutes les commandes se lancent sous `veille`, depuis `~/Dev-ai-job-watcher`.

| Besoin | Commande |
|---|---|
| État d'un run | `deploy/vps/veille-job admin status [--run-id 2026-W42]` |
| Relancer le run après 3 échecs | `deploy/vps/veille-job admin weekly-run --run-id 2026-W42 --force` |
| Relancer une étape | `deploy/vps/veille-job admin collect-ft\|process\|push --run-id 2026-W42` |
| Recollecter de zéro | `deploy/vps/veille-job admin collect-ft --run-id 2026-W42 --reset` |
| Journal du dernier run | `journalctl --user -u veille-weekly-run -n 100` |
| Prochains lancements | `systemctl --user list-timers` |
| Instantanés de sauvegarde | `deploy/vps/veille-job restic snapshots` |
| Restaurer dans un dossier | `deploy/vps/veille-job restic restore latest --target /tmp/restauration` |
| Mettre le code à jour sans attendre la nuit | `deploy/vps/veille-job update` |
| Relancer un reclassement en échec | `deploy/vps/veille-job update --apply` |
| Version de la taxonomie, fichier et données | `deploy/vps/veille-job admin status` |
| Journal de la mise à jour | `journalctl --user -u veille-update -n 100` |

Le dépôt se met à jour seul chaque nuit (job `update`), sur `main` uniquement. Il refuse une
copie de travail modifiée ou une branche qui a divergé : ne modifie pas les fichiers du dépôt
sur le VPS. Si une mise à jour modifie `deploy/vps/systemd/`, une alerte le signale : recopie
les unités et relance `systemctl --user daemon-reload`.

## Alertes envoyées

| Alerte | Origine | Quand |
|---|---|---|
| Collecte incomplète | VPS | partitions en échec après la 3e tentative ; le run est traité avec ce qui a été collecté |
| Zéro offre France Travail | VPS | collecte terminée sans offre : traitement bloqué |
| Erreur du traitement | VPS | dès la première erreur |
| Run en échec après 3 tentatives | VPS | toute autre erreur (OAuth, envoi au site…) |
| Sauvegarde en échec ou non configurée | VPS | lundi 09:00 UTC |
| Mise à jour du code en échec | VPS | 04:00 UTC : dépôt modifié, branche divergée, `git fetch` ou `npm ci` en échec ; les runs continuent avec le code en place |
| Unités systemd modifiées | VPS | après une mise à jour qui touche `deploy/vps/systemd/` : commandes à lancer |
| Taxonomie appliquée | VPS | après un reclassement réussi : runs reclassés, part des offres classées avant et après (information) |
| Reclassement en échec | VPS | le site garde les chiffres précédents ; relance : `veille-job update --apply` |
| Aucun run réussi depuis 8 jours | Netlify (`watchdog`) | chaque jour à 09:00 UTC tant que dure le retard, couvre un VPS arrêté |

## Retour arrière

```bash
systemctl --user disable --now veille-weekly-run.timer veille-backup.timer veille-update.timer veille-remote-control.service
rm ~/.config/systemd/user/veille-*
systemctl --user daemon-reload
```

Les données restent dans `DATA_DIR` et les sauvegardes dans R2.
