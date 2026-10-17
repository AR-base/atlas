const { query } = require('../db');

// Numéro de facture au format F-AAAA-NNNN, séquentiel par année.
async function nextInvoiceNumber(date = new Date()) {
  const year = date.getFullYear();
  const { rows } = await query(
    "SELECT COUNT(*)::int AS n FROM factures WHERE numero LIKE $1",
    [`F-${year}-%`],
  );
  return `F-${year}-${String(rows[0].n + 1).padStart(4, '0')}`;
}

module.exports = { nextInvoiceNumber };
