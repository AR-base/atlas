const { query } = require('../db');

// Vérifie le jeton de session envoyé dans l'en-tête Authorization.
async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });

  const { rows } = await query(
    'SELECT u.id, u.role FROM sessions s JOIN utilisateurs u ON u.id = s.user_id WHERE s.token = $1 AND s.expire_le > now()',
    [token],
  );
  if (!rows.length) return res.status(401).json({ error: 'Session expirée' });
  req.user = rows[0];
  next();
}

function requireRole(role) {
  return (req, res, next) => (req.user && req.user.role === role ? next() : res.status(403).json({ error: 'Accès refusé' }));
}

module.exports = { requireAuth, requireRole };
