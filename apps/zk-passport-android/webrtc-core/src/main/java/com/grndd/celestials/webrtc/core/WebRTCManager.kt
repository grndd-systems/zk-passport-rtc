package com.grndd.celestials.webrtc.core

import android.content.Context
import android.util.Log
import com.grndd.celestials.webrtc.models.ConnectionState
import com.grndd.celestials.webrtc.models.IceCandidate
import com.grndd.celestials.webrtc.models.SessionDescription
import com.grndd.celestials.webrtc.models.SignalingEvent
import com.grndd.celestials.webrtc.models.WebRTCConfig
import com.grndd.celestials.webrtc.signaling.SignalingManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.webrtc.DataChannel
import org.webrtc.IceCandidate as WebRtcIceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription as WebRtcSessionDescription

/**
 * Framework-agnostic WebRTC connection manager for mobile devices
 *
 * Manages WebRTC peer connections for answerer role (Mobile app receives offer from Desktop)
 * Compatible with @grndd-systems/zk-proof-rtc TypeScript library
 *
 * Flow: Desktop creates offer → Mobile scans QR → Mobile answers → Connection established
 *
 * Example:
 * ```kotlin
 * val signalingManager = FirebaseSignalingManager(...)
 * val webrtcManager = WebRTCManager(
 *     context = applicationContext,
 *     signalingManager = signalingManager,
 *     config = WebRTCConfig(enableDebugLogging = true)
 * )
 *
 * // Connect to desktop by scanning QR code with peerId
 * webrtcManager.connectToPeer(scannedPeerId)
 *
 * // Listen for connection state
 * webrtcManager.connectionState.collect { state ->
 *     when (state) {
 *         is ConnectionState.Connected -> // handle connection
 *         is ConnectionState.Error -> // handle error
 *     }
 * }
 *
 * // Send data
 * webrtcManager.sendMessage(jsonData)
 * ```
 *
 * @param context Android application context
 * @param signalingManager Signaling implementation (Firebase, WebSocket, etc.)
 * @param config WebRTC configuration
 */
