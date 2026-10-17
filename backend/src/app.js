const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { adminFrontendUrl, isProduction } = require('./config/env');
const { ApiError } = require('./utils/ApiError');

const app = express();

app.set('trust proxy', 1); // IP real en auditoría detrás de un proxy/balanceador
app.use(helmet());
app.use(cors({ origin: adminFrontendUrl }));
app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use(express.json({ limit: '200kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api', require('./routes'));

app.use((req, res) => {
  res.status(404).json({ error: { message: 'Ruta no encontrada.' } });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: {
        message: err.issues[0]?.message || 'Datos inválidos.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: { message: err.message, details: err.details } });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: { message: 'Ya existe un registro con esos datos.' } });
  }
  if (err.code === '42P01' || err.code === '42703' || err.code === '3F000') {
    console.error(`[${req.method} ${req.originalUrl}]`, err.message);
    return res.status(500).json({
      error: { message: 'La base de datos no está al día. Corre `npm run migrate` en el sistema escolar y en el Tenant Manager.' },
    });
  }
  if (err.code === '42501') {
    console.error(`[${req.method} ${req.originalUrl}]`, err.message);
    return res.status(500).json({ error: { message: 'El rol de base de datos no tiene permisos suficientes (ver docs/db-role.sql).' } });
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err);
  return res.status(500).json({ error: { message: 'Error interno del servidor.' } });
});

module.exports = app;
