# @grndd-systems/zk-passport-client

High-level TypeScript client library for zk-passport with WebRTC and smart contract integration.

## Features

- 🔐 **Zero-Knowledge Proofs**: Registration and query proof support
- 🌐 **WebRTC Communication**: Seamless desktop-mobile connection via `@grndd-systems/zk-proof-rtc`
- 📱 **QR Code Generation**: Built-in session payload for easy mobile scanning
- ⚡ **Smart Contract Integration**: Uses ethers.js for contract interactions
- ⚛️ **React Hooks**: Optional React integration for easy UI development
- 📦 **Tree-Shakeable**: ESM/CJS dual output with zero runtime dependencies in core
- 🎯 **Type-Safe**: Full TypeScript support with strict mode

## Installation

```bash
npm install @grndd-systems/zk-passport-client @grndd-systems/zk-proof-rtc ethers
```

## Quick Start

### Vanilla TypeScript

```typescript
import { ZkPassportClient } from '@grndd-systems/zk-passport-client';
import { ethers } from 'ethers';

// Setup ethers provider
const provider = new ethers.JsonRpcProvider('https://rpc.ankr.com/eth');

// Initialize client
const client = new ZkPassportClient({
  firebase: {
    apiKey: 'your-api-key',
    authDomain: 'your-project.firebaseapp.com',
    databaseURL: 'https://your-project.firebaseio.com',
    projectId: 'your-project-id',
  },
  contracts: {
    registration: '0x...',
    queryProofExecutor: '0x...',
    stateKeeper: '0x...',
  },
  provider,
  debug: true,
});

// Create a proof session
const session = await client.createProofSession({
  type: 'age_check',
  userAddress: '0x1234567890123456789012345678901234567890',
  conditions: {
    minAge: 18,
  },
});

// Display QR code to user
console.log('Scan this QR code:', session.qrCodeUrl);

// Wait for mobile app to send proof
const transaction = await session.waitForTransaction();

// Sign and send transaction
const signer = new ethers.Wallet(privateKey, provider);
const tx = await signer.sendTransaction(transaction);
await tx.wait();

console.log('Transaction confirmed:', tx.hash);

// Cleanup
session.close();
client.close();
```

### React Integration

```typescript
import { useZkPassportClient } from '@grndd-systems/zk-passport-client/react';
import { ethers } from 'ethers';
import QRCode from 'react-qr-code';

function PassportVerification() {
  const provider = new ethers.BrowserProvider(window.ethereum);

  const { sessionState, createSession, waitForTransaction } = useZkPassportClient({
    firebase: {
      apiKey: 'your-api-key',
      authDomain: 'your-project.firebaseapp.com',
      databaseURL: 'https://your-project.firebaseio.com',
      projectId: 'your-project-id',
    },
    contracts: {
      registration: '0x...',
      queryProofExecutor: '0x...',
      stateKeeper: '0x...',
    },
    provider,
  });

  const handleVerify = async () => {
    // Create session
    await createSession({
      type: 'age_check',
      userAddress: await signer.getAddress(),
      conditions: { minAge: 18 },
    });

    // Wait for proof from mobile
    const tx = await waitForTransaction();

    // Send transaction
    if (tx) {
      const signer = await provider.getSigner();
      const result = await signer.sendTransaction(tx);
      await result.wait();
      console.log('Verified!', result.hash);
    }
  };

  return (
    <div>
      <button onClick={handleVerify}>Start Verification</button>

      {sessionState.qrCodeUrl && (
        <div>
          <h3>Scan with mobile app:</h3>
          <QRCode value={sessionState.qrCodeUrl} />
        </div>
      )}

      <div>
        <p>State: {sessionState.state}</p>
        {sessionState.isConnected && <p>✅ Mobile connected</p>}
        {sessionState.isReady && <p>✅ Transaction ready</p>}
        {sessionState.error && <p>❌ Error: {sessionState.error.message}</p>}
      </div>
    </div>
  );
}
```

## API Reference

### `ZkPassportClient`

Main client class for creating proof sessions.

#### Constructor

```typescript
new ZkPassportClient(config: ZkPassportClientConfig)
```

**Config Options:**
- `firebase`: Firebase configuration for WebRTC signaling
- `contracts`: Smart contract addresses
  - `registration`: Registration contract address
  - `queryProofExecutor`: Query proof executor contract address
  - `stateKeeper`: State keeper contract address
- `provider`: Ethers.js provider for reading contract state
- `debug?`: Enable debug logging (default: `false`)

#### Methods

