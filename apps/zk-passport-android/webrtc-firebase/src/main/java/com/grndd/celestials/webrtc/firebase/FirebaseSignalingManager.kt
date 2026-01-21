package com.grndd.celestials.webrtc.firebase

import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import com.grndd.celestials.webrtc.models.IceCandidate
import com.grndd.celestials.webrtc.models.SessionDescription
import com.grndd.celestials.webrtc.models.SignalingEvent
import com.grndd.celestials.webrtc.signaling.SignalingManager
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Firebase Realtime Database signaling implementation
 *
 * Compatible with @grndd-systems/zk-proof-rtc FirebaseSignalingClient
 *
 * Example:
 * ```kotlin
 * val signalingManager = FirebaseSignalingManager(
 *     databaseUrl = "https://your-project.firebaseio.com",
 *     basePath = "signals",
 *     enableDebugLogging = true
 * )
 *
 * // Used with WebRTCManager
 * val webrtcManager = WebRTCManager(
 *     context = context,
 *     signalingManager = signalingManager
 * )
 * ```
 *
 * @param databaseUrl Firebase Realtime Database URL
 * @param basePath Base path for signaling data (default: "signals")
 * @param enableDebugLogging Enable debug logging
 */
class FirebaseSignalingManager(
    private val databaseUrl: String,
    private val basePath: String = "signals",
    private val enableDebugLogging: Boolean = false
) : SignalingManager {

    companion object {
        private const val TAG = "FirebaseSignaling"
    }

    private var auth: FirebaseAuth? = null
    private var database: FirebaseDatabase? = null
    private var isInitialized = false

    override suspend fun initialize() {
        if (isInitialized) {
            log("Already initialized")
            return
        }

        try {
            auth = FirebaseAuth.getInstance()
            database = FirebaseDatabase.getInstance(databaseUrl)

            // Sign in anonymously if not already signed in
            val currentAuth = auth ?: throw IllegalStateException("Firebase Auth not initialized")

            if (currentAuth.currentUser == null) {
                log("Signing in anonymously...")
                currentAuth.signInAnonymously().await()
                log("✓ Anonymous auth successful")
            } else {
                log("Already authenticated: ${currentAuth.currentUser?.uid}")
            }

            isInitialized = true
            log("✓ Firebase signaling initialized")

        } catch (e: Exception) {
            Log.e(TAG, "✗ Failed to initialize Firebase signaling", e)
            throw e
        }
    }

    override suspend fun sendAnswer(peerId: String, answer: SessionDescription): Result<Unit> {
        return try {
            checkInitialized()
            log("→ Sending answer to peer: $peerId (type: ${answer.type})")

            val answerData = mapOf(
                "sdp" to mapOf(
                    "type" to answer.type,
                    "sdp" to answer.sdp
                ),
                "ice" to emptyList<Any>(),
                "timestamp" to System.currentTimeMillis()
            )

            getPeersRef().child(peerId).child("answer").setValue(answerData).await()

            log("✓ Answer sent successfully to peer: $peerId")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "✗ Failed to send answer to $peerId", e)
            Result.failure(e)
        }
    }

    override suspend fun sendIceCandidate(peerId: String, candidate: IceCandidate): Result<Unit> {
        return try {
            checkInitialized()

            val iceRef = getPeersRef().child(peerId).child("answer").child("ice")

            val candidateData = mapOf(
                "candidate" to candidate.sdp,
                "sdpMid" to candidate.sdpMid,
                "sdpMLineIndex" to candidate.sdpMLineIndex
            )

            // Add to ice array
            iceRef.push().setValue(candidateData).await()

            log("→ Sent ICE candidate to peer: $peerId")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "✗ Failed to send ICE candidate", e)
            Result.failure(e)
        }
    }

    override fun listenForOffer(peerId: String): Flow<SignalingEvent> = callbackFlow {
        checkInitialized()
        log("=== START: Listening for offer from peer: $peerId ===")

        val offerListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                log("Offer snapshot exists: ${snapshot.exists()}")

                if (snapshot.exists()) {
                    // Structure: offer/sdp/{ type, sdp }
                    val sdpSnapshot = snapshot.child("sdp")
                    val sdpData = sdpSnapshot.value as? Map<*, *>

                    if (sdpData != null) {
                        val type = sdpData["type"] as? String
                        val sdp = sdpData["sdp"] as? String

                        log("Offer SDP data - type: $type, sdp length: ${sdp?.length}")

                        if (type != null && sdp != null) {
                            log("✓ RECEIVED VALID OFFER from peer: $peerId")
                            val offer = SessionDescription(type = type, sdp = sdp)
                            trySend(SignalingEvent.OfferReceived(offer))
                        } else {
                            Log.w(TAG, "✗ Invalid offer SDP data: type=$type, sdp=${sdp != null}")
                        }
                    } else {
                        log("Offer SDP data is null (waiting for offer...)")
                    }
                } else {
                    log("Offer snapshot does not exist yet (waiting...)")
                }
            }

            override fun onCancelled(error: DatabaseError) {
                Log.e(TAG, "✗ Failed to listen for offer: ${error.message}", error.toException())
                trySend(SignalingEvent.Error("Database error", error.toException()))
            }
        }

        getPeersRef().child(peerId).child("offer").addValueEventListener(offerListener)
        log("Offer listener attached to: $basePath/$peerId/offer")

        awaitClose {
            log("=== CLOSE: Removing offer listener for peer: $peerId ===")
            getPeersRef().child(peerId).child("offer").removeEventListener(offerListener)
        }
    }

    override fun listenForIceCandidates(peerId: String): Flow<SignalingEvent> = callbackFlow {
        checkInitialized()
        log("Listening for ICE candidates from peer: $peerId")

        val candidatesListener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                // Structure: offer/ice/[...]
                for (childSnapshot in snapshot.children) {
                    val candidateData = childSnapshot.value as? Map<*, *>
                    if (candidateData != null) {
                        val candidate = candidateData["candidate"] as? String
                        val sdpMid = candidateData["sdpMid"] as? String
                        val sdpMLineIndex = (candidateData["sdpMLineIndex"] as? Long)?.toInt() ?: 0

                        if (candidate != null) {
                            log("← Received ICE candidate from Desktop peer: $peerId")
                            val iceCandidate = IceCandidate(
                                sdp = candidate,
                                sdpMid = sdpMid,
                                sdpMLineIndex = sdpMLineIndex
                            )
                            trySend(SignalingEvent.IceCandidateReceived(iceCandidate))
                        }
                    }
                }
            }

            override fun onCancelled(error: DatabaseError) {
                Log.e(TAG, "✗ Failed to listen for ICE candidates", error.toException())
                trySend(SignalingEvent.Error("Database error", error.toException()))
            }
        }

        getPeersRef().child(peerId).child("offer").child("ice").addValueEventListener(candidatesListener)
        log("ICE listener attached to: $basePath/$peerId/offer/ice")

        awaitClose {
            log("=== CLOSE: Removing ICE listener for peer: $peerId ===")
            getPeersRef().child(peerId).child("offer").child("ice").removeEventListener(candidatesListener)
        }
    }

    override suspend fun cleanupPeerSession(peerId: String): Result<Unit> {
        return try {
            checkInitialized()
            getPeersRef().child(peerId).removeValue().await()
            log("Cleaned up peer session: $peerId")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cleanup peer session", e)
            Result.failure(e)
        }
    }

    override suspend fun close() {
        log("Closing Firebase signaling manager")
        auth?.signOut()
        auth = null
        database = null
        isInitialized = false
    }

    private fun getPeersRef() = database?.getReference(basePath)
        ?: throw IllegalStateException("Firebase Database not initialized")

    private fun checkInitialized() {
        if (!isInitialized) {
            throw IllegalStateException("FirebaseSignalingManager not initialized. Call initialize() first.")
        }
    }

    private fun log(message: String) {
        if (enableDebugLogging) {
            Log.d(TAG, message)
        }
    }
}
