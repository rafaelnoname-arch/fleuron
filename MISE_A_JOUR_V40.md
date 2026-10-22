# Version 40 — composants des packs et suppression des lignes de tournée

## Utilisation

- Une corbeille est disponible sur chaque ligne de matériel d’une tournée, y compris les lignes annulées et celles d’un client supprimé. La confirmation indique que la suppression corrige une erreur de saisie et recalcule le stock. La fiche client n’est pas supprimée.
- Un retour encore attendu empêche la suppression : réceptionner physiquement la marchandise avant de valider son retour. Les protections existantes côté serveur restent actives.
- Lors d’un nouvel ajout, un produit dont le nom contient « PACK CONSOMMABLE » ou « PACK CONSOMMABLES » est remplacé par neuf lignes : circulateur, disconnecteur, support vase expansion, vase expansion, ballon tampon 100L, thermostat, bouton d’arrêt, pot à bout, grand rubberfoot.
- Un pack donne une unité de chaque composant ; deux packs donnent deux unités de chacun. Si un composant est également ajouté séparément dans le même formulaire, les quantités s’additionnent.
- Les lignes détaillées apparaissent sur le bon de sortie et se modifient séparément. Ce sont les composants qui sortent du stock, sans sortie supplémentaire de la référence pack.
- Les statuts de retour ne réintègrent rien à eux seuls. Chaque composant revient en stock uniquement à validation de sa quantité réellement reçue.
- Une référence absente ou ambiguë empêche l’ajout complet, avec un message identifiant le composant. Le catalogue doit contenir une référence active identifiable pour chacun des neuf composants. Les variantes expansion/expension et l’ordre grand/rubberfoot sont reconnus. En cas de plusieurs modèles, ajouter les composants séparément pour choisir les bonnes références.
- Les anciens bons ne sont pas réécrits automatiquement. Pour convertir une ancienne ligne pack sans bon de retour actif, ouvrir sa modification puis enregistrer : elle sera détaillée en neuf composants. Ne pas ajouter une deuxième fois le pack en conservant l’ancienne ligne.

## Livraison et déploiement

L’archive contient le code source complet, sans les données clients, les fichiers privés ni les secrets. Pas de nouvelle migration de base de données dans cette version. Conserver les migrations existantes.

Cette application possède un backend Cloudflare Workers, une base D1 et un stockage R2. Une copie Netlify possède son propre déploiement : la publication du site ChatGPT ne la modifie pas. Le développeur doit reporter les modifications du frontend **et** de l’API dans son environnement, conserver ses paramètres de connexion et reconstruire/redéployer l’application complète. Ne pas remplacer la base de données de production par une base vide.

## Vérifications

- Vérification TypeScript et compilation de production.
- Tests de l’API avec SQLite : 2 packs, composant supplémentaire, résolution manquante/ambiguë, absence de création partielle, retour partiel sans réintégration anticipée, suppression d’une ligne annulée, refus de suppression avec retour attendu, conversion d’une ligne en pack.
- Le journal d’activité conserve les informations de la ligne supprimée.
