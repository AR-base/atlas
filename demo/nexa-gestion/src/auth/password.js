const bcrypt = require('bcrypt');

// Facteur de coût bcrypt utilisé pour hacher les mots de passe.
const SALT_ROUNDS = 10;

async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length < 8) {
    throw new Error('Mot de passe trop court');
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword, SALT_ROUNDS };
