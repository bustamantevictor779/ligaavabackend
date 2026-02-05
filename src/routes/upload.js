const express = require('express');
const router = express.Router();
const { upload, cloudinary } = require('../config/cloudinary');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            console.error('Error en subida de imagen:', err);
            return res.status(500).json({ message: 'Error al subir imagen: ' + err.message });
        }
        next();
    });
}, (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No se ha subido ninguna imagen' });
    }
    res.json({ url: req.file.path });
});

// Ruta para eliminar imagen
router.delete('/', verifyToken, async (req, res) => {
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) return res.status(400).json({ message: 'URL de imagen requerida' });

        // Extraer el public_id de la URL
        // Las URLs son tipo: .../upload/v1234/ligaava/imagen.jpg
        // Necesitamos: ligaava/imagen
        const parts = imageUrl.split('/');
        const filename = parts[parts.length - 1]; // imagen.jpg
        const publicId = `ligaava/${filename.split('.')[0]}`; // ligaava/imagen

        await cloudinary.uploader.destroy(publicId);
        res.json({ message: 'Imagen eliminada correctamente' });
    } catch (error) {
        console.error('Error eliminando imagen de Cloudinary:', error);
        // No devolvemos 500 para no bloquear el flujo principal si falla el borrado de imagen
        res.status(200).json({ message: 'Nota: No se pudo eliminar la imagen del servidor remoto' });
    }
});

module.exports = router;