class WebRTCManager(
    private val context: Context,
    private val signalingManager: SignalingManager,
    private val config: WebRTCConfig = WebRTCConfig.DEFAULT
) {
    companion object {
        private const val TAG = "WebRTCManager"
    }

    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var dataChannel: DataChannel? = null
    private var remotePeerId: String? = null

    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _receivedMessages = MutableStateFlow<List<String>>(emptyList())
    val receivedMessages: StateFlow<List<String>> = _receivedMessages.asStateFlow()

    init {
        initializePeerConnectionFactory()
    }

    private fun initializePeerConnectionFactory() {
        // Initialize WebRTC
        val options = PeerConnectionFactory.InitializationOptions.builder(context)
            .setEnableInternalTracer(config.enableDebugLogging)
            .createInitializationOptions()
        PeerConnectionFactory.initialize(options)

        // Create PeerConnectionFactory
        peerConnectionFactory = PeerConnectionFactory.builder()
            .createPeerConnectionFactory()

        log("PeerConnectionFactory initialized")
    }

    /**
     * Mobile connects to Desktop by scanning QR code with peerId
     *
     * @param scannedPeerId The peer ID from Desktop QR code
     */
    suspend fun connectToPeer(scannedPeerId: String) {
        try {
            log("=== STARTING CONNECTION to Desktop peer: $scannedPeerId ===")
            _connectionState.value = ConnectionState.Connecting

            remotePeerId = scannedPeerId

            // Initialize signaling
            signalingManager.initialize()

            // Create peer connection
            log("Step 1: Creating peer connection...")
            createPeerConnection()
            log("✓ Peer connection created")

            // Listen for offer from Desktop
            log("Step 2: Starting to listen for offer...")
            listenForOffer(scannedPeerId)

            // Listen for ICE candidates from Desktop
            log("Step 3: Starting to listen for ICE candidates...")
            listenForIceCandidates(scannedPeerId)

            log("✓ All listeners started, waiting for offer from Desktop...")

        } catch (e: Exception) {
            Log.e(TAG, "✗ Failed to connect to peer: ${e.message}", e)
            _connectionState.value = ConnectionState.Error(e.message ?: "Connection failed")
        }
    }

    private fun createPeerConnection() {
        val iceServers = config.iceServers.map { stunUrl ->
            PeerConnection.IceServer.builder(stunUrl).createIceServer()
        }

        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        }

        peerConnection = peerConnectionFactory?.createPeerConnection(
            rtcConfig,
            object : PeerConnection.Observer {
                override fun onIceCandidate(candidate: WebRtcIceCandidate) {
                    log("→ ICE candidate generated: sdpMid=${candidate.sdpMid}, sdpMLineIndex=${candidate.sdpMLineIndex}")
                    remotePeerId?.let { peerId ->
                        coroutineScope.launch {
                            val iceCandidate = IceCandidate(
                                sdp = candidate.sdp,
                                sdpMLineIndex = candidate.sdpMLineIndex,
                                sdpMid = candidate.sdpMid
                            )
                            val result = signalingManager.sendIceCandidate(peerId, iceCandidate)
                            if (result.isSuccess) {
                                log("✓ ICE candidate sent successfully")
                            } else {
                                Log.e(TAG, "✗ Failed to send ICE candidate: ${result.exceptionOrNull()?.message}")
                            }
                        }
                    } ?: run {
                        Log.e(TAG, "✗ Cannot send ICE candidate: remotePeerId is null!")
                    }
                }

                override fun onDataChannel(dc: DataChannel) {
                    log("← Data channel received from Desktop (label: ${dc.label()})")
                    setupDataChannel(dc)
                }

                override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState) {
                    log("⚡ ICE connection state changed: $newState")
                    when (newState) {
                        PeerConnection.IceConnectionState.CONNECTED -> {
                            log("✓ ICE CONNECTION ESTABLISHED!")
                            _connectionState.value = ConnectionState.Connected
                        }
                        PeerConnection.IceConnectionState.FAILED -> {
                            Log.e(TAG, "✗ ICE CONNECTION FAILED")
                            _connectionState.value = ConnectionState.Disconnected
                        }
                        PeerConnection.IceConnectionState.DISCONNECTED -> {
                            Log.w(TAG, "⚠ ICE CONNECTION DISCONNECTED")
                            _connectionState.value = ConnectionState.Disconnected
                        }
                        else -> {
                            log("ICE state: $newState")
                        }
                    }
                }

                override fun onSignalingChange(newState: PeerConnection.SignalingState) {
                    log("📡 Signaling state changed: $newState")
                }

                override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                override fun onIceGatheringChange(newState: PeerConnection.IceGatheringState) {}
                override fun onIceCandidatesRemoved(candidates: Array<out WebRtcIceCandidate>?) {}
                override fun onAddStream(stream: org.webrtc.MediaStream) {}
                override fun onRemoveStream(stream: org.webrtc.MediaStream) {}
                override fun onRenegotiationNeeded() {}
                override fun onAddTrack(receiver: org.webrtc.RtpReceiver, streams: Array<out org.webrtc.MediaStream>) {}
            }
        )

        log("Peer connection created")
    }

    private fun setupDataChannel(dc: DataChannel) {
        dataChannel = dc
        dc.registerObserver(object : DataChannel.Observer {
            override fun onBufferedAmountChange(amount: Long) {}

            override fun onStateChange() {
                log("Data channel state: ${dc.state()}")
                if (dc.state() == DataChannel.State.OPEN) {
                    _connectionState.value = ConnectionState.Connected
                }
            }

            override fun onMessage(buffer: DataChannel.Buffer) {
                val data = buffer.data
                val bytes = ByteArray(data.remaining())
                data.get(bytes)
                val message = String(bytes, Charsets.UTF_8)

                log("Received message from Desktop: ${message.take(100)}...")
                _receivedMessages.value = _receivedMessages.value + message
            }
        })
    }

    private fun listenForOffer(peerId: String) {
        coroutineScope.launch {
            signalingManager.listenForOffer(peerId).collect { event ->
                when (event) {
                    is SignalingEvent.OfferReceived -> {
                        log("Offer received from Desktop, creating answer...")
                        handleOfferAndCreateAnswer(event.offer)
                    }
                    is SignalingEvent.Error -> {
                        Log.e(TAG, "Signaling error: ${event.message}")
                        _connectionState.value = ConnectionState.Error(event.message)
                    }
                    else -> {}
                }
            }
        }
    }

    private fun listenForIceCandidates(peerId: String) {
        coroutineScope.launch {
            signalingManager.listenForIceCandidates(peerId).collect { event ->
                when (event) {
                    is SignalingEvent.IceCandidateReceived -> {
                        handleIceCandidate(event.candidate)
                    }
                    else -> {}
                }
            }
        }
    }

    private fun handleOfferAndCreateAnswer(offer: SessionDescription) {
        log("→ Processing received offer (sdp length: ${offer.sdp.length})")
        val sdp = WebRtcSessionDescription(
            WebRtcSessionDescription.Type.OFFER,
            offer.sdp
        )

        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onSetSuccess() {
                log("✓ Remote description (offer) set successfully")
                log("→ Now creating answer...")
                createAnswer()
            }

            override fun onSetFailure(error: String) {
                Log.e(TAG, "✗ Failed to set remote description: $error")
                _connectionState.value = ConnectionState.Error("Failed to set remote description: $error")
            }

            override fun onCreateSuccess(p0: WebRtcSessionDescription?) {}
            override fun onCreateFailure(p0: String?) {}
        }, sdp)
    }

    private fun createAnswer() {
        log("Creating answer with constraints...")
        val mediaConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "false"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
        }

        peerConnection?.createAnswer(object : SdpObserver {
            override fun onCreateSuccess(sdp: WebRtcSessionDescription) {
                log("✓ Answer created successfully (type: ${sdp.type})")
                peerConnection?.setLocalDescription(object : SdpObserver {
                    override fun onSetSuccess() {
                        log("✓ Local description (answer) set successfully")
                        log("→ Sending answer to Desktop...")
                        remotePeerId?.let { peerId ->
                            coroutineScope.launch {
                                val answer = SessionDescription(
                                    type = sdp.type.canonicalForm(),
                                    sdp = sdp.description
                                )
                                signalingManager.sendAnswer(peerId, answer)
                            }
                        }
                    }

                    override fun onSetFailure(error: String) {
                        Log.e(TAG, "✗ Failed to set local description: $error")
                        _connectionState.value = ConnectionState.Error("Failed to set local description: $error")
                    }

                    override fun onCreateSuccess(p0: WebRtcSessionDescription?) {}
                    override fun onCreateFailure(p0: String?) {}
                }, sdp)
            }

            override fun onSetSuccess() {}
            override fun onCreateFailure(error: String) {
                Log.e(TAG, "✗ Failed to create answer: $error")
                _connectionState.value = ConnectionState.Error("Failed to create answer: $error")
            }

            override fun onSetFailure(error: String) {}
        }, mediaConstraints)
    }

    private fun handleIceCandidate(candidate: IceCandidate) {
        val iceCandidate = WebRtcIceCandidate(
            candidate.sdpMid,
            candidate.sdpMLineIndex,
            candidate.sdp
        )

        peerConnection?.addIceCandidate(iceCandidate)
        log("ICE candidate added from Desktop")
    }

    /**
     * Sends a message through the data channel
     *
     * @param message Message to send to Desktop
     * @return true if sent successfully, false otherwise
     */
    fun sendMessage(message: String): Boolean {
        return try {
            if (dataChannel?.state() == DataChannel.State.OPEN) {
                val buffer = DataChannel.Buffer(
                    java.nio.ByteBuffer.wrap(message.toByteArray(Charsets.UTF_8)),
                    false
                )
                dataChannel?.send(buffer)
                log("Message sent to Desktop: ${message.take(100)}...")
                true
            } else {
                Log.w(TAG, "Data channel not open, state: ${dataChannel?.state()}")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send message", e)
            false
        }
    }

    /**
     * Disconnects from Desktop and cleans up resources
     */
    suspend fun disconnect() {
        dataChannel?.close()
        peerConnection?.close()

        remotePeerId?.let { peerId ->
            signalingManager.cleanupPeerSession(peerId)
        }

        _connectionState.value = ConnectionState.Disconnected
        log("Disconnected from Desktop")
    }

    /**
     * Close and cleanup all resources
     */
    suspend fun close() {
        disconnect()
        signalingManager.close()
    }

    private fun log(message: String) {
        if (config.enableDebugLogging) {
            Log.d(TAG, message)
        }
    }
}
