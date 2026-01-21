import {
  type FirebaseApp,
  initializeApp,
  type FirebaseOptions,
} from 'firebase/app';
import {
  type Database,
  getDatabase,
  ref,
  set,
  get,
  onValue,
  remove,
  type Unsubscribe,
} from 'firebase/database';
import { SignalingClient, type SignalingClientConfig } from './SignalingClient';
import type {
  OfferData,
  AnswerData,
  ICECandidateData,
  SessionMetadata,
} from '../types';
import { createLogger } from '../../utils/logger';

/**
 * Firebase signaling client configuration
 */
export interface FirebaseSignalingConfig extends SignalingClientConfig {
  /** Firebase configuration object */
  firebaseConfig: FirebaseOptions;
  /** Firebase app instance (if already initialized) */
  firebaseApp?: FirebaseApp;
  /** Firebase database instance (if already initialized) */
  firebaseDatabase?: Database;
  /** Base path for signals in database (default: 'signals') */
  basePath?: string;
}

/**
 * Firebase Realtime Database signaling implementation
 *
 * Database structure:
 * ```
 * signals/
 *   {peerId}/
 *     offer/
 *       sdp: { type, sdp }
 *       ice: [RTCIceCandidate[]]
 *       metadata: any
 *       timestamp: number
 *       expiresAt: number
 *     answer/
 *       sdp: { type, sdp }
 *       ice: [RTCIceCandidate[]]
 *       timestamp: number
 * ```
 *
 * @example
 * ```typescript
 * const signalingClient = new FirebaseSignalingClient({
 *   firebaseConfig: {
 *     apiKey: '...',
 *     authDomain: '...',
 *     databaseURL: '...',
 *     projectId: '...',
 *   },
 * });
 *
 * await signalingClient.initialize();
 * ```
 */
export class FirebaseSignalingClient extends SignalingClient {
  private app: FirebaseApp | null = null;
  private database: Database | null = null;
  private config: Required<Omit<FirebaseSignalingConfig, 'firebaseApp' | 'firebaseDatabase'>> & Pick<FirebaseSignalingConfig, 'firebaseApp' | 'firebaseDatabase'>;
  private logger = createLogger('FirebaseSignaling');
  private unsubscribers = new Map<string, Unsubscribe>();

  constructor(config: FirebaseSignalingConfig) {
    super();
    this.config = {
      sessionTTL: 300000, // 5 minutes default
      basePath: 'signals',
      debug: false,
      ...config,
    };

    if (this.config.debug) {
      this.logger.setDebug(true);
    }
  }

  async initialize(): Promise<void> {
    try {
      // Use provided instances or initialize new ones
      if (this.config.firebaseApp) {
        this.app = this.config.firebaseApp;
        this.logger.log('Using provided Firebase app instance');
      } else {
        this.app = initializeApp(this.config.firebaseConfig);
        this.logger.log('Initialized new Firebase app');
      }

      if (this.config.firebaseDatabase) {
        this.database = this.config.firebaseDatabase;
        this.logger.log('Using provided Firebase database instance');
      } else {
        this.database = getDatabase(this.app);
        this.logger.log('Initialized new Firebase database');
      }

      this.logger.log('Firebase signaling initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase signaling:', error);
      throw error;
    }
  }

