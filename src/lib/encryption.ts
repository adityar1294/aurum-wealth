import CryptoJS from 'crypto-js';

const KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'aurum-default-key-change-in-prod';

export function encrypt(value: string): string {
  if (!value) return value;
  return CryptoJS.AES.encrypt(value, KEY).toString();
}

export function decrypt(value: string): string {
  if (!value) return value;
  try {
    const bytes = CryptoJS.AES.decrypt(value, KEY);
    return bytes.toString(CryptoJS.enc.Utf8) || value;
  } catch {
    return value;
  }
}

export const ENCRYPTED_FIELDS = ['phone', 'dateOfBirth', 'pan', 'aadhaar', 'address'];

export function encryptPersonalInfo(info: Record<string, string>): Record<string, string> {
  const result = { ...info };
  for (const field of ENCRYPTED_FIELDS) {
    if (result[field]) result[field] = encrypt(result[field]);
  }
  return result;
}

export function decryptPersonalInfo(info: Record<string, string>): Record<string, string> {
  const result = { ...info };
  for (const field of ENCRYPTED_FIELDS) {
    if (result[field]) result[field] = decrypt(result[field]);
  }
  return result;
}
