import { useMemo } from 'react';
import type { FirebaseApp } from 'firebase/app';
import type { Database } from 'firebase/database';
import {
  FirebaseSignalingClient,
  type FirebaseSignalingConfig,
} from '../core/signaling/FirebaseSignalingClient';
import {
  useWebRTCConnection,
  type UseWebRTCConnectionResult,
} from './useWebRTCConnection';
import type { PartialWebRTCConfig } from '../core/types';

/**
 * Options for useWebRTCWithFirebase hook
 */
export interface UseWebRTCWithFirebaseOptions {
  /** Firebase configuration object (required if firebaseApp is not provided) */
  firebaseConfig?: FirebaseSignalingConfig['firebaseConfig'];
  /** Existing Firebase app instance (optional) */
  firebaseApp?: FirebaseApp;
  /** Existing Firebase database instance (optional) */
  firebaseDatabase?: Database;
  /** Base path for signals in database (default: 'signals') */
  basePath?: string;
  /** Session TTL in milliseconds (default: 300000 = 5 minutes) */
  sessionTTL?: number;
  /** WebRTC configuration overrides */
  webrtcConfig?: PartialWebRTCConfig;
  /** Automatically cleanup on unmount (default: true) */
  autoCleanup?: boolean;
}

/**
 * Convenience hook for WebRTC with Firebase signaling
 *
 * This hook automatically creates a FirebaseSignalingClient and passes it to useWebRTCConnection.
 * It's a drop-in replacement for the original useWebRTCWithFirebase from zk-passport-dapp.
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { state, createOffer, send, onMessage } = useWebRTCWithFirebase({
 *     firebaseConfig: {
 *       apiKey: '...',
 *       authDomain: '...',
 *       databaseURL: '...',
 *       projectId: '...',
 *     },
 *     webrtcConfig: {
 *       debug: true,
 *     },
 *   });
 *
 *   useEffect(() => {
 *     onMessage((data) => {
 *       console.log('Received:', data);
 *     });
 *   }, [onMessage]);
 *
 *   const handleCreateOffer = async () => {
 *     const peerId = await createOffer(generatePeerId());
 *     console.log('QR code data:', peerId);
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleCreateOffer} disabled={state.isConnected}>
 *         Create Connection
 *       </button>
 *       <p>Status: {state.state}</p>
 *       {state.isConnected && (
 *         <button onClick={() => send({ type: 'test', payload: 'hello' })}>
 *           Send Message
 *         </button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useWebRTCWithFirebase(
  options: UseWebRTCWithFirebaseOptions
): UseWebRTCConnectionResult {
  const {
    firebaseConfig,
    firebaseApp,
    firebaseDatabase,
    basePath,
    sessionTTL,
    webrtcConfig,
    autoCleanup = true,
  } = options;

  // Create Firebase signaling client (memoized to prevent recreation)
  const signalingClient = useMemo(() => {
    if (!firebaseConfig && !firebaseApp) {
      throw new Error(
        'Either firebaseConfig or firebaseApp must be provided'
      );
    }

    // Build config object, only including defined values to not override defaults
    const config: any = {
      firebaseConfig: firebaseConfig!,
    };

    if (firebaseApp) config.firebaseApp = firebaseApp;
    if (firebaseDatabase) config.firebaseDatabase = firebaseDatabase;
    if (basePath !== undefined) config.basePath = basePath;
    if (sessionTTL !== undefined) config.sessionTTL = sessionTTL;
    if (webrtcConfig?.debug !== undefined) config.debug = webrtcConfig.debug;

    return new FirebaseSignalingClient(config);
  }, [
    firebaseConfig,
    firebaseApp,
    firebaseDatabase,
    basePath,
    sessionTTL,
    webrtcConfig?.debug,
  ]);

  return useWebRTCConnection({
    signalingClient,
    config: webrtcConfig,
    autoCleanup,
  });
}
