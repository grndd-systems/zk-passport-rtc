import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Initialize Firebase app and database once
export const firebaseApp = initializeApp(firebaseConfig)
export const firebaseDatabase = getDatabase(firebaseApp)

export const contractAddresses = {
  registration: import.meta.env.VITE_REGISTRATION2_ADDRESS as `0x${string}`,
  queryProofExecutor: import.meta.env.VITE_QUERY_PROOF_EXECUTOR_ADDRESS as `0x${string}`,
  stateKeeper: import.meta.env.VITE_STATE_KEEPER_ADDRESS as `0x${string}`,
}

export const rpcUrl = import.meta.env.VITE_RPC_URL || 'http://localhost:8545'
export const chainId = parseInt(import.meta.env.VITE_CHAIN_ID || '31337', 10)
