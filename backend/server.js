require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const connectDB    = require('./config/database');
const { generalLimiter } = require('./src/middleware/rateLimiter');
const { startBackupScheduler } = require('./src/services/backupScheduler');

const app  = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);

// ─── Connect MongoDB ───────────────────────────────────────────
connectDB().then(() => { startBackupScheduler(); }).catch(err => console.error('DB Error:', err.message));

// ─── Security Middleware ───────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc:     ["'self'", 'data:', 'https://storage.googleapis.com'],
      mediaSrc:   ["'self'", 'https://www.youtube.com'],
      frameSrc:   ["'self'", 'https://www.youtube.com'],
    },
  },
}));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin && process.env.NODE_ENV === 'development') return callback(null, true);
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.use('/api', generalLimiter);

// ─── Routes ────────────────────────────────────────────────────
app.use('/api/settings', require('./src/routes/public'));
app.use('/api/auth',     require('./src/routes/auth'));
app.use('/api/farmer',   require('./src/routes/farmer'));
app.use('/api/admin',    require('./src/routes/admin'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/tasks',    require('./src/routes/tasks'));
app.use('/api/push',     require('./src/routes/push'));

// Health check
app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  res.json({
    status: 'ok',
    app: 'alshallala',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  });
});

app.use((req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err.message?.includes('CORS'))
    return res.status(403).json({ error: 'CORS: Origin غير مسموح' });
  res.status(500).json({ error: 'خطأ داخلي في الخادم' });
});

// ─── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌿 alshallala backend → port ${PORT}`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV}`);
  console.log(`📡 Health: http://localhost:${PORT}/health\n`);
});

module.exports = app;