##### `createProofSession(options: ProofSessionOptions): Promise<ProofSession>`

Create a new proof session.

**Options:**
- `type`: Proof type (`'registration'` | `'age_check'` | `'disclosure'`)
- `userAddress`: User's wallet address
- `conditions?`: Additional proof conditions
  - `minAge?`: Minimum age requirement
  - `allowedCountries?`: Array of allowed country codes
  - `fields?`: Array of fields to disclose

**Returns:** `ProofSession` instance

##### `close(): void`

Close all active sessions and cleanup resources.

### `ProofSession`

Represents a single proof session.

#### Properties

- `state`: Current session state
- `peerId`: Peer ID for QR code
- `qrCodeUrl`: Data URL containing session payload for QR code
- `error`: Last error if any

#### Methods

##### `waitForTransaction(): Promise<UnsignedTransaction>`

Wait for mobile app to send proof data and return ready-to-sign transaction.

##### `close(): void`

Close the session and cleanup resources.

#### Events

- `state:change`: Session state changed
- `mobile:connected`: Mobile device connected
- `proof:received`: Proof data received
- `transaction:ready`: Transaction ready to sign
- `error`: Error occurred

### React Hook: `useZkPassportClient`

React hook wrapper for `ZkPassportClient`.

```typescript
function useZkPassportClient(options: UseZkPassportClientOptions): UseZkPassportClientReturn
```

**Options:** Same as `ZkPassportClientConfig` plus:
- `autoCleanup?`: Auto-cleanup client on unmount (default: `true`)

**Returns:**
- `sessionState`: Current session state
  - `session`: Active session instance
  - `state`: Session state
  - `qrCodeUrl`: QR code URL
  - `peerId`: Peer ID
  - `error`: Error if any
  - `transaction`: Ready transaction
  - `isConnected`: Mobile connected
  - `isReady`: Transaction ready
- `createSession(options)`: Create new session
- `waitForTransaction()`: Wait for transaction
- `closeSession()`: Close current session
- `closeClient()`: Close entire client

## Proof Types

### Registration

Register a new passport on-chain.

```typescript
await client.createProofSession({
  type: 'registration',
  userAddress: '0x...',
});
```

### Age Check

Verify user's age without revealing exact birth date.

```typescript
await client.createProofSession({
  type: 'age_check',
  userAddress: '0x...',
  conditions: {
    minAge: 18,
  },
});
```

### Disclosure

Reveal specific passport fields.

```typescript
await client.createProofSession({
  type: 'disclosure',
  userAddress: '0x...',
  conditions: {
    fields: ['citizenship', 'birthDate'],
  },
});
```

## Architecture

```
┌─────────────────┐
│   Your App      │
│  (Web/React)    │
└────────┬────────┘
         │
         ├─ ZkPassportClient
         │  └─ ProofSession
         │     ├─ WebRTCConnection (@grndd-systems/zk-proof-rtc)
         │     │  └─ FirebaseSignalingClient
         │     └─ ContractClient (ethers.js)
         │
         ├─ Firebase Realtime DB (WebRTC signaling)
         │
         └─ Smart Contracts (Ethereum)
            ├─ Registration
            ├─ QueryProofExecutor
            └─ StateKeeper
```

## Session Flow

1. **Initialize**: Create client with Firebase and contract config
2. **Create Session**: Call `createProofSession()` with proof type
3. **Display QR Code**: Show `session.qrCodeUrl` to user
4. **Mobile Scans**: User scans QR with mobile app
5. **WebRTC Connect**: Desktop and mobile establish P2P connection
6. **Proof Transfer**: Mobile generates and sends proof via WebRTC
7. **Transaction Build**: Client builds transaction from proof data
8. **Sign & Send**: Your app signs and submits transaction

## Error Handling

```typescript
try {
  const session = await client.createProofSession({
    type: 'age_check',
    userAddress: address,
  });

  session.on('error', ({ error }) => {
    console.error('Session error:', error);
  });

  const tx = await session.waitForTransaction();
  // ... send transaction
} catch (error) {
  console.error('Failed to create session:', error);
}
```

## Debug Mode

Enable debug logging to troubleshoot issues:

```typescript
const client = new ZkPassportClient({
  // ... config
  debug: true,
});
```

This will log:
- Client initialization
- Session creation
- WebRTC connection events
- Proof data reception
- Transaction building

## License

MIT

## Related Packages

- [@grndd-systems/zk-proof-rtc](https://github.com/grndd-systems/zk-proof-rtc) - WebRTC communication library
