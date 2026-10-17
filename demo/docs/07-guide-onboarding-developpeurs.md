# Guide d'accueil des développeurs

*Société fictive (démonstration Atlas).*

## 1. Le dépôt Nexa Gestion

- `src/routes/` : routes de l'API (clients, factures, tickets).
- `src/billing/` : facturation et relances automatiques.
- `src/support/` : calcul des délais de support (SLA).
- `src/jobs/` : tâches planifiées (relances quotidiennes, purges RGPD).
- `tests/` : tests automatisés, exécutés à chaque pull request.

## 2. Règles de travail

1. Une branche par fonctionnalité, nommée `feature/…` ou `fix/…`.
2. Pull request obligatoire, avec au moins une revue.
3. Les tests doivent passer avant toute fusion.
4. Aucun secret dans le code : utiliser le fichier `.env` (jamais versionné).

## 3. Conventions

- JavaScript moderne (Node.js 20), modules CommonJS.
- Requêtes SQL paramétrées uniquement.
- Les constantes métier (délais, taux) doivent correspondre aux procédures validées par la direction.
