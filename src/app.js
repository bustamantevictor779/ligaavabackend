const express = require('express');
const cors = require('cors');
const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Rutas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sliders', require('./routes/sliders'));
app.use('/api/noticias', require('./routes/noticias'));
app.use('/api/sedes', require('./routes/sedes'));
app.use('/api/torneos', require('./routes/torneos'));
app.use('/api/clubes', require('./routes/clubes'));
app.use('/api/equipos', require('./routes/equipos'));
app.use('/api/niveles', require('./routes/niveles'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/partidos', require('./routes/partidos'));
app.use('/api/jugadores', require('./routes/jugadores'));
app.use('/api/sets', require('./routes/sets'));
app.use('/api/estadisticas', require('./routes/estadisticas'));
app.use('/api/utils', require('./routes/utils'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/upload', require('./routes/upload'));



// Ruta de prueba
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

module.exports = app;