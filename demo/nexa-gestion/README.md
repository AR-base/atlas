# Nexa Gestion

Outil interne de Nexa Digital (société fictive) : clients, projets, factures, relances et tickets de support.

## Démarrer

```bash
npm install
cp .env.example .env
npm start
```

## Structure

- `src/server.js` : point d'entrée Express
- `src/routes/` : API REST
- `src/billing/` : numérotation des factures et relances
- `src/support/` : délais de support (SLA)
- `src/jobs/` : tâches planifiées

Code de démonstration pour Atlas, non destiné à la production.
