/**
 * Load .env before any service modules. Must be the first import in index.js.
 * In ESM, imports run before module body, so dotenv.config() here ensures
 * process.env is populated before firebaseService etc. are loaded.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
