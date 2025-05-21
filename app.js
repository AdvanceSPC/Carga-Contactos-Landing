const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');
const fileUpload = require('express-fileupload'); 

const app = express();

// Configuración de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(express.static('public'));

// Configuración de variables de entorno
dotenv.config({ path: './env/.env' });

// Middleware para manejar archivos
app.use(fileUpload());

// Cargar rutas
const routes = require('./routes/routes');
app.use('/', routes);

app.use((req, res) => {
  res.status(404).render("404");
});

app.listen(3000, () => {
  console.log('SERVER UP running in http://localhost:3000');
});
