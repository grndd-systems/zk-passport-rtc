import type {
  OfferData,
  AnswerData,
  ICECandidateData,
  SessionMetadata,
} from '../types';

/**
 * Signaling client configuration
 */
export interface SignalingClientConfig {
  /** Session TTL in milliseconds */
  sessionTTL?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Abstract signaling client interface
 * Implement this interface to create custom signaling backends (Firebase, HTTP, WebSocket, etc.)
 *
 * @example
 * ```typescript
 * class MySignalingClient extends SignalingClient {
 *   async initialize() { / * ... * / }
 *   async createOffer(peerId, offer, metadata) { / * ... * / }
 *   // ... implement other methods
 * }
 * ```
 */
export abstract class SignalingClient {
  /**
   * Initialize the signaling client
   * Called before any other methods
   */
  abstract initialize(): Promise<void>;

  /**
   * Create and publish an offer
   * @param peerId - Unique peer identifier
   * @param offer - Offer data with SDP and ICE candidates
   * @param metadata - Optional session metadata (e.g., createdAt, expiresAt)
   */
  abstract createOffer(
    peerId: string,
    offer: OfferData,
    metadata?: SessionMetadata
  ): Promise<void>;

  /**
   * Retrieve an offer (one-time read)
   * @param peerId - Unique peer identifier
   * @returns Offer data with optional metadata
   */
  abstract getOffer(
    peerId: string
  ): Promise<{ offer: OfferData; metadata?: SessionMetadata }>;

  /**
   * Create and publish an answer
   * @param peerId - Unique peer identifier
   * @param answer - Answer data with SDP and ICE candidates
   */
  abstract createAnswer(peerId: string, answer: AnswerData): Promise<void>;

  /**
   * Get answer (one-time read)
   * @param peerId - Unique peer identifier
   * @returns Answer data or null if not yet available
   */
  abstract getAnswer(peerId: string): Promise<AnswerData | null>;

  /**
   * Listen for answer updates (realtime)
   * The callback receives the SDP when it becomes available.
   * ICE candidates should be handled separately via onRemoteIceCandidate.
   *
   * @param peerId - Unique peer identifier
   * @param callback - Callback when answer is received
   * @returns Unsubscribe function to stop listening
   */
  abstract onAnswer(
    peerId: string,
    callback: (answer: AnswerData | null) => void
  ): () => void;

  /**
   * Listen for remote ICE candidates (trickle ICE)
   * This allows ICE candidates to be exchanged incrementally rather than
   * waiting for all candidates to be gathered.
   *
   * @param peerId - Unique peer identifier
   * @param callback - Callback when ICE candidate is received
   * @returns Unsubscribe function to stop listening
   */
  abstract onRemoteIceCandidate(
    peerId: string,
    callback: (candidate: ICECandidateData) => void
  ): () => void;

  /**
   * Check if session exists
   * @param peerId - Unique peer identifier
   * @returns True if session exists
   */
  abstract sessionExists(peerId: string): Promise<boolean>;

  /**
   * Cleanup session data
   * @param peerId - Unique peer identifier
   */
  abstract cleanup(peerId: string): Promise<void>;

  /**
   * Cleanup and close the signaling client
   * Called when the client is no longer needed
   */
  abstract close(): Promise<void>;
}
