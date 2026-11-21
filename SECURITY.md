# Sécurité

## Signaler une faille

Écrivez à [contact@dg-tech.dev](mailto:contact@dg-tech.dev), objet « Sécurité », plutôt que
d'ouvrir une issue publique. Décrivez la faille, la page ou le fichier concerné et, si possible,
comment la reproduire. Damien vous répond au plus vite ; le correctif est publié dans ce dépôt,
avec votre nom si vous le souhaitez.

Le même contact figure dans
[`/.well-known/security.txt`](https://barometre.dg-tech.dev/.well-known/security.txt).

## Périmètre

- Le site [barometre.dg-tech.dev](https://barometre.dg-tech.dev) et ses API publiques
  (`/api/data/…`, `/api/export/…`), ainsi que la fonction d'envoi des agrégats
  (`/api/ingest/…`, protégée par un secret).
- Le code de ce dépôt : collecte, traitement, jobs du serveur de collecte.

Hors périmètre : les services tiers (API France Travail, Netlify, ntfy, Cloudflare), à
signaler à leurs éditeurs.

Merci de ne pas lancer de test de charge ou de déni de service, de ne pas chercher à joindre
le serveur de collecte et de ne pas tenter d'accéder à des données qui ne sont pas publiées
sur le site.

## Ce que le projet publie

Le site ne publie que des statistiques agrégées sur les offres d'emploi. Les coordonnées des
recruteurs et des agences sont supprimées dès la collecte, avant tout enregistrement, et les
e-mails et numéros de téléphone cités dans les descriptions sont masqués (SPEC.md §11). Aucun
secret n'est versionné : les identifiants vivent dans les variables du site Netlify et dans un
fichier d'environnement du serveur, hors du dépôt.
