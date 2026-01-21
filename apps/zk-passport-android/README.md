# zk-passport-android

WebRTC library for Android applications with pluggable signaling support. Part of the @grndd-systems zk-passport ecosystem.

## Features

- 🔌 **Pluggable Signaling** - Abstract `SignalingManager` interface with Firebase implementation included
- 📱 **Android Native** - Built with Kotlin and Android SDK
- ⚛️ **Framework-Agnostic Core** - No dependency injection framework required in the library
- 🔥 **Firebase Ready** - Built-in Firebase Realtime Database signaling
- 🌐 **Protocol Compatible** - Works seamlessly with [@grndd-systems/zk-proof-rtc](https://github.com/grndd-systems/zk-proof-rtc) (TypeScript/Web)
- 🔒 **Type Safe** - Full Kotlin type safety with sealed classes for state management
- 📦 **Modular** - Separate modules for core WebRTC and Firebase signaling

## Architecture

```
zk-passport-android/
├── webrtc-core/           # Core WebRTC functionality (framework-agnostic)
│   ├── WebRTCManager      # Main connection manager
│   ├── SignalingManager   # Abstract signaling interface
│   └── models/            # Connection state, config, signaling events
└── webrtc-firebase/       # Firebase Realtime Database signaling
    └── FirebaseSignalingManager
```

## Installation

### In Your App's `settings.gradle.kts`

```kotlin
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("path/to/zk-passport-android") } // Local path for now
    }
}
```

### In Your App's `build.gradle.kts`

```kotlin
dependencies {
    // Option 1: Just Firebase signaling (includes core)
    implementation(project(":webrtc-firebase"))

    // Option 2: Core only (if using custom signaling)
    implementation(project(":webrtc-core"))
}
```

## Quick Start

### 1. Setup Firebase (if using Firebase signaling)

Add `google-services.json` to your app and apply the Google Services plugin:

```kotlin
// app/build.gradle.kts
plugins {
    id("com.google.gms.google-services")
}
```

### 2. Create WebRTC Manager

```kotlin
import com.grndd.celestials.webrtc.core.WebRTCManager
import com.grndd.celestials.webrtc.firebase.FirebaseSignalingManager
import com.grndd.celestials.webrtc.models.WebRTCConfig

class MyViewModel(
    private val context: Context
) : ViewModel() {

    // Create signaling manager
    private val signalingManager = FirebaseSignalingManager(
        databaseUrl = "https://your-project.firebaseio.com",
        basePath = "signals",
        enableDebugLogging = BuildConfig.DEBUG
    )

    // Create WebRTC manager
    private val webrtcManager = WebRTCManager(
        context = context.applicationContext,
        signalingManager = signalingManager,
        config = WebRTCConfig(
            enableDebugLogging = BuildConfig.DEBUG,
            dataChannelLabel = "MyDataChannel"
        )
    )

    // Observe connection state
    init {
        viewModelScope.launch {
            webrtcManager.connectionState.collect { state ->
                when (state) {
                    is ConnectionState.Connected -> {
                        // Handle connection established
                    }
                    is ConnectionState.Error -> {
                        // Handle error: state.message
                    }
                    else -> {
                        // Handle other states
                    }
                }
            }
        }
    }

    // Connect to desktop by scanning QR code
    fun connectToPeer(peerId: String) {
        viewModelScope.launch {
            webrtcManager.connectToPeer(peerId)
        }
    }

    // Send message to desktop
    fun sendMessage(data: String) {
        webrtcManager.sendMessage(data)
    }

    // Listen for incoming messages
    init {
        viewModelScope.launch {
            webrtcManager.receivedMessages.collect { messages ->
                messages.lastOrNull()?.let { message ->
                    // Handle received message
                }
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        viewModelScope.launch {
            webrtcManager.close()
        }
    }
}
```

### 3. With Hilt Dependency Injection (Optional)

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object WebRTCModule {

    @Provides
    @Singleton
    fun provideSignalingManager(): SignalingManager {
        return FirebaseSignalingManager(
            databaseUrl = BuildConfig.FIREBASE_DATABASE_URL,
            basePath = "signals",
            enableDebugLogging = BuildConfig.DEBUG
        )
    }

    @Provides
    @Singleton
    fun provideWebRTCManager(
        @ApplicationContext context: Context,
        signalingManager: SignalingManager
    ): WebRTCManager {
        return WebRTCManager(
            context = context,
            signalingManager = signalingManager,
            config = WebRTCConfig(enableDebugLogging = BuildConfig.DEBUG)
        )
    }
}
```

## Protocol Compatibility

This library implements the mobile (answerer) side of the WebRTC protocol used by [@grndd-systems/zk-passport-client](https://github.com/grndd-systems/zk-passport-client).

**Message Flow:**

```
Desktop (TypeScript)                Mobile (Android)
────────────────────                ────────────────

1. createOffer(peerId)
   └─> QR Code with peerId
                                   2. Scan QR Code
                                   3. connectToPeer(peerId)
                                   4. CONNECTION ESTABLISHED

                                   5. Send data →
6. ← Receive data
7. Send data →
                                   8. ← Receive data
```

## Custom Signaling Backend

Implement the `SignalingManager` interface to use your own signaling server:

```kotlin
class MyCustomSignaling(
    private val serverUrl: String
) : SignalingManager {

    override suspend fun initialize() {
        // Connect to your signaling server
    }

    override suspend fun sendAnswer(peerId: String, answer: SessionDescription): Result<Unit> {
        // Send answer to your server
    }

    override fun listenForOffer(peerId: String): Flow<SignalingEvent> = callbackFlow {
        // Listen for offers from your server
        awaitClose { /* cleanup */ }
    }

    // ... implement other methods
}
```

## API Reference

### `WebRTCManager`

Main WebRTC connection manager (answerer role).

**Constructor:**
```kotlin
WebRTCManager(
    context: Context,
    signalingManager: SignalingManager,
    config: WebRTCConfig = WebRTCConfig.DEFAULT
)
```

**Properties:**
- `connectionState: StateFlow<ConnectionState>` - Current connection state
- `receivedMessages: StateFlow<List<String>>` - Received messages from remote peer

**Methods:**
- `suspend fun connectToPeer(scannedPeerId: String)` - Connect to desktop by peer ID
- `fun sendMessage(message: String): Boolean` - Send message through data channel
- `suspend fun disconnect()` - Disconnect from peer
- `suspend fun close()` - Close and cleanup all resources

### `FirebaseSignalingManager`

Firebase Realtime Database signaling implementation.

**Constructor:**
```kotlin
FirebaseSignalingManager(
    databaseUrl: String,
    basePath: String = "signals",
    enableDebugLogging: Boolean = false
)
```

### `WebRTCConfig`

Configuration for WebRTC connection.

```kotlin
data class WebRTCConfig(
    val dataChannelLabel: String = "CelestialsDataChannel",
    val enableDebugLogging: Boolean = false,
    val iceServers: List<String> = DEFAULT_ICE_SERVERS
)
```

### `ConnectionState`

Sealed class representing connection states:
- `Disconnected` - Not connected
- `Connecting` - Attempting to connect
- `Connected` - Successfully connected
- `Error(message: String)` - Connection error occurred

## Example Usage with zk-passport-client

**Desktop (TypeScript):**
```typescript
import { CelestialsClient } from '@grndd-systems/zk-passport-client';

const client = new CelestialsClient({
  firebase: { /* config */ },
  contracts: { /* addresses */ },
  provider: ethersProvider
});

const session = await client.createProofSession({
  type: 'age_check',
  userAddress: '0x...'
});

// Show QR code with session.qrCodeUrl
```

**Mobile (Android):**
```kotlin
// Scan QR code to get peerId
val peerId = qrCodeScanner.scan() // e.g., "proof-abc123"

// Connect to desktop
webrtcManager.connectToPeer(peerId)

// Send proof data
val proofData = generateProof()
webrtcManager.sendMessage(Json.encodeToString(proofData))
```

## Requirements

- Android SDK 27 (Android 8.1) or higher
- Kotlin 1.9.25 or higher
- Firebase (for Firebase signaling)

## Dependencies

### webrtc-core
- AndroidX Core KTX
- Kotlin Coroutines
- WebRTC SDK (io.github.webrtc-sdk:android)
- Gson

### webrtc-firebase
- webrtc-core
- Firebase Auth
- Firebase Realtime Database
- Kotlin Coroutines Play Services

## License

MIT License - see [LICENSE](LICENSE) for details

## Related Projects

- [@grndd-systems/zk-proof-rtc](https://github.com/grndd-systems/zk-proof-rtc) - TypeScript WebRTC library
- [@grndd-systems/zk-passport-client](https://github.com/grndd-systems/zk-passport-client) - TypeScript client library
- [celestials-android-app](https://github.com/grndd-systems/celestials-android-app) - Reference implementation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please use the GitHub issue tracker.
