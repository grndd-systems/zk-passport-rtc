package com.grndd.celestials.webrtc.signaling

import com.grndd.celestials.webrtc.models.IceCandidate
import com.grndd.celestials.webrtc.models.SessionDescription
import com.grndd.celestials.webrtc.models.SignalingEvent
import kotlinx.coroutines.flow.Flow

/**
 * Abstract signaling interface for WebRTC
 *
 * Implement this interface to create custom signaling backends
 * (Firebase, WebSocket, HTTP polling, etc.)
 *
 * Compatible with @grndd-systems/zk-proof-rtc SignalingClient interface
 *
 * @see com.grndd.celestials.webrtc.firebase.FirebaseSignalingManager for Firebase implementation
 */
interface SignalingManager {

    /**
     * Initialize the signaling client (connect to server, authenticate, etc.)
     */
    suspend fun initialize()

    /**
     * Send answer to the offerer
     * Mobile (answerer) sends this after receiving offer from Desktop (offerer)
     *
     * @param peerId Unique peer identifier
     * @param answer Answer session description
     * @return Result indicating success or failure
     */
    suspend fun sendAnswer(peerId: String, answer: SessionDescription): Result<Unit>

    /**
     * Send ICE candidate to remote peer
     *
     * @param peerId Unique peer identifier
     * @param candidate ICE candidate to send
     * @return Result indicating success or failure
     */
    suspend fun sendIceCandidate(peerId: String, candidate: IceCandidate): Result<Unit>

    /**
     * Listen for offer from remote peer
     * Desktop (offerer) creates offer, Mobile (answerer) listens for it
     *
     * @param peerId Unique peer identifier
     * @return Flow of signaling events
     */
    fun listenForOffer(peerId: String): Flow<SignalingEvent>

    /**
     * Listen for ICE candidates from remote peer
     *
     * @param peerId Unique peer identifier
     * @return Flow of signaling events
     */
    fun listenForIceCandidates(peerId: String): Flow<SignalingEvent>

    /**
     * Cleanup peer session data
     *
     * @param peerId Unique peer identifier
     * @return Result indicating success or failure
     */
    suspend fun cleanupPeerSession(peerId: String): Result<Unit>

    /**
     * Close the signaling client and cleanup resources
     */
    suspend fun close()
}
