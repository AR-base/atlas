const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({ connectionString: config.databaseUrl });

// Exécute une requête paramétrée : query('SELECT * FROM clients WHERE id = $1', [id])
function query(text, params = []) {
  return pool.query(text, params);
}

module.exports = { query, pool };
