const express = require('express');
const { query } = require('../db');
const { deadlineFor } = require('../support/sla');

const router = express.Router();

const PRIORITES = ['basse', 'normale', 'haute', 'critique'];
const CATEGORIES = ['bug', 'demande', 'incident', 'question', 'securite'];

router.post('/', async (req, res) => {
  const { client_id, titre, categorie, priorite } = req.body;
  if (!Number.isInteger(client_id) || typeof titre !== 'string' || !titre.trim()
      || !CATEGORIES.includes(categorie) || !PRIORITES.includes(priorite)) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const { rows } = await query(
    `INSERT INTO tickets (client_id, titre, categorie, priorite, statut, date_ouverture)
     VALUES ($1, $2, $3, $4, 'ouvert', now()) RETURNING *`,
    [client_id, titre.trim().slice(0, 200), categorie, priorite],
  );
  const ticket = rows[0];
  res.status(201).json({ ...ticket, echeance: deadlineFor(ticket) });
});

router.patch('/:id/resoudre', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const { rows } = await query(
    "UPDATE tickets SET statut = 'resolu', date_resolution = now() WHERE id = $1 RETURNING *",
    [id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Ticket introuvable' });
  res.json(rows[0]);
});

module.exports = router;
