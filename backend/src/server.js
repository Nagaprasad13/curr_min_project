require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { connectDB } = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const hospitalRoutes = require('./routes/hospitalRoutes');
const capacityRoutes = require('./routes/capacityRoutes');
const referralRoutes = require('./routes/referralRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Protected evidence storage folder (metadata in DB, files stored on local filesystem)
const evidenceStoragePath = path.join(__dirname, '..', 'storage', 'evidence');
app.use('/storage/evidence', (req, res, next) => {
  // Disallow direct unauthenticated file scraping
  return res.status(403).json({
    error: 'Forbidden',
    message: 'Direct file access prohibited. Request must pass through authenticated document authorization proxy.',
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  return res.json({
    status: 'healthy',
    platform: 'CareBridge Research Prototype',
    state: 'Tamil Nadu, India',
    clinicalNotice: 'Decision support only. A clinician must review.',
    timestamp: new Date(),
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/hospitals/:id/capacity', capacityRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/referrals', referralRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.url} does not exist.` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[CareBridge Server Error]:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`CareBridge Backend Server running on http://localhost:${PORT}`);
      console.log(`Clinical Disclaimer: Decision support only. Clinician review required.`);
    });
  }).catch(err => {
    console.error('Failed to start server:', err);
  });
}

module.exports = app;
