import type { WebRTCConfig } from './types';

/**
 * Default ICE servers (Google STUN servers)
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Default WebRTC configuration
 */
export const DEFAULT_CONFIG: WebRTCConfig = {
  iceServers: DEFAULT_ICE_SERVERS,
  channelName: 'zkPassport',
  channelOptions: {
    ordered: true,
  },
  iceGatheringTimeout: 3000, // 3 seconds
  sessionTTL: 300000, // 5 minutes
  debug: false,
};
