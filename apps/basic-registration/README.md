# Basic Registration Example

Minimal example showing ZK passport registration with QR code and WebRTC connection.

## Setup

1. Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Run the example:

**Development mode** (with browser emulator):
```bash
npm run dev
```

**Production mode** (with mobile app):
```bash
npm run prod
```

4. Scan the QR code with the mobile app (or emulator) to complete registration.

## Available Scripts

- `npm run dev` - Development server with emulator QR codes
- `npm run prod` - Production mode with mobile app deep links (`zkpassport://`)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run start` - Build and serve on network

## QR Code Formats

**Development mode** (`npm run dev`):
```
http://localhost:5174/public/emulator-firebase.html#base64({peerId, type})
```
Opens browser-based emulator for testing without mobile device.

**Production mode** (`npm run prod`):
```
zkpassport://connect?peerId={peerId}&type=registration
```
Opens native mobile app (ZK-Celestials Android app).

## What it does

1. Displays a QR code with WebRTC connection params (peerId)
2. Mobile app scans and connects via Firebase Realtime Database signaling
3. Desktop receives passport keys, fetches contract params from blockchain
4. Sends query proof params back to mobile for proof generation
5. Mobile generates ZK proof and sends registration data back
6. Desktop can sign and send registration transaction to blockchain

## Files

- `src/App.tsx` - Main component with QR code and WebRTC handling
- `src/config.ts` - Firebase and contract configuration
- `.env.example` - Environment variables template
- `.env.development` - Dev mode config (uses emulator)
- `.env.production` - Prod mode config (uses mobile deep links)
