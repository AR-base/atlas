# Architecture de Nexa Gestion

- **API** : Express (Node.js 20), authentification par jeton de session.
- **Base** : PostgreSQL. Tables principales : `clients`, `projets`, `factures`, `tickets`, `employes`, `temps_passe`.
- **Tâches planifiées** : `node-cron` (relances quotidiennes ; purge RGPD prévue).
- **E-mails** : Nodemailer via le serveur SMTP de l'agence.

Flux de facturation : création de la facture (`POST /api/factures`) → échéance à 30 jours → passage en retard → relances automatiques (`src/billing/reminders.js`).
