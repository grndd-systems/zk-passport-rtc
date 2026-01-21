import { useEffect, useRef, useState, useCallback } from 'react';
import { WebRTCConnection } from '../core/WebRTCConnection';
import type { SignalingClient } from '../core/signaling/SignalingClient';
import type {
  ConnectionState,
  PartialWebRTCConfig,
  SessionMetadata,
} from '../core/types';

/**
 * Options for useWebRTCConnection hook
 */
export interface UseWebRTCConnectionOptions {
  /** Signaling client instance */
  signalingClient: SignalingClient;
  /** Optional WebRTC configuration overrides */
  config?: PartialWebRTCConfig;
  /** Automatically cleanup on unmount (default: true) */
  autoCleanup?: boolean;
}

/**
 * WebRTC connection state for React
 */
export interface UseWebRTCConnectionState {
  /** Current connection state */
  state: ConnectionState;
  /** Peer ID (null if not initialized) */
  peerId: string | null;
  /** Error if any occurred */
  error: Error | null;
  /** True if connection is established */
  isConnected: boolean;
}

/**
 * Return value from useWebRTCConnection hook
 */
export interface UseWebRTCConnectionResult {
  /** Current connection state */
  state: UseWebRTCConnectionState;
  /** Create offer (offerer role) */
  createOffer: (peerId: string, metadata?: SessionMetadata) => Promise<string>;
  /** Create answer (answerer role) */
  createAnswer: (peerId: string) => Promise<void>;
  /** Send data through data channel */
  send: (data: any) => boolean;
  /** Register callback for received messages */
  onMessage: (callback: (data: any) => void) => void;
  /** Close connection manually */
  close: () => Promise<void>;
}

/**
 * React hook for WebRTC connection
 *
 * This hook wraps the WebRTCConnection class and provides React state management.
 * It automatically handles cleanup on component unmount.
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const signalingClient = useMemo(() =>
 *     new FirebaseSignalingClient({ firebaseConfig }),
 *     []
 *   );
 *
 *   const { state, createOffer, send, onMessage } = useWebRTCConnection({
 *     signalingClient,
 *     config: { debug: true },
 *   });
 *
 *   useEffect(() => {
 *     onMessage((data) => {
 *       console.log('Received:', data);
 *     });
 *   }, [onMessage]);
 *
 *   const handleCreateOffer = async () => {
 *     const peerId = await createOffer('peer-123');
 *     console.log('Share this ID:', peerId);
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleCreateOffer}>Create Offer</button>
 *       <p>Status: {state.state}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useWebRTCConnection(
  options: UseWebRTCConnectionOptions
): UseWebRTCConnectionResult {
  const { signalingClient, config, autoCleanup = true } = options;

  const [state, setState] = useState<UseWebRTCConnectionState>({
    state: 'idle',
    peerId: null,
    error: null,
    isConnected: false,
  });

  const connectionRef = useRef<WebRTCConnection | null>(null);
  const messageCallbackRef = useRef<((data: any) => void) | null>(null);
  const isMountedRef = useRef(true);
  const initializedRef = useRef(false);

  // Initialize connection only once
  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (initializedRef.current) return;
    initializedRef.current = true;

    const connection = new WebRTCConnection(signalingClient, config);
    connectionRef.current = connection;

    // Setup event listeners
    connection.on('state:change', ({ state: connState }) => {
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          state: connState,
          isConnected: connState === 'connected',
        }));
      }
    });

    connection.on('error', ({ error }) => {
      if (isMountedRef.current) {
        setState((prev) => ({ ...prev, error }));
      }
    });

    connection.on('message', ({ data }) => {
      if (messageCallbackRef.current) {
        messageCallbackRef.current(data);
      }
    });

    connection.on('peer:connected', ({ peerId }) => {
      if (isMountedRef.current) {
        setState((prev) => ({ ...prev, peerId }));
      }
    });

    return () => {
      isMountedRef.current = false;
      if (autoCleanup) {
        connection.close().catch(console.error);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - initialize only once

  const createOffer = useCallback(
    async (peerId: string, metadata?: SessionMetadata): Promise<string> => {
      if (!connectionRef.current) {
        throw new Error('Connection not initialized');
      }
      const resultPeerId = await connectionRef.current.createOffer(
        peerId,
        metadata
      );
      setState((prev) => ({ ...prev, peerId: resultPeerId }));
      return resultPeerId;
    },
    []
  );

  const createAnswer = useCallback(async (peerId: string): Promise<void> => {
    if (!connectionRef.current) {
      throw new Error('Connection not initialized');
    }
    await connectionRef.current.createAnswer(peerId);
    setState((prev) => ({ ...prev, peerId }));
  }, []);

  const send = useCallback((data: any): boolean => {
    if (!connectionRef.current) {
      return false;
    }
    return connectionRef.current.send(data);
  }, []);

  const onMessage = useCallback((callback: (data: any) => void) => {
    messageCallbackRef.current = callback;
  }, []);

  const close = useCallback(async (): Promise<void> => {
    if (connectionRef.current) {
      await connectionRef.current.close();
    }
  }, []);

  return {
    state,
    createOffer,
    createAnswer,
    send,
    onMessage,
    close,
  };
}
