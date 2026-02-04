require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✓ Servidor corriendo en puerto ${PORT}`);
  console.log(`✓ http://localhost:${PORT}`);
  console.log('jwt secret: '+process.env.JWT_SECRET);
});