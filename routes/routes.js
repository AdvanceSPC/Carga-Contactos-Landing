const express = require('express');
const router = express.Router();
const { vistaPrincipal, subirArchivo } = require('../controllers/pageController');

// Ruta principal
router.get('/', vistaPrincipal);

// Ruta para subir el archivo
router.post('/upload', subirArchivo);

// Redirige a la página principal
router.use((req, res) => {
  res.redirect('/');
});

module.exports = router;
