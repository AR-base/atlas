# Politique de sécurité des systèmes d'information (PSSI)

*Version 2.0. Société fictive (démonstration Atlas).*

## 1. Gestion des secrets

- Aucun mot de passe, clé d'API ou secret ne doit figurer dans le code source ni dans le dépôt Git.
- Les secrets sont fournis par des **variables d'environnement** ou par le coffre-fort de secrets de l'hébergeur.
- Tout secret exposé doit être révoqué et remplacé sous 24 heures.

## 2. Mots de passe des utilisateurs

- Les mots de passe sont stockés uniquement sous forme de hachage **bcrypt** avec un facteur de coût d'**au moins 12**.
- Longueur minimale : 12 caractères.
- L'authentification multifacteur est obligatoire pour les comptes administrateurs.

## 3. Développement sécurisé

- Toutes les requêtes SQL utilisent des **requêtes paramétrées** ; la concaténation de données saisies par l'utilisateur dans une requête est interdite.
- Les entrées utilisateur sont validées côté serveur.
- Chaque modification de code est revue par un second développeur avant fusion.

## 4. Accès et revues

- Principe du moindre privilège pour tous les comptes.
- Revue des droits d'accès chaque trimestre.

## 5. Incidents

Tout incident de sécurité est déclaré dans Nexa Gestion comme ticket de catégorie « securite », priorité « critique ».
