const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await query('SELECT id, raison_sociale, ville, segment, statut FROM clients ORDER BY raison_sociale');
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const { rows } = await query('SELECT * FROM clients WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Client introuvable' });
  res.json(rows[0]);
});

module.exports = router;
