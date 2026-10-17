const nodemailer = require('nodemailer');
const { query } = require('../db');
const config = require('../config');

// Nombre de jours après l'échéance avant d'envoyer la relance automatique.
const FIRST_REMINDER_DAYS = 45;

const transport = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  auth: { user: config.smtp.user, pass: config.smtp.password },
});

// Envoie une relance par e-mail pour chaque facture en retard depuis
// FIRST_REMINDER_DAYS jours et pas encore relancée.
async function sendDueReminders() {
  const { rows } = await query(
    `SELECT f.id, f.numero, f.montant_ttc, c.contact_email
       FROM factures f JOIN clients c ON c.id = f.client_id
      WHERE f.statut = 'en_retard'
        AND f.date_echeance <= CURRENT_DATE - $1::int
        AND f.nb_relances = 0`,
    [FIRST_REMINDER_DAYS],
  );
  for (const f of rows) {
    await transport.sendMail({
      from: config.invoiceFrom,
      to: f.contact_email,
      subject: `Rappel : facture ${f.numero} en attente de paiement`,
      text: `Bonjour, sauf erreur de notre part, la facture ${f.numero} d'un montant de ${f.montant_ttc} € TTC reste impayée.`,
    });
    await query(
      'UPDATE factures SET nb_relances = nb_relances + 1, derniere_relance = CURRENT_DATE WHERE id = $1',
      [f.id],
    );
  }
  return rows.length;
}

module.exports = { sendDueReminders, FIRST_REMINDER_DAYS };
