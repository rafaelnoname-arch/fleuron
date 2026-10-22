# Fleuron Industries — mise à jour v38

La suppression d’une tournée supprime désormais ses lignes et les bons de retour associés, dans la même opération. La suppression d’une ligne supprime aussi son retour. Le contrôle des marchandises encore dehors reste actif : un retour en attente doit être réceptionné ou son statut corrigé avant suppression.

Dans Réceptions, le bouton « Supprimer les anciens retours sans tournée » apparaît lorsque des retours entièrement réceptionnés n’ont plus de ligne de tournée. Il demande confirmation, supprime uniquement ces retours et ne modifie pas le stock disponible. Il ne s’agit pas d’une remise à zéro générale des données de production. Une trace de suppression reste dans le journal d’activité.

Les retours existants n’ont pas été supprimés au moment de la publication : utilisez ce bouton pour nettoyer les anciens dossiers. Les suppressions ultérieures de tournées effectuent automatiquement le nettoyage lié.

## Installation sur votre propre hébergement

Publier les sources et les API de la même version. Appliquer une fois la migration `drizzle/0016_delete_linked_returns.sql`, après la migration 0015 fournie en v37. Ne pas rejouer les anciennes migrations déjà appliquées. La nouvelle migration installe des déclencheurs de suppression liée ; elle ne supprime pas les données existantes lors de son application.

Le site ChatGPT reçoit automatiquement la migration lors de la publication. La copie Netlify doit être mise à jour par votre développeur avec son backend.

## Vérifications

Les tests exécutent toutes les migrations sur une base SQLite isolée et vérifient : blocage d’une suppression si retour en attente ; suppression d’une tournée et de ses retours après réception ; conservation du stock disponible ; nettoyage des seuls retours reçus sans ligne de tournée ; absence de recréation des retours supprimés lors de la synchronisation.

Commandes : `python3 tests/returns_test.py`, `node --experimental-strip-types tests/action-api.test.mjs`, `pnpm exec tsc --noEmit --incremental false`, `pnpm run build`.
