const express = require('express');
const { query } = require('../db');
const { nextInvoiceNumber } = require('../billing/invoice-number');

const router = express.Router();

// Liste des factures, filtrable par statut.
router.get('/', async (req, res) => {
  const statut = req.query.statut;
  const { rows } = statut
    ? await query('SELECT * FROM factures WHERE statut = $1 ORDER BY date_emission DESC', [statut])
    : await query('SELECT * FROM factures ORDER BY date_emission DESC LIMIT 200');
  res.json(rows);
});

// Recherche rapide par nom de client (utilisée par la barre de recherche).
router.get('/recherche', async (req, res) => {
  const terme = req.query.q || '';
  const sql = "SELECT f.* FROM factures f JOIN clients c ON c.id = f.client_id " +
    "WHERE c.raison_sociale ILIKE '%" + terme + "%' ORDER BY f.date_emission DESC";
  const { rows } = await query(sql);
  res.json(rows);
});

// Création d'une facture.
router.post('/', async (req, res) => {
  const { client_id, projet_id, montant_ht } = req.body;
  if (!Number.isInteger(client_id) || typeof montant_ht !== 'number' || montant_ht <= 0) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const numero = await nextInvoiceNumber();
  const montant_ttc = Math.round(montant_ht * 1.2 * 100) / 100;
  const { rows } = await query(
    `INSERT INTO factures (numero, client_id, projet_id, date_emission, date_echeance, montant_ht, montant_ttc, statut)
     VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + 30, $4, $5, 'en_attente') RETURNING *`,
    [numero, client_id, projet_id || null, montant_ht, montant_ttc],
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
