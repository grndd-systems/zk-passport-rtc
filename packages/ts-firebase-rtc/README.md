# @grndd-systems/zk-proof-rtc

A pluggable TypeScript library for WebRTC communication between web and mobile applications, with built-in Firebase signaling support.

## Features

- 🔌 **Pluggable Signaling Architecture** - Abstract signaling interface with Firebase implementation included
- 🎯 **Framework-Agnostic Core** - Use with vanilla JS, React, Vue, Angular, or any framework
- ⚛️ **React Hooks** - Ready-to-use React hooks for seamless integration
- 📦 **Tree-Shakeable** - Only bundle what you use with ESM/CJS dual output
- 🔒 **Full TypeScript** - Strict typing with comprehensive type definitions
- 🔥 **Firebase Ready** - Built-in Firebase Realtime Database signaling
- 🧊 **Trickle ICE** - Efficient incremental ICE candidate exchange
- 🎨 **Type-Safe Events** - Strongly-typed event emitter for all connection events

## Installation

```bash
npm install @grndd-systems/zk-proof-rtc
```

### Peer Dependencies

Depending on your use case, you may need to install peer dependencies:

```bash
# For React hooks
npm install react

# For Firebase signaling
npm install firebase
```

## Quick Start

### React with Firebase (Recommended)

```typescript
import { useWebRTCWithFirebase, generatePeerId } from '@grndd-systems/zk-proof-rtc';

function DesktopApp() {
  const { state, createOffer, send, onMessage } = useWebRTCWithFirebase({
    firebaseConfig: {
      apiKey: 'YOUR_API_KEY',
      authDomain: 'YOUR_AUTH_DOMAIN',
      databaseURL: 'YOUR_DATABASE_URL',
      projectId: 'YOUR_PROJECT_ID',
    },
    webrtcConfig: {
      debug: true, // Enable logging
    },
  });

  useEffect(() => {
    onMessage((data) => {
      console.log('Received:', data);
    });
  }, [onMessage]);

  const handleConnect = async () => {
    const peerId = generatePeerId();
    await createOffer(peerId);

    // Show QR code or share peerId with mobile app
    console.log('Share this ID:', peerId);
  };

  return (
    <div>
      <button onClick={handleConnect} disabled={state.isConnected}>
        Create Connection
      </button>
      <p>Status: {state.state}</p>
      {state.isConnected && (
        <button onClick={() => send({ type: 'greeting', message: 'Hello!' })}>
          Send Message
        </button>
      )}
    </div>
  );
}
```

### Mobile/Answerer Side

```typescript
import { useWebRTCWithFirebase } from '@grndd-systems/zk-proof-rtc';

function MobileApp({ peerId }: { peerId: string }) {
  const { state, createAnswer, send, onMessage } = useWebRTCWithFirebase({
    firebaseConfig: { /* same config */ },
  });

  useEffect(() => {
    // Auto-connect when peerId is available
    createAnswer(peerId);
  }, [peerId, createAnswer]);

  useEffect(() => {
    onMessage((data) => {
      console.log('Received:', data);
    });
  }, [onMessage]);

  return <div>Status: {state.state}</div>;
}
```

## Usage

### Vanilla JavaScript

```typescript
import {
  WebRTCConnection,
  FirebaseSignalingClient,
} from '@grndd-systems/zk-proof-rtc/core';

// Create signaling client
const signalingClient = new FirebaseSignalingClient({
  firebaseConfig: {
    apiKey: 'YOUR_API_KEY',
    // ... other config
  },
});

// Create connection
const connection = new WebRTCConnection(signalingClient, {
  debug: true,
  iceGatheringTimeout: 3000,
});

// Listen for messages
connection.on('message', ({ data }) => {
  console.log('Received:', data);
});

// Listen for state changes
connection.on('state:change', ({ state }) => {
  console.log('Connection state:', state);
});

// Create offer (desktop)
const peerId = await connection.createOffer('peer-123');
console.log('Share this ID:', peerId);

// Send data
connection.send({ type: 'test', payload: 'Hello!' });
```

### Custom Signaling Backend

Implement the `SignalingClient` interface to use your own signaling server:

```typescript
import { SignalingClient } from '@grndd-systems/zk-proof-rtc/core';

class MyCustomSignaling extends SignalingClient {
  async initialize() {
    // Connect to your signaling server
  }

  async createOffer(peerId, offer, metadata) {
    // Upload offer to your server
  }

  async getOffer(peerId) {
    // Retrieve offer from your server
  }

  // ... implement other methods
}

// Use with WebRTCConnection
const connection = new WebRTCConnection(new MyCustomSignaling());
```

### React Hook with Custom Signaling

```typescript
import { useWebRTCConnection } from '@grndd-systems/zk-proof-rtc/react';
import { MyCustomSignaling } from './my-signaling';

function MyComponent() {
  const signalingClient = useMemo(() => new MyCustomSignaling(), []);

  const { state, createOffer, send, onMessage } = useWebRTCConnection({
    signalingClient,
    config: { debug: true },
  });

  // ... use the hook
}
```

## API Reference

### `WebRTCConnection`

Framework-agnostic WebRTC connection manager.

**Constructor:**
```typescript
new WebRTCConnection(signalingClient: SignalingClient, config?: PartialWebRTCConfig)
```

**Methods:**
- `createOffer(peerId: string, metadata?: SessionMetadata): Promise<string>` - Initialize as offerer
- `createAnswer(peerId: string): Promise<void>` - Initialize as answerer
- `send(data: any): boolean` - Send data through data channel
- `close(): Promise<void>` - Close connection and cleanup
- `getState(): ConnectionState` - Get current connection state
- `getPeerId(): string | null` - Get peer ID
- `isConnected(): boolean` - Check if connected

