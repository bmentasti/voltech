// VOLTECH — Autenticación segura
// Hashing con scrypt (built-in de Node, sin dependencias nativas).
// NUNCA se guarda la contraseña en texto plano ni en el frontend.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algo, salt, hash] = String(stored).split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const test = scryptSync(password, salt, 64);
    const ref = Buffer.from(hash, 'hex');
    return test.length === ref.length && timingSafeEqual(test, ref);
  } catch {
    return false;
  }
}

export function newToken() {
  return randomBytes(32).toString('hex');
}
