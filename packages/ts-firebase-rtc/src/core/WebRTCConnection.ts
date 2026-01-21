import { EventEmitter } from './EventEmitter';
import type { SignalingClient } from './signaling/SignalingClient';
import type {
  WebRTCConfig,
  PartialWebRTCConfig,
  ConnectionState,
  WebRTCEvents,
  OfferData,
  AnswerData,
  ICECandidateData,
  SessionMetadata,
} from './types';
import { WebRTCErrorCode, WebRTCError } from './types';
import { DEFAULT_CONFIG } from './config';
import { createLogger } from '../utils/logger';

/**
 * Role in WebRTC connection
 */
export type Role = 'offerer' | 'answerer';

/**
 * Framework-agnostic WebRTC connection manager
 *
 * This class manages a WebRTC peer connection with pluggable signaling.
 * It handles offer/answer exchange, ICE candidate gathering, and data channel communication.
 *
 * @example
 * ```typescript
 * // Desktop (offerer)
 * const signalingClient = new FirebaseSignalingClient({ firebaseConfig });
 * const connection = new WebRTCConnection(signalingClient, { debug: true });
 *
 * connection.on('message', ({ data }) => {
 *   console.log('Received:', data);
 * });
 *
 * const peerId = await connection.createOffer('peer-123');
 * console.log('Share this peer ID:', peerId);
 *
 * // Mobile (answerer)
 * const connection2 = new WebRTCConnection(signalingClient);
 * await connection2.createAnswer('peer-123');
 * ```
 */
export class WebRTCConnection extends EventEmitter<WebRTCEvents> {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private signalingClient: SignalingClient;
  private config: WebRTCConfig;
  private logger = createLogger('WebRTCConnection');
  private iceCandidates: RTCIceCandidate[] = [];
  private peerId: string | null = null;
  private role: Role | null = null;
  private state: ConnectionState = 'idle';
  private unsubscribers: Array<() => void> = [];
  private answerProcessed = false;

