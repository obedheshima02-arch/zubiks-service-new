try { require('dotenv').config(); } catch (e) { /* dotenv optionnel localement */ }
const app = require('./api/index.js');
let express = null;
try {
  express = require('express');
} catch (e) {
  const dummyFn = () => ({ use: () => {}, get: () => {}, post: () => {}, listen: () => {} });
  dummyFn.static = () => (req, res, next) => next && next();
  express = dummyFn;
}
const path = require('path');
const { initDb } = require('./db/index.js');

// Initialize Database Schema on server start
initDb().catch(err => {
  console.error("Erreur lors de l'initialisation de la base de données au démarrage :", err);
});

// Serve static assets from public folder locally
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route for SPA local fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`   ZUBIX SERVICE - SERVEUR DÉMARRÉ`);
  console.log(`   Accédez à l'application sur : http://localhost:${PORT}`);
  console.log(`==================================================`);
});
