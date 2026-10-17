const test = require('node:test');
const assert = require('node:assert/strict');
const { SLA_HOURS, isWithinSla } = require('../src/support/sla');

test('délais SLA conformes à la procédure', () => {
  assert.deepEqual(SLA_HOURS, { critique: 4, haute: 24, normale: 72, basse: 240 });
});

test('un ticket critique résolu en 3 h respecte le SLA', () => {
  const t = { priorite: 'critique', date_ouverture: '2026-01-05T09:00:00Z', date_resolution: '2026-01-05T12:00:00Z' };
  assert.equal(isWithinSla(t), true);
});
