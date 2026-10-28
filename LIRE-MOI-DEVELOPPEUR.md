# Fleuron Industries — remise du code source

Version remise : `ff9b58aff6f32efc06c04023adb159f98058a0ed`

Cette archive contient le code source complet de l'application actuellement publiée : interface, API, schéma de base de données, migrations et gestion documentaire.

## Périmètre fonctionnel présent

- tableau de bord et alertes d'écarts de réception ;
- réceptions fournisseurs et calcul du stock/CUMP ;
- produits et activités PAC, consommables, PV et ITE ;
- installateurs, équipes, camions et contrôle RGE ;
- bons de sortie par équipe, clients multiples et retours ;
- contrôle anti-doublon d'un client sur deux bons le même jour ;
- clients et historique des installations/SAV ;
- planning mensuel ;
- documents imprimables ;
- téléversement et consultation des pièces jointes ;
- journal d'audit des écritures.

## Socle actuel

- TypeScript, React 19 et Next.js 16 via Vinext ;
- API intégrée dans `app/api/` ;
- Drizzle ORM ;
- Cloudflare D1 pour les données ;
- Cloudflare R2 pour les fichiers ;
- authentification actuellement fournie par l'hébergement ChatGPT Sites.

Le code ne contient ni mot de passe, ni clé d'API, ni copie de la base de production. Les données et documents déjà enregistrés sur le site en ligne ne sont donc pas inclus dans l'archive.

## Lancer le projet pour le développement

Prérequis : Node.js 22.13 ou plus récent et pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

La base locale D1 doit être initialisée en appliquant, dans l'ordre, les fichiers SQL du dossier `drizzle/`. Les commandes et détails du mode local Cloudflare figurent également dans `README.md`.

## Déploiement sécurisé : deux chemins possibles

### 1. Conserver Cloudflare — adaptation la plus courte

- déployer l'application comme Worker ;
- créer une base D1 et un bucket R2 ;
- appliquer les migrations `drizzle/*.sql` ;
- remplacer l'authentification ChatGPT Sites par Cloudflare Access, Auth.js ou un fournisseur OIDC ;
- restreindre l'accès aux adresses e-mail autorisées de Fleuron Industries ;
- activer sauvegardes, logs, alertes et domaine HTTPS.

Les dépendances spécifiques à remplacer sont principalement dans :

- `app/chatgpt-auth.ts` ;
- `app/page.tsx` ;
- `app/api/*` pour le contrôle des droits ;
- `.openai/hosting.json`, qui est propre à l'hébergement actuel.

### 2. Serveur/VPS dédié avec PostgreSQL — architecture la plus classique

- exécuter le frontend et l'API dans un conteneur Docker ;
- utiliser PostgreSQL pour les données partagées ;
- stocker les fichiers dans S3, Cloudflare R2 ou MinIO ;
- placer Nginx ou Caddy devant l'application avec HTTPS ;
- mettre en place une authentification avec rôles (`direction`, `responsable_depot`, `lecture`) ;
- effectuer des sauvegardes quotidiennes chiffrées de PostgreSQL et du stockage documentaire.

Dans cette variante, il faut adapter `db/index.ts`, convertir `db/schema.ts` de SQLite/D1 vers PostgreSQL, générer de nouvelles migrations et remplacer les accès `env.BUCKET` des routes documentaires par le client de stockage choisi.

## Points de sécurité à traiter avant ouverture aux utilisateurs

1. Authentification nominative et révocation des comptes.
2. Autorisations vérifiées côté serveur, pas uniquement dans l'interface.
3. Protection CSRF, limitation du débit et taille/type des fichiers autorisés.
4. Antivirus ou quarantaine pour les documents téléversés.
5. Chiffrement HTTPS, secrets hors du dépôt Git et rotation des clés.
6. Sauvegardes automatiques avec test régulier de restauration.
7. Journal d'audit conservé et protégé contre les modifications ordinaires.
8. Environnements séparés : développement, préproduction et production.
9. Supervision des erreurs, disponibilité et capacité de stockage.
10. Politique de conservation et suppression des données clients conforme au RGPD.

## Validation minimale avant mise en production

- tester toutes les créations, modifications, annulations et archivages ;
- vérifier l'unicité client/date sous accès simultanés ;
- tester les stocks et le CUMP sur plusieurs réceptions et retours ;
- contrôler l'impression de chaque document ;
- tester les téléversements et téléchargements ;
- tester les droits de chaque rôle ;
- simuler une restauration complète après sauvegarde ;
- réaliser une revue de sécurité et un test sur mobile.

