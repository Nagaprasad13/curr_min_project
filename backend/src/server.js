require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { connectDB } = require('./config/db');

const helmet = require('helmet');
const authRoutes = require('./routes/authRoutes');
const hospitalRoutes = require('./routes/hospitalRoutes');
const capacityRoutes = require('./routes/capacityRoutes');
const referralRoutes = require('./routes/referralRoutes');
const consentRoutes = require('./routes/consentRoutes');
const recordRoutes = require('./routes/recordRoutes');
const schemeRoutes = require('./routes/schemeRoutes');
const specialtyMapRoutes = require('./routes/specialtyMapRoutes');
const practitionerRoutes = require('./routes/practitionerRoutes');
const modelRoutes = require('./routes/modelRoutes');
const ModelRegistry = require('./models/ModelRegistry');

const cookieParser = require('cookie-parser');
const { csrfProtection } = require('./middleware/csrf');

// Startup Constraint: Refuse to boot if DEMO_MODE is true in production
if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE === 'true') {
  throw new Error('FATAL SECURITY POLICY VIOLATION: DEMO_MODE must not be enabled in production environments. Server refusing to start.');
}

const app = express();

// Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Permissive for prototype inline styles and SVG maps
    crossOriginEmbedderPolicy: false,
  })
);

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '100kb' })); // Strict 100kb payload limit to mitigate DoS
app.use(csrfProtection);

// NoSQL Injection Query Sanitizer (strips malicious operators from req.query and req.body)
function sanitizeNoSQL(target) {
  if (!target || typeof target !== 'object') return;
  for (const key of Object.keys(target)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete target[key];
    } else if (typeof target[key] === 'object') {
      sanitizeNoSQL(target[key]);
    }
  }
}

app.use((req, res, next) => {
  sanitizeNoSQL(req.query);
  if (req.body && typeof req.body === 'object') {
    sanitizeNoSQL(req.body);
  }
  next();
});

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

// Protected clinical records storage folder (direct filesystem access prohibited)
app.use('/storage/records', (req, res, next) => {
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
app.use('/api/consents', consentRoutes);
app.use('/api', recordRoutes);
app.use('/api/schemes', schemeRoutes);
app.use('/api/specialty-map', specialtyMapRoutes);
app.use('/api/hospitals/:id/practitioners', practitionerRoutes);
app.use('/api/models', modelRoutes);

// Serve static frontend in production/prototype if built
const frontendDistPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/storage')) return next();
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

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
  connectDB().then(async () => {
    await ModelRegistry.init();
    app.listen(PORT, () => {
      console.log(`CareBridge Backend Server running on http://localhost:${PORT}`);
      console.log(`Clinical Disclaimer: Decision support only. Clinician review required.`);
    });
  }).catch(err => {
    console.error('Failed to start server:', err);
  });
}

module.exports = app;