**Events:**
- `state:change` - Connection state changed
- `datachannel:state` - Data channel state changed
- `ice:state` - ICE connection state changed
- `ice:candidate` - ICE candidate generated
- `message` - Data received
- `error` - Error occurred
- `peer:connected` - Peer connected
- `peer:disconnected` - Peer disconnected

### `useWebRTCConnection(options)`

React hook for WebRTC connection.

**Options:**
```typescript
{
  signalingClient: SignalingClient;
  config?: PartialWebRTCConfig;
  autoCleanup?: boolean; // default: true
}
```

**Returns:**
```typescript
{
  state: UseWebRTCConnectionState;
  createOffer: (peerId: string, metadata?: SessionMetadata) => Promise<string>;
  createAnswer: (peerId: string) => Promise<void>;
  send: (data: any) => boolean;
  onMessage: (callback: (data: any) => void) => void;
  close: () => Promise<void>;
}
```

### `useWebRTCWithFirebase(options)`

Convenience hook for Firebase signaling.

**Options:**
```typescript
{
  firebaseConfig?: FirebaseOptions;
  firebaseApp?: FirebaseApp; // Use existing app
  firebaseDatabase?: Database; // Use existing database
  basePath?: string; // default: 'signals'
  sessionTTL?: number; // default: 300000 (5 minutes)
  webrtcConfig?: PartialWebRTCConfig;
  autoCleanup?: boolean; // default: true
}
```

### `FirebaseSignalingClient`

Firebase Realtime Database signaling implementation.

**Constructor:**
```typescript
new FirebaseSignalingClient(config: FirebaseSignalingConfig)
```

**Config:**
```typescript
{
  firebaseConfig: FirebaseOptions;
  firebaseApp?: FirebaseApp;
  firebaseDatabase?: Database;
  basePath?: string; // default: 'signals'
  sessionTTL?: number; // default: 300000
  debug?: boolean;
}
```

### Configuration Options

```typescript
interface WebRTCConfig {
  iceServers: RTCIceServer[]; // default: Google STUN servers
  channelName: string; // default: 'zkPassport'
  channelOptions: RTCDataChannelInit; // default: { ordered: true }
  iceGatheringTimeout: number; // default: 3000ms
  sessionTTL: number; // default: 300000ms (5 minutes)
  debug: boolean; // default: false
}
```

## Architecture

```
@grndd-systems/zk-proof-rtc
├── core/                    # Framework-agnostic core
│   ├── WebRTCConnection     # Main connection manager
│   ├── EventEmitter         # Type-safe event system
│   ├── SignalingClient      # Abstract signaling interface
│   ├── FirebaseSignalingClient  # Firebase implementation
│   └── types                # TypeScript definitions
├── react/                   # React integration
│   ├── useWebRTCConnection
│   └── useWebRTCWithFirebase
└── utils/                   # Utilities
    ├── logger
    └── generatePeerId
```

## Examples

### Complete Desktop-Mobile Flow

**Desktop (Offerer):**
```typescript
import { useWebRTCWithFirebase, generatePeerId } from '@grndd-systems/zk-proof-rtc';
import QRCode from 'qrcode';

function DesktopApp() {
  const [qrCode, setQrCode] = useState('');
  const { state, createOffer, send, onMessage } = useWebRTCWithFirebase({
    firebaseConfig: { /* ... */ },
    webrtcConfig: { debug: true },
  });

  useEffect(() => {
    onMessage((data) => {
      console.log('Received from mobile:', data);
      // Handle mobile response
    });
  }, [onMessage]);

  const handleConnect = async () => {
    const peerId = generatePeerId();
    await createOffer(peerId);

    // Generate QR code for mobile
    const qrData = JSON.stringify({ peerId, timestamp: Date.now() });
    const qrImage = await QRCode.toDataURL(qrData);
    setQrCode(qrImage);
  };

  const handleSendRequest = () => {
    send({
      type: 'proof_request',
      payload: {
        requestId: '123',
        proofType: 'age_check',
        minAge: 21,
      },
    });
  };

  return (
    <div>
      {!state.isConnected ? (
        <>
          <button onClick={handleConnect}>Generate QR Code</button>
          {qrCode && <img src={qrCode} alt="QR Code" />}
        </>
      ) : (
        <>
          <p>✅ Connected!</p>
          <button onClick={handleSendRequest}>Request Proof</button>
        </>
      )}
      <p>Status: {state.state}</p>
    </div>
  );
}
```

**Mobile (Answerer):**
```typescript
import { useWebRTCWithFirebase } from '@grndd-systems/zk-proof-rtc';

function MobileApp() {
  const [scannedData, setScannedData] = useState<{ peerId: string } | null>(null);
  const { state, createAnswer, send, onMessage } = useWebRTCWithFirebase({
    firebaseConfig: { /* ... */ },
  });

  useEffect(() => {
    if (scannedData?.peerId) {
      createAnswer(scannedData.peerId);
    }
  }, [scannedData, createAnswer]);

  useEffect(() => {
    onMessage((data) => {
      console.log('Received from desktop:', data);

      if (data.type === 'proof_request') {
        // Generate and send proof
        const proof = generateProof(data.payload);
        send({
          type: 'proof_response',
          payload: proof,
        });
      }
    });
  }, [onMessage, send]);

  return (
    <div>
      {!scannedData ? (
        <QRScanner onScan={(data) => setScannedData(JSON.parse(data))} />
      ) : (
        <p>Status: {state.state}</p>
      )}
    </div>
  );
}
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please use the [GitHub issue tracker](https://github.com/grndd-systems/zk-proof-rtc/issues).
