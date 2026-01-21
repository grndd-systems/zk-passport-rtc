import { FirebaseSignalingClient } from '@grndd-systems/ts-firebase-rtc/core';
import type { SignalingClient } from '@grndd-systems/ts-firebase-rtc/core';
import type { ZkPassportClientConfig, ProofSessionOptions } from '../types';
import { ContractClient } from '../contracts/ContractClient';
import { ProofSession } from './ProofSession';

/**
 * Main client for zk-passport proof sessions
 *
 * @example
 * ```typescript
 * const client = new ZkPassportClient({
 *   firebase: { ... },
 *   contracts: {
 *     registration: '0x...',
 *     queryProofExecutor: '0x...',
 *     stateKeeper: '0x...'
 *   },
 *   provider: ethersProvider
 * });
 *
 * const session = await client.createProofSession({
 *   type: 'age_check',
 *   userAddress: '0x...'
 * });
 *
 * console.log(session.qrCodeUrl); // Show QR code to user
 * const tx = await session.waitForTransaction();
 * await signer.sendTransaction(tx);
 * ```
 */
export class ZkPassportClient {
  private signalingClient: SignalingClient;
  private contractClient: ContractClient;
  private activeSessions: Set<ProofSession> = new Set();
  private debug: boolean;

  constructor(config: ZkPassportClientConfig) {
    this.debug = config.debug ?? false;

    // Initialize Firebase signaling client
    this.signalingClient = new FirebaseSignalingClient({
      firebaseConfig: config.firebase,
    });

    // Initialize contract client
    this.contractClient = new ContractClient(config.provider, config.contracts);

    this.log('Client initialized');
  }

  /**
   * Create a new proof session
   *
   * @param options - Session configuration
   * @returns ProofSession instance
   *
   * @example
   * ```typescript
   * // Age verification
   * const session = await client.createProofSession({
   *   type: 'age_check',
   *   userAddress: '0x123...',
   *   conditions: { minAge: 18 }
   * });
   *
   * // Registration
   * const session = await client.createProofSession({
   *   type: 'registration',
   *   userAddress: '0x123...'
   * });
   *
   * // Disclosure
   * const session = await client.createProofSession({
   *   type: 'disclosure',
   *   userAddress: '0x123...',
   *   conditions: {
   *     fields: ['citizenship', 'birthDate']
   *   }
   * });
   * ```
   */
  async createProofSession(options: ProofSessionOptions): Promise<ProofSession> {
    this.log('Creating proof session:', options.type);

    // Create session
    const session = new ProofSession(
      this.signalingClient,
      this.contractClient,
      options,
      this.debug
    );

    // Track active session
    this.activeSessions.add(session);

    // Remove from active sessions when completed
    session.on('state:change', ({ state }) => {
      if (state === 'completed' || state === 'failed') {
        this.activeSessions.delete(session);
      }
    });

    // Initialize the session (create WebRTC offer)
    await session.initialize();

    return session;
  }

  /**
   * Close all active sessions and cleanup
   */
  close(): void {
    this.log('Closing client, active sessions:', this.activeSessions.size);

    // Close all active sessions
    this.activeSessions.forEach((session) => session.close());
    this.activeSessions.clear();

    // Close signaling client
    this.signalingClient.close();
  }

  /**
   * Get number of active sessions
   */
  get activeSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Debug logging
   */
  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[ZkPassportClient]', ...args);
    }
  }
}
