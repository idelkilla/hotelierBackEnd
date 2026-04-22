// src/config/upload.js
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// --- Configuración de __dirname para ESM ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANIO_MAX      = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Apunta a la carpeta 'uploads' en la raíz del backend
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (TIPOS_PERMITIDOS.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: TAMANIO_MAX },
  fileFilter,
});

export default upload;