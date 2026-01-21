/**
 * Type guards and validators for zk-passport data structures
 */

import type { RegistrationProofData, QueryProofData } from '../types';

/**
 * Check if string is valid hex with 0x prefix
 */
export function isValidHex(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value);
}

/**
 * Check if value can be converted to BigInt
 */
export function isValidBigIntString(value: unknown): boolean {
  if (typeof value === 'bigint') return true;
  if (typeof value !== 'string') return false;

  try {
    BigInt(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate passport struct
 */
export function isValidPassportStruct(passport: unknown): boolean {
  if (!passport || typeof passport !== 'object') return false;

  const p = passport as Record<string, unknown>;
  const requiredFields = ['dataType', 'zkType', 'signature', 'publicKey', 'passportHash'];

  for (const field of requiredFields) {
    if (!isValidHex(p[field])) {
      console.error(`❌ Invalid passport.${field}:`, p[field]);
      return false;
    }
  }

  return true;
}

/**
 * Validate registration proof data structure
 * Accepts both `zkPoints` and `registrationZkPoints` field names
 */
export function isValidRegistrationProofData(data: unknown): data is RegistrationProofData {
  if (!data || typeof data !== 'object') return false;

  const reg = data as Record<string, unknown>;

  // Check required hex fields
  if (!isValidHex(reg.certificatesRoot)) {
    console.error('❌ Invalid certificatesRoot:', reg.certificatesRoot);
    return false;
  }

  if (!isValidHex(reg.zkPoints)) {
    console.error('❌ Invalid zkPoints:', reg.zkPoints);
    return false;
  }

  // Check BigInt fields
  if (!isValidBigIntString(reg.dgCommit)) {
    console.error('❌ Invalid dgCommit:', reg.dgCommit);
    return false;
  }

  if (!isValidBigIntString(reg.identityKey)) {
    console.error('❌ Invalid identityKey:', reg.identityKey);
    return false;
  }

  if (!isValidBigIntString(reg.passportKey)) {
    console.error('❌ Invalid passportKey:', reg.passportKey);
    return false;
  }

  // Check passport object
  if (!isValidPassportStruct(reg.passport)) {
    console.error('❌ Invalid passport struct');
    return false;
  }

  return true;
}

/**
 * Validate query proof data structure
 */
export function isValidQueryProofData(data: unknown): data is QueryProofData {
  if (!data || typeof data !== 'object') return false;

  const proof = data as Record<string, unknown>;

  if (!isValidHex(proof.zkPoints)) {
    console.error('❌ Invalid zkPoints:', proof.zkPoints);
    return false;
  }

  return true;
}

/**
 * Safe BigInt conversion with validation
 * Returns bigint or null on error
 */
export function safeBigInt(value: unknown, fieldName?: string): bigint | null {
  try {
    return BigInt(value as string | number | bigint);
  } catch (error) {
    if (fieldName) {
      console.error(`❌ Failed to convert ${fieldName} to BigInt:`, value, error);
    }
    return null;
  }
}

/**
 * Safe error message extraction
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

/**
 * Convert BigInt to hex string with 0x prefix
 */
export function bigIntToHex(value: bigint | number, padLength?: number): `0x${string}` {
  const hex = BigInt(value).toString(16);
  const padded = padLength ? hex.padStart(padLength, '0') : hex;
  return `0x${padded}` as `0x${string}`;
}

/**
 * Convert hex string to BigInt
 */
export function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}
