# Fleuron Industries — mise à jour v37

## Corrections

- Équipes : anciennes appellations A/B/C présentées en 1/2/3, y compris les anciens champs camion/chauffeur utilisés comme noms d’équipe. Les immatriculations et noms personnalisés sont conservés.
- Ajout de matériel en tournée : références regroupées et triées par activité, puis marque/modèle. Un matériel ajouté ultérieurement apparaît à la suite des autres lignes du même client, y compris dans le bon de sortie.
- Retours : un bon visuel par client et par tournée, avec toutes ses lignes. Aperçu avant impression ; impression/PDF déclenchés manuellement.
- Réception d’un retour : quantité réellement reçue par matériel, y compris 0. Validation atomique de toutes les lignes saisies, contrôle des modifications concurrentes et protection contre les doubles validations.
- Correction de statut : retour possible vers « En camion » ou « Livré / posé ». Un retour encore dehors ne réintègre pas le stock. Les unités déjà réceptionnées sont de nouveau déduites lors de leur réaffectation. Une trace conserve les quantités du cycle précédent.
- SAV : statuts communs à la fiche client, aux tournées et au suivi SAV. Les dossiers sans tournée sont également visibles. Un dossier SAV par client dans le suivi et la vigilance ; les dossiers traités restent accessibles dans le filtre correspondant.
- Fiche client : nom, prénom, téléphone, adresse, ville et code postal obligatoires, avec vérification dans le formulaire et côté serveur. Code postal de cinq chiffres. Les imports existants ne sont pas modifiés ; une fiche incomplète doit être complétée lors de sa modification.
- Création d’un nouveau client depuis une tournée : les mêmes six informations sont demandées.

## Déploiement sur votre hébergement

Cette archive contient les sources complètes de l’application React/Vinext, les API et les migrations de base de données. Ce n’est pas un HTML autonome à déposer sur un hébergement statique.

Pour une installation existante reposant sur cette base : conserver les données et la configuration de connexion, appliquer une seule fois la nouvelle migration `drizzle/0015_return_status_corrections.sql` selon le mécanisme de migration de l’hébergement, puis publier le frontend et les API de la même version. Ne pas rejouer les migrations déjà appliquées. La migration ajoute deux champs aux retours et modifie les déclencheurs de retour ; elle ne supprime aucun client ni aucun stock.

Sur le site ChatGPT, la migration accompagne la publication. Pour la version Netlify visible sur vos captures, votre développeur doit reporter la mise à jour dans son déploiement et dans le backend qu’il utilise. Publier uniquement l’interface ne suffit pas pour les corrections de stock et de SAV.

## Vérifications exécutables

Depuis la racine du projet, dépendances installées :

```
pnpm exec tsc --noEmit --incremental false
python3 tests/returns_test.py
node --experimental-strip-types --test tests/depot-domain.test.mjs
node --experimental-strip-types tests/action-api.test.mjs
pnpm run build
```

Le test API utilise une base SQLite isolée et une identité simulée uniquement dans le test. Il ne modifie pas les données de production. Node.js 24 convient à ces tests.
