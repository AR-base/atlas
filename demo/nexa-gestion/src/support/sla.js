// Délais maximaux de résolution par priorité, en heures
// (procédure de support et engagements de délai).
const SLA_HOURS = {
  critique: 4,
  haute: 24,
  normale: 72,
  basse: 240,
};

function deadlineFor(ticket) {
  const hours = SLA_HOURS[ticket.priorite];
  if (!hours) return null;
  return new Date(new Date(ticket.date_ouverture).getTime() + hours * 3600 * 1000);
}

function isWithinSla(ticket) {
  if (!ticket.date_resolution) return null;
  return new Date(ticket.date_resolution) <= deadlineFor(ticket);
}

module.exports = { SLA_HOURS, deadlineFor, isWithinSla };