  constructor(
    signalingClient: SignalingClient,
    config: PartialWebRTCConfig = {}
  ) {
    super();
    this.signalingClient = signalingClient;
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.debug) {
      this.logger.setDebug(true);
    }
  }

  /**
   * Initialize as offerer (desktop/web)
   * Creates offer and returns peerId for QR code generation or sharing
   *
   * @param peerId - Unique peer identifier
   * @param metadata - Optional session metadata
   * @returns The peer ID
   */
  async createOffer(
    peerId: string,
    metadata?: SessionMetadata
  ): Promise<string> {
    if (this.peerConnection) {
      this.logger.warn('Peer connection already exists');
      return this.peerId || peerId;
    }

    try {
      this.setState('initializing');
      this.role = 'offerer';
      this.peerId = peerId;
      this.answerProcessed = false;

      this.logger.log(`Creating offer as offerer: ${peerId}`);

      // Initialize signaling
      await this.signalingClient.initialize();

      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers,
      });

      this.setupPeerConnectionHandlers();

      // Create data channel (offerer creates it)
      this.dataChannel = this.peerConnection.createDataChannel(
        this.config.channelName,
        this.config.channelOptions
      );
      this.setupDataChannelHandlers(this.dataChannel);

      // Collect ICE candidates
      this.setupIceCandidateCollection();

      // Create and set local description
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.logger.log('Waiting for ICE gathering...');
      this.setState('connecting');

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Upload offer to signaling server
      const offerData: OfferData = {
        sdp: {
          type: this.peerConnection.localDescription!.type as RTCSdpType,
          sdp: this.peerConnection.localDescription!.sdp,
        },
        ice: this.serializeIceCandidates(this.iceCandidates),
      };

      await this.signalingClient.createOffer(peerId, offerData, metadata);
      this.logger.log('Offer uploaded to signaling server');

      // Listen for answer
      this.setupAnswerListener();

      // Listen for remote ICE candidates (trickle ICE)
      this.setupRemoteIceCandidateListener();

      return peerId;
    } catch (error) {
      this.logger.error('Create offer failed:', error);
      this.setState('failed');
      const webrtcError = this.createError(
        'Failed to create offer',
        WebRTCErrorCode.OFFER_CREATION_FAILED,
        error
      );
      this.emit('error', { error: webrtcError });
      throw webrtcError;
    }
  }

  /**
   * Initialize as answerer (mobile)
   * Retrieves offer and creates answer
   *
   * @param peerId - Unique peer identifier
   */
  async createAnswer(peerId: string): Promise<void> {
    if (this.peerConnection) {
      this.logger.warn('Peer connection already exists');
      return;
    }

    try {
      this.setState('initializing');
      this.role = 'answerer';
      this.peerId = peerId;

      this.logger.log(`Creating answer as answerer: ${peerId}`);

      // Initialize signaling
      await this.signalingClient.initialize();

      // Get offer from signaling server
      const { offer, metadata } = await this.signalingClient.getOffer(peerId);
      this.logger.log(`Offer retrieved${metadata ? ' with metadata' : ''}`);

      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers,
      });

      this.setupPeerConnectionHandlers();

      // Setup data channel handler (answerer receives it)
      this.peerConnection.ondatachannel = (event) => {
        this.logger.log('Data channel received');
        this.dataChannel = event.channel;
        this.setupDataChannelHandlers(this.dataChannel);
      };

      // Collect ICE candidates
      this.setupIceCandidateCollection();

      // Set remote description (offer)
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer.sdp)
      );
      this.logger.log('Remote description (offer) set');

      // Add offer ICE candidates
      for (const candidate of offer.ice) {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }
      this.logger.log(`Added ${offer.ice.length} ICE candidates from offer`);

      // Create and set local description (answer)
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.logger.log('Waiting for ICE gathering...');
      this.setState('connecting');

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Upload answer to signaling server
      const answerData: AnswerData = {
        sdp: {
          type: this.peerConnection.localDescription!.type as RTCSdpType,
          sdp: this.peerConnection.localDescription!.sdp,
        },
        ice: this.serializeIceCandidates(this.iceCandidates),
      };

      await this.signalingClient.createAnswer(peerId, answerData);
      this.logger.log('Answer uploaded to signaling server');
    } catch (error) {
      this.setState('failed');
      const webrtcError = this.createError(
        'Failed to create answer',
        WebRTCErrorCode.ANSWER_CREATION_FAILED,
        error
      );
      this.emit('error', { error: webrtcError });
      throw webrtcError;
    }
  }

  /**
   * Send data through data channel
   * @param data - Data to send (will be JSON-stringified)
   * @returns True if sent successfully
   */
  send(data: any): boolean {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.logger.error('Data channel not open');
      return false;
    }

    try {
      const message = JSON.stringify(data);
      this.dataChannel.send(message);
      this.logger.log('Data sent');
      return true;
    } catch (error) {
      this.logger.error('Failed to send data:', error);
      return false;
    }
  }

  /**
   * Close connection and cleanup
   */
  async close(): Promise<void> {
    this.logger.log('Closing connection...');

    // Unsubscribe from signaling listeners
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];

    // Close data channel
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Cleanup signaling session
    if (this.peerId) {
      await this.signalingClient.cleanup(this.peerId);
    }

    this.setState('closed');
    this.logger.log('Connection closed');
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get peer ID
   */
  getPeerId(): string | null {
    return this.peerId;
  }

  /**
   * Get role
   */
  getRole(): Role | null {
    return this.role;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  // Private methods

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('state:change', { state });
      this.logger.log(`State changed: ${state}`);
    }
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.peerConnection) return;

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection!.connectionState;
      this.logger.log(`Connection state: ${state}`);

      if (state === 'connected') {
        this.setState('connected');
        if (this.peerId) {
          this.emit('peer:connected', { peerId: this.peerId });
        }
      } else if (state === 'disconnected') {
        this.setState('disconnected');
        if (this.peerId) {
          this.emit('peer:disconnected', { peerId: this.peerId });
        }
      } else if (state === 'failed') {
        this.setState('failed');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection!.iceConnectionState;
      this.emit('ice:state', { state });
      this.logger.log(`ICE connection state: ${state}`);
    };

    this.peerConnection.onsignalingstatechange = () => {
      const state = this.peerConnection!.signalingState;
      this.emit('signaling:state', { state });
      this.logger.log(`Signaling state: ${state}`);
    };
  }

  private setupIceCandidateCollection(): void {
    if (!this.peerConnection) return;

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.logger.log(
          'ICE candidate:',
          event.candidate.candidate.substring(0, 50)
        );
        this.iceCandidates.push(event.candidate);
        this.emit('ice:candidate', { candidate: event.candidate });
      } else {
        this.logger.log('ICE gathering complete');
        this.emit('ice:candidate', { candidate: null });
      }
    };

    this.peerConnection.onicegatheringstatechange = () => {
      const state = this.peerConnection!.iceGatheringState;
      this.emit('ice:gathering', { state });
      this.logger.log(`ICE gathering state: ${state}`);
    };
  }

  private setupDataChannelHandlers(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this.logger.log('Data channel opened');
      this.setState('connected');
      this.emit('datachannel:state', { state: 'open' });
    };

    channel.onclose = () => {
      this.logger.log('Data channel closed');
      this.emit('datachannel:state', { state: 'closed' });
    };

    channel.onerror = (error) => {
      this.logger.error('Data channel error:', error);
      const webrtcError = this.createError(
        'Data channel error',
        WebRTCErrorCode.DATA_CHANNEL_FAILED,
        error
      );
      this.emit('error', { error: webrtcError });
    };

    channel.onmessage = (event) => {
      this.logger.log('Message received');
      try {
        const data = JSON.parse(event.data);
        this.emit('message', { data });
      } catch (error) {
        this.logger.error('Failed to parse message:', error);
      }
    };
  }

  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.peerConnection) {
        resolve();
        return;
      }

      if (this.peerConnection.iceGatheringState === 'complete') {
        this.logger.log('ICE gathering already complete');
        resolve();
        return;
      }

      const pc = this.peerConnection;

      const cleanup = () => {
        clearTimeout(timeout);
        pc.removeEventListener('icegatheringstatechange', handler);
      };

      const timeout = setTimeout(() => {
        cleanup();
        this.logger.log(
          `ICE gathering timeout after ${this.config.iceGatheringTimeout}ms, proceeding with ${this.iceCandidates.length} candidates`
        );
        resolve();
      }, this.config.iceGatheringTimeout);

      const handler = () => {
        if (pc.iceGatheringState === 'complete') {
          cleanup();
          this.logger.log(
            `ICE gathering complete with ${this.iceCandidates.length} candidates`
          );
          resolve();
        }
      };

      pc.addEventListener('icegatheringstatechange', handler);
    });
  }

  private setupAnswerListener(): void {
    if (!this.peerId) return;

    const unsubscribe = this.signalingClient.onAnswer(
      this.peerId,
      async (answer) => {
        if (!answer || this.answerProcessed) return;

        // Set flag BEFORE async operations to prevent race condition
        this.answerProcessed = true;

        try {
          this.logger.log('Answer received from signaling server');

          if (this.peerConnection?.signalingState !== 'have-local-offer') {
            this.logger.error(
              `Wrong signaling state for answer: ${this.peerConnection?.signalingState}`
            );
            // Reset flag since we couldn't process the answer
            this.answerProcessed = false;
            return;
          }

          await this.peerConnection!.setRemoteDescription(
            new RTCSessionDescription(answer.sdp)
          );
          this.logger.log('Remote description (answer) set');
        } catch (error) {
          // Reset flag on error so retry is possible
          this.answerProcessed = false;
          this.logger.error('Failed to process answer:', error);
          const webrtcError = this.createError(
            'Failed to process answer',
            WebRTCErrorCode.SIGNALING_FAILED,
            error
          );
          this.emit('error', { error: webrtcError });
        }
      }
    );

    this.unsubscribers.push(unsubscribe);
  }

  private setupRemoteIceCandidateListener(): void {
    if (!this.peerId) return;

    const unsubscribe = this.signalingClient.onRemoteIceCandidate(
      this.peerId,
      async (candidate) => {
        try {
          this.logger.log('Remote ICE candidate received');
          await this.peerConnection?.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
          this.logger.log('Remote ICE candidate added');
        } catch (error) {
          this.logger.error('Failed to add remote ICE candidate:', error);
        }
      }
    );

    this.unsubscribers.push(unsubscribe);
  }

  private serializeIceCandidates(
    candidates: RTCIceCandidate[]
  ): ICECandidateData[] {
    return candidates.map((candidate) => ({
      candidate: candidate.candidate,
      sdpMLineIndex: candidate.sdpMLineIndex,
      sdpMid: candidate.sdpMid,
      usernameFragment: candidate.usernameFragment || null,
    }));
  }

  private createError(
    message: string,
    code: WebRTCErrorCode,
    details?: unknown
  ): WebRTCError {
    return new WebRTCError(message, code, details);
  }
}
