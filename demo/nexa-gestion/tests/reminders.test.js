const test = require('node:test');
const assert = require('node:assert/strict');
const { FIRST_REMINDER_DAYS } = require('../src/billing/reminders');

test('la première relance part 45 jours après l’échéance', () => {
  assert.equal(FIRST_REMINDER_DAYS, 45);
});
