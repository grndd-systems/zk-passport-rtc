/**
 * Connection state lifecycle
 */
export type ConnectionState =
  | 'idle'
  | 'initializing'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

/**
 * Data channel state
 */
export type DataChannelState = 'connecting' | 'open' | 'closing' | 'closed';

/**
 * ICE connection state
 */
export type ICEConnectionState = RTCIceConnectionState;

/**
 * ICE gathering state
 */
export type ICEGatheringState = RTCIceGatheringState;

/**
 * Signaling state
 */
export type SignalingState = RTCSignalingState;

/**
 * WebRTC configuration
 */
export interface WebRTCConfig {
  /** ICE servers configuration */
  iceServers: RTCIceServer[];
  /** Data channel name */
  channelName: string;
  /** Data channel options */
  channelOptions: RTCDataChannelInit;
  /** ICE gathering timeout (ms) */
  iceGatheringTimeout: number;
  /** Session TTL (ms) */
  sessionTTL: number;
  /** Enable detailed logging */
  debug: boolean;
}

/**
 * Partial WebRTC configuration for user overrides
 */
export type PartialWebRTCConfig = Partial<WebRTCConfig>;

/**
 * SDP data structure
 */
export interface SDPData {
  type: RTCSdpType;
  sdp: string;
}

/**
 * ICE candidate data (serializable)
 */
export interface ICECandidateData {
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
  usernameFragment?: string | null;
}

/**
 * Offer data with SDP and ICE candidates
 */
export interface OfferData {
  sdp: SDPData;
  ice: ICECandidateData[];
}

/**
 * Answer data with SDP and ICE candidates
 */
export interface AnswerData {
  sdp: SDPData;
  ice: ICECandidateData[];
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  createdAt: number;
  expiresAt?: number;
  [key: string]: any;
}

/**
 * Generic message format for data channel
 */
export interface Message<T = any> {
  type: string;
  payload: T;
  timestamp: number;
}

/**
 * WebRTC event map for type-safe event emitter
 */
export interface WebRTCEvents {
  'state:change': { state: ConnectionState };
  'datachannel:state': { state: DataChannelState };
  'ice:state': { state: ICEConnectionState };
  'ice:candidate': { candidate: RTCIceCandidate | null };
  'ice:gathering': { state: ICEGatheringState };
  'signaling:state': { state: SignalingState };
  'message': { data: any };
  'error': { error: Error };
  'peer:connected': { peerId: string };
  'peer:disconnected': { peerId: string };
}

/**
 * WebRTC error codes
 */
export enum WebRTCErrorCode {
  INIT_FAILED = 'INIT_FAILED',
  OFFER_CREATION_FAILED = 'OFFER_CREATION_FAILED',
  ANSWER_CREATION_FAILED = 'ANSWER_CREATION_FAILED',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  DATA_CHANNEL_FAILED = 'DATA_CHANNEL_FAILED',
  SIGNALING_FAILED = 'SIGNALING_FAILED',
  INVALID_STATE = 'INVALID_STATE',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Custom WebRTC error class
 */
export class WebRTCError extends Error {
  constructor(
    message: string,
    public code: WebRTCErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'WebRTCError';

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, WebRTCError.prototype);
  }
}
