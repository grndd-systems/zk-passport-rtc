import type { SignalingClient } from '@grndd-systems/ts-firebase-rtc/core';
import { WebRTCConnection } from '@grndd-systems/ts-firebase-rtc/core';
import type {
  ProofSessionOptions,
  SessionState,
  UnsignedTransaction,
  MobileProofResponse,
  QueryProofData,
  SessionEvents,
} from '../types';
import type { ContractClient } from '../contracts/ContractClient';
import { toBeHex } from 'ethers';

/**
 * Event emitter for session events
 */
class SessionEventEmitter {
  private listeners: Map<keyof SessionEvents, Set<(data: any) => void>> = new Map();

  on<K extends keyof SessionEvents>(
    event: K,
    listener: (data: SessionEvents[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => this.off(event, listener);
  }

  off<K extends keyof SessionEvents>(
    event: K,
    listener: (data: SessionEvents[K]) => void
  ): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof SessionEvents>(event: K, data: SessionEvents[K]): void {
    this.listeners.get(event)?.forEach((listener) => listener(data));
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

/**
 * Manages a single proof session with mobile app
 */
export class ProofSession extends SessionEventEmitter {
  private connection: WebRTCConnection;
  private _state: SessionState = 'idle';
  private _peerId: string | null = null;
  private _error: Error | null = null;
  private transactionPromise: Promise<UnsignedTransaction> | null = null;
  private transactionResolve: ((tx: UnsignedTransaction) => void) | null = null;
  private transactionReject: ((error: Error) => void) | null = null;

  constructor(
    signalingClient: SignalingClient,
    private contractClient: ContractClient,
    private options: ProofSessionOptions,
    private debug: boolean = false
  ) {
    super();

    // Create WebRTC connection
    this.connection = new WebRTCConnection(signalingClient, {
      debug: this.debug,
    });

    // Setup WebRTC event listeners
    this.setupConnectionListeners();
  }

  /**
   * Current session state
   */
  get state(): SessionState {
    return this._state;
  }

  /**
   * Peer ID for QR code
   */
  get peerId(): string | null {
    return this._peerId;
  }

  /**
   * QR code URL (data URL containing peer ID and session info)
   */
  get qrCodeUrl(): string | null {
    if (!this._peerId) return null;

    // Build QR code payload
    const payload = {
      peerId: this._peerId,
      type: this.options.type,
      userAddress: this.options.userAddress,
      conditions: this.options.conditions,
    };

    // Return as data URL for QR code generation
    return `data:application/json,${encodeURIComponent(JSON.stringify(payload))}`;
  }

  /**
   * Last error if any
   */
  get error(): Error | null {
    return this._error;
  }

  /**
   * Initialize the session and create offer
   */
  async initialize(): Promise<void> {
    try {
      this.setState('initializing');

      // Generate peer ID and create offer (using crypto-secure random)
      const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : this.generateFallbackUUID();
      const peerId = `proof-${uuid}`;
      this._peerId = peerId;

      this.log('Creating WebRTC offer with peer ID:', peerId);

      // Create offer (metadata is optional and handled by QR code payload)
      await this.connection.createOffer(peerId);

      this.setState('waiting_for_mobile');
      this.emit('mobile:connected', { peerId });
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Wait for transaction to be ready
   */
  async waitForTransaction(): Promise<UnsignedTransaction> {
    if (this.transactionPromise) {
      return this.transactionPromise;
    }

    this.transactionPromise = new Promise((resolve, reject) => {
      this.transactionResolve = resolve;
      this.transactionReject = reject;
    });

    return this.transactionPromise;
  }

  /**
   * Close the session
   */
  close(): void {
    this.log('Closing session');
    this.connection.close();
    this.setState('completed');
    this.removeAllListeners();
  }

  /**
   * Setup WebRTC connection event listeners
   */
  private setupConnectionListeners(): void {
    // Connection state changes
    this.connection.on('state:change', ({ state }) => {
      this.log('WebRTC state changed:', state);

      if (state === 'connected') {
        this.setState('mobile_connected');
      } else if (state === 'disconnected' || state === 'failed') {
        this.handleError(new Error(`Connection ${state}`));
      }
    });

    // Receive messages from mobile
    this.connection.on('message', ({ data }) => {
      this.log('Received message from mobile:', data);
      this.handleMobileMessage(data);
    });

    // Connection errors
    this.connection.on('error', ({ error }) => {
      this.handleError(error);
    });
  }

  /**
   * Handle message received from mobile app
   */
  private async handleMobileMessage(data: any): Promise<void> {
    try {
      const message = data as MobileProofResponse;

      this.log('Processing mobile message:', message.type);
      this.setState('proof_received');
      this.emit('proof:received', { type: this.options.type });

      // Build transaction based on proof type
      const transaction = await this.buildTransaction(message);

      this.setState('transaction_ready');
      this.emit('transaction:ready', { transaction });

      // Resolve the transaction promise
      if (this.transactionResolve) {
        this.transactionResolve(transaction);
      }
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Build transaction from mobile proof data
   */
  private async buildTransaction(
    proofData: MobileProofResponse
  ): Promise<UnsignedTransaction> {
    this.log('Building transaction for proof type:', this.options.type);

    // For registration type, use registration data
    if (this.options.type === 'registration') {
      if (!proofData.data.registration) {
        throw new Error('Registration data missing from mobile response');
      }

      return this.contractClient.buildRegistrationTransaction(
        proofData.data.registration
      );
    }

    // For query proofs (age_check, disclosure), we need to check if user is registered
    const sessionKey = this.getSessionKeyFromProof(proofData);
    const isRegistered = await this.contractClient.isUserRegistered(sessionKey);

    this.log('User registration status:', isRegistered);

    if (isRegistered) {
      // User is registered - just submit query proof
      const queryProof: QueryProofData = {
        zkPoints: proofData.data.zkPoints!,
      };

      return this.contractClient.buildQueryProofTransaction(
        queryProof,
        this.options.userAddress,
        sessionKey
      );
    } else {
      // User not registered - need combined registration + query proof
      if (!proofData.data.registration) {
        throw new Error('Registration data required for unregistered user');
      }

      const queryProof: QueryProofData = {
        zkPoints: proofData.data.zkPoints!,
      };

      return this.contractClient.buildQueryProofWithRegistrationTransaction(
        queryProof,
        proofData.data.registration,
        this.options.userAddress
      );
    }
  }

  /**
   * Extract session key from proof data
   */
  private getSessionKeyFromProof(proofData: MobileProofResponse): string {
    if (proofData.data.registration) {
      return toBeHex(proofData.data.registration.identityKey, 32);
    }

    if (proofData.data.identityKey) {
      const key =
        typeof proofData.data.identityKey === 'string'
          ? BigInt(proofData.data.identityKey)
          : proofData.data.identityKey;
      return toBeHex(key, 32);
    }

    throw new Error('Unable to extract session key from proof data');
  }

  /**
   * Update session state
   */
  private setState(state: SessionState): void {
    if (this._state === state) return;

    this.log('State changed:', this._state, '->', state);
    this._state = state;
    this.emit('state:change', { state });
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    this.log('Error:', error.message);
    this._error = error;
    this.setState('failed');
    this.emit('error', { error });

    if (this.transactionReject) {
      this.transactionReject(error);
    }
  }

  /**
   * Fallback UUID generator using crypto.getRandomValues()
   * Used when crypto.randomUUID() is not available
   */
  private generateFallbackUUID(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    // Set version (4) and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /**
   * Debug logging
   */
  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[ProofSession]', ...args);
    }
  }
}