  async createOffer(
    peerId: string,
    offer: OfferData,
    metadata?: SessionMetadata
  ): Promise<void> {
    if (!this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const offerRef = ref(
      this.database,
      `${this.config.basePath}/${peerId}/offer`
    );

    try {
      const offerData: any = {
        sdp: offer.sdp,
        ice: offer.ice,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.config.sessionTTL,
      };

      // Only include metadata if it's defined (Firebase doesn't allow undefined values)
      if (metadata !== undefined) {
        offerData.metadata = metadata;
      }

      await set(offerRef, offerData);

      this.logger.log(
        `Offer created for ${peerId} with ${offer.ice.length} ICE candidates`
      );
    } catch (error) {
      this.logger.error(`Failed to create offer for ${peerId}:`, error);
      throw error;
    }
  }

  async getOffer(
    peerId: string
  ): Promise<{ offer: OfferData; metadata?: SessionMetadata }> {
    if (!this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const offerRef = ref(
      this.database,
      `${this.config.basePath}/${peerId}/offer`
    );
    const snapshot = await get(offerRef);

    if (!snapshot.exists()) {
      throw new Error(`Offer not found for peer: ${peerId}`);
    }

    const data = snapshot.val();

    // Validate offer has not expired
    if (data.expiresAt && Date.now() > data.expiresAt) {
      throw new Error(`Offer expired for peer: ${peerId}`);
    }

    this.logger.log(`Offer retrieved for ${peerId}`);

    return {
      offer: {
        sdp: data.sdp,
        ice: data.ice || [],
      },
      metadata: data.metadata,
    };
  }

  async createAnswer(peerId: string, answer: AnswerData): Promise<void> {
    if (!this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const answerRef = ref(
      this.database,
      `${this.config.basePath}/${peerId}/answer`
    );

    await set(answerRef, {
      sdp: answer.sdp,
      ice: answer.ice,
      timestamp: Date.now(),
    });

    this.logger.log(
      `Answer created for ${peerId} with ${answer.ice.length} ICE candidates`
    );
  }

  async getAnswer(peerId: string): Promise<AnswerData | null> {
    if (!this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const answerRef = ref(
      this.database,
      `${this.config.basePath}/${peerId}/answer`
    );
    const snapshot = await get(answerRef);

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.val();
    return {
      sdp: data.sdp,
      ice: data.ice || [],
    };
  }

  onAnswer(
    peerId: string,
    callback: (answer: AnswerData | null) => void
  ): () => void {
    if (!this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    // Listen only to SDP path (ICE candidates come separately via trickle)
    const answerSdpRef = ref(
      this.database,
      `${this.config.basePath}/${peerId}/answer/sdp`
    );

    const unsubscribe = onValue(answerSdpRef, (snapshot) => {
      if (snapshot.exists()) {
        const sdp = snapshot.val();
        this.logger.log(`Answer SDP received for ${peerId}`);
        callback({ sdp, ice: [] }); // ICE candidates come separately via trickle
      } else {
        this.logger.log(`Answer not found yet for ${peerId}`);
        callback(null);
      }
    });

    const key = `answer-${peerId}`;
    this.unsubscribers.set(key, unsubscribe);

    // Return unsubscribe function
    return () => {
      unsubscribe();
      this.unsubscribers.delete(key);
      this.logger.log(`Unsubscribed from answer for ${peerId}`);
    };
  }

  onRemoteIceCandidate(
    peerId: string,
    callback: (candidate: ICECandidateData) => void
  ): () => void {
    if (!this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const iceRef = ref(
      this.database,
      `${this.config.basePath}/${peerId}/answer/ice`
    );

    // Track processed candidates to avoid duplicates
    const processedCandidates = new Set<string>();

    const unsubscribe = onValue(iceRef, (snapshot) => {
      if (snapshot.exists()) {
        const candidates = snapshot.val();

        // Firebase stores as object with keys, iterate through them
        Object.entries(candidates).forEach(([key, candidate]: [string, any]) => {
          if (!processedCandidates.has(key)) {
            this.logger.log(`Remote ICE candidate received for ${peerId}`);
            processedCandidates.add(key);
            callback(candidate);
          }
        });
      }
    });

    const key = `ice-${peerId}`;
    this.unsubscribers.set(key, unsubscribe);

    // Return unsubscribe function
    return () => {
      unsubscribe();
      this.unsubscribers.delete(key);
      this.logger.log(`Unsubscribed from ICE candidates for ${peerId}`);
    };
  }

  async sessionExists(peerId: string): Promise<boolean> {
    if (!this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const sessionRef = ref(
      this.database,
      `${this.config.basePath}/${peerId}`
    );
    const snapshot = await get(sessionRef);
    const exists = snapshot.exists();

    this.logger.log(`Session ${peerId} exists: ${exists}`);
    return exists;
  }

  async cleanup(peerId: string): Promise<void> {
    if (!this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    // Unsubscribe from any active listeners for this peer
    const answerKey = `answer-${peerId}`;
    const iceKey = `ice-${peerId}`;

    if (this.unsubscribers.has(answerKey)) {
      this.unsubscribers.get(answerKey)!();
      this.unsubscribers.delete(answerKey);
    }

    if (this.unsubscribers.has(iceKey)) {
      this.unsubscribers.get(iceKey)!();
      this.unsubscribers.delete(iceKey);
    }

    // Remove session data
    const sessionRef = ref(
      this.database,
      `${this.config.basePath}/${peerId}`
    );
    await remove(sessionRef);

    this.logger.log(`Session cleaned up for ${peerId}`);
  }

  async close(): Promise<void> {
    // Unsubscribe from all listeners
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();

    this.logger.log('Firebase signaling client closed');
  }
}
