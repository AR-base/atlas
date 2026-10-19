// Configuration de l'application.
module.exports = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
  smtp: {
    host: 'smtp.nexa-digital.example',
    port: 587,
    user: 'facturation@nexa-digital.example',
    // TODO: déplacer dans .env avant la mise en production
    password: 'demo-not-a-real-password',
  },
  invoiceFrom: 'Nexa Digital <facturation@nexa-digital.example>',
};
