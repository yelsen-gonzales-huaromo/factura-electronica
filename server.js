/**
 * ============================================================
 *  Integrador de Facturación Electrónica Multi-País
 *  Servidor Express principal
 * ============================================================
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { testConnection } = require('./src/config/db');

// Routers
const authRoutes      = require('./src/routes/auth');
const userRoutes      = require('./src/routes/users');
const companyRoutes   = require('./src/routes/companies');
const clientRoutes    = require('./src/routes/clients');
const productRoutes   = require('./src/routes/products');
const invoiceRoutes   = require('./src/routes/invoices');
const reportRoutes    = require('./src/routes/reports');
const countryRoutes   = require('./src/routes/countries');
const systemRoutes    = require('./src/routes/system');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware globales ----
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Servir frontend estático ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- Rutas de la API ----
app.use('/api/auth',      authRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/clients',   clientRoutes);
app.use('/api/products',  productRoutes);
app.use('/api/invoices',  invoiceRoutes);
app.use('/api/reports',   reportRoutes);
app.use('/api/countries', countryRoutes);
app.use('/api/system',    systemRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Integrador Facturación Electrónica',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// SPA fallback → entrega index.html para rutas no API
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor'
  });
});

// ---- Arrancar servidor ----
(async () => {
  await testConnection();
  app.listen(PORT, () => {
    console.log('\n=========================================================');
    console.log('  Integrador de Facturación Electrónica Multi-País');
    console.log('=========================================================');
    console.log(`  Servidor:    http://localhost:${PORT}`);
    console.log(`  API:         http://localhost:${PORT}/api`);
    console.log(`  Login demo:  admin@factu.com / admin123`);
    console.log('=========================================================\n');
  });
})();
