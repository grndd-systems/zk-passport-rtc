# zk-passport-rtc

Zero-knowledge passport verification with WebRTC. Desktop-mobile P2P communication for privacy-preserving identity proofs on blockchain.

## Packages

| Package | Description |
|---------|-------------|
| [@grndd-systems/ts-firebase-rtc](./packages/ts-firebase-rtc) | WebRTC library with pluggable signaling (Firebase included) |
| [@grndd-systems/zk-passport-client](./packages/zk-passport-client) | High-level client for zk-passport verification |
| [zk-passport-android](./apps/zk-passport-android) | Android WebRTC library (Kotlin) |

## How It Works

```
Desktop (Web)                         Mobile (Android)
─────────────                         ────────────────
1. Create proof session
2. Generate QR code ───────────────> 3. Scan QR code
4. WebRTC handshake <──────────────> 5. WebRTC handshake
6. P2P connection established
                                      7. Generate ZK proof
8. Receive proof <─────────────────── 9. Send proof via WebRTC
10. Build & submit transaction
```

## Quick Start

```bash
pnpm install
pnpm build
```

### Use in your project

```bash
# WebRTC only
pnpm add @grndd-systems/ts-firebase-rtc

# Full client with contract integration
pnpm add @grndd-systems/zk-passport-client @grndd-systems/ts-firebase-rtc ethers
```

## Development

```bash
# Build all packages
pnpm build

# Watch mode
pnpm dev

# Type check
pnpm typecheck

# Run tests
pnpm test
```

## Structure

```
zk-passport-rtc/
├── packages/
│   ├── ts-firebase-rtc/       # Core WebRTC + Firebase signaling
│   └── zk-passport-client/    # ZK passport client library
├── apps/
│   └── zk-passport-android/   # Android WebRTC library
├── package.json
└── pnpm-workspace.yaml
```

## License

MIT
