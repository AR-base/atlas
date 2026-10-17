const cron = require('node-cron');
const { sendDueReminders } = require('../billing/reminders');

// Tâches planifiées de Nexa Gestion.
function startScheduler() {
  // Tous les jours à 8 h : relances des factures en retard.
  cron.schedule('0 8 * * *', async () => {
    const sent = await sendDueReminders();
    console.log(`[relances] ${sent} relance(s) envoyée(s)`);
  });

  // TODO: ajouter la purge mensuelle des tickets (RGPD).
}

module.exports = { startScheduler };
