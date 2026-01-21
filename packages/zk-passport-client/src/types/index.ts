import type { FirebaseOptions } from 'firebase/app';
import type { Provider } from 'ethers';

/**
 * Proof request type
 */
export type ProofType = 'registration' | 'age_check' | 'disclosure';

/**
 * Client configuration
 */
export interface ZkPassportClientConfig {
  /** Firebase configuration for WebRTC signaling */
  firebase: FirebaseOptions;

  /** Contract addresses */
  contracts: {
    registration: string;
    queryProofExecutor: string;
    stateKeeper: string;
  };

  /** Ethers provider for reading contract state */
  provider: Provider;

  /** Optional: Debug mode */
  debug?: boolean;
}

/**
 * Proof session options
 */
export interface ProofSessionOptions {
  /** Type of proof to request */
  type: ProofType;

  /** User's wallet address */
  userAddress: string;

  /** Optional: Additional proof conditions */
  conditions?: {
    minAge?: number;
    allowedCountries?: string[];
    fields?: string[];
  };
}

/**
 * Session state
 */
export type SessionState =
  | 'idle'
  | 'initializing'
  | 'waiting_for_mobile'
  | 'mobile_connected'
  | 'proof_received'
  | 'transaction_ready'
  | 'completed'
  | 'failed';

/**
 * Passport struct (matches contract)
 */
export interface PassportStruct {
  dataType: string;
  zkType: string;
  signature: string;
  publicKey: string;
  passportHash: string;
}

/**
 * Registration proof data from mobile
 */
export interface RegistrationProofData {
  certificatesRoot: string;
  identityKey: bigint;
  dgCommit: bigint;
  passportKey: bigint;
  passport: PassportStruct;
  zkPoints: string;
}

/**
 * Query proof data from mobile
 */
export interface QueryProofData {
  zkPoints: string;
}

/**
 * Transaction to be signed
 */
export interface UnsignedTransaction {
  to: string;
  data: string;
  value?: bigint;
  gasLimit?: bigint;
}

/**
 * Session events
 */
export interface SessionEvents {
  'state:change': { state: SessionState };
  'mobile:connected': { peerId: string };
  'proof:received': { type: ProofType };
  'transaction:ready': { transaction: UnsignedTransaction };
  'error': { error: Error };
}

/**
 * Mobile proof response
 */
export interface MobileProofResponse {
  type: 'query_proof' | 'passport_keys';
  data: {
    registration?: RegistrationProofData;
    zkPoints?: string;
    passportKey?: string | bigint;
    identityKey?: string | bigint;
  };
}
