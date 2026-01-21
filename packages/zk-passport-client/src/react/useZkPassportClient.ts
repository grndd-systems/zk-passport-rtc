import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  ZkPassportClientConfig,
  ProofSessionOptions,
  SessionState,
  UnsignedTransaction,
} from '../types';
import { ZkPassportClient } from '../core/ZkPassportClient';
import type { ProofSession } from '../core/ProofSession';

/**
 * Hook options
 */
export interface UseZkPassportClientOptions extends ZkPassportClientConfig {
  /**
   * Auto-cleanup client on unmount
   * @default true
   */
  autoCleanup?: boolean;
}

/**
 * Session state for React
 */
export interface SessionHookState {
  session: ProofSession | null;
  state: SessionState;
  qrCodeUrl: string | null;
  peerId: string | null;
  error: Error | null;
  transaction: UnsignedTransaction | null;
  isConnected: boolean;
  isReady: boolean;
}

/**
 * Hook return value
 */
export interface UseZkPassportClientReturn {
  /**
   * Current session state
   */
  sessionState: SessionHookState;

  /**
   * Create a new proof session
   */
  createSession: (options: ProofSessionOptions) => Promise<ProofSession>;

  /**
   * Wait for current session's transaction
   */
  waitForTransaction: () => Promise<UnsignedTransaction | null>;

  /**
   * Close current session
   */
  closeSession: () => void;

  /**
   * Close the entire client
   */
  closeClient: () => void;
}

/**
 * React hook for zk-passport client
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { sessionState, createSession, waitForTransaction } = useZkPassportClient({
 *     firebase: { ... },
 *     contracts: { ... },
 *     provider: ethersProvider
 *   });
 *
 *   const handleCreateSession = async () => {
 *     const session = await createSession({
 *       type: 'age_check',
 *       userAddress: address
 *     });
 *
 *     // QR code is available immediately
 *     console.log(session.qrCodeUrl);
 *
 *     // Wait for transaction
 *     const tx = await waitForTransaction();
 *     if (tx) {
 *       await signer.sendTransaction(tx);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       {sessionState.qrCodeUrl && <QRCode value={sessionState.qrCodeUrl} />}
 *       <button onClick={handleCreateSession}>Start Verification</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useZkPassportClient(
  options: UseZkPassportClientOptions
): UseZkPassportClientReturn {
  const { autoCleanup = true, ...clientConfig } = options;

  // Client instance (stable reference)
  const clientRef = useRef<ZkPassportClient | null>(null);
  const initializedRef = useRef(false);
  const isMountedRef = useRef(true);

  // Current session
  const [currentSession, setCurrentSession] = useState<ProofSession | null>(null);

  // Session state
  const [sessionState, setSessionState] = useState<SessionHookState>({
    session: null,
    state: 'idle',
    qrCodeUrl: null,
    peerId: null,
    error: null,
    transaction: null,
    isConnected: false,
    isReady: false,
  });

  // Initialize client
  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Create client
    clientRef.current = new ZkPassportClient(clientConfig);

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (autoCleanup && clientRef.current) {
        clientRef.current.close();
      }
    };
  }, []);

  // Setup session event listeners
  useEffect(() => {
    if (!currentSession) return;

    const unsubscribers: Array<() => void> = [];

    // State changes
    unsubscribers.push(
      currentSession.on('state:change', ({ state }) => {
        if (!isMountedRef.current) return;

        setSessionState((prev) => ({
          ...prev,
          state,
          isConnected: state === 'mobile_connected' || state === 'proof_received',
          isReady: state === 'transaction_ready',
        }));
      })
    );

    // Mobile connected
    unsubscribers.push(
      currentSession.on('mobile:connected', ({ peerId }) => {
        if (!isMountedRef.current) return;

        setSessionState((prev) => ({
          ...prev,
          peerId,
        }));
      })
    );

    // Transaction ready
    unsubscribers.push(
      currentSession.on('transaction:ready', ({ transaction }) => {
        if (!isMountedRef.current) return;

        setSessionState((prev) => ({
          ...prev,
          transaction,
        }));
      })
    );

    // Errors
    unsubscribers.push(
      currentSession.on('error', ({ error }) => {
        if (!isMountedRef.current) return;

        setSessionState((prev) => ({
          ...prev,
          error,
        }));
      })
    );

    // Update initial state
    setSessionState({
      session: currentSession,
      state: currentSession.state,
      qrCodeUrl: currentSession.qrCodeUrl,
      peerId: currentSession.peerId,
      error: currentSession.error,
      transaction: null,
      isConnected: false,
      isReady: false,
    });

    // Cleanup listeners
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [currentSession]);

  /**
   * Create a new session
   */
  const createSession = useCallback(
    async (sessionOptions: ProofSessionOptions): Promise<ProofSession> => {
      if (!clientRef.current) {
        throw new Error('Client not initialized');
      }

      // Close existing session
      if (currentSession) {
        currentSession.close();
      }

      // Create new session
      const session = await clientRef.current.createProofSession(sessionOptions);
      setCurrentSession(session);

      return session;
    },
    [currentSession]
  );

  /**
   * Wait for transaction from current session
   */
  const waitForTransaction = useCallback(async (): Promise<UnsignedTransaction | null> => {
    if (!currentSession) {
      throw new Error('No active session');
    }

    return await currentSession.waitForTransaction();
  }, [currentSession]);

  /**
   * Close current session
   */
  const closeSession = useCallback(() => {
    if (currentSession) {
      currentSession.close();
      setCurrentSession(null);
    }
  }, [currentSession]);

  /**
   * Close entire client
   */
  const closeClient = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.close();
      setCurrentSession(null);
    }
  }, []);

  return {
    sessionState,
    createSession,
    waitForTransaction,
    closeSession,
    closeClient,
  };
}
