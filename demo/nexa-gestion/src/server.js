const express = require('express');
const { requireAuth } = require('./auth/middleware');
const clients = require('./routes/clients');
const factures = require('./routes/factures');
const tickets = require('./routes/tickets');
const { startScheduler } = require('./jobs/scheduler');
const config = require('./config');

const app = express();
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/clients', requireAuth, clients);
app.use('/api/factures', requireAuth, factures);
app.use('/api/tickets', requireAuth, tickets);

app.listen(config.port, () => {
  console.log(`Nexa Gestion sur le port ${config.port}`);
  startScheduler();
});
