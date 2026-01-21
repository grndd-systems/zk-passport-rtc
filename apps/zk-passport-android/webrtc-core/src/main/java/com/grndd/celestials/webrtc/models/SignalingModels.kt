package com.grndd.celestials.webrtc.models

/**
 * Session Description (SDP) data
 */
data class SessionDescription(
    val type: String = "", // "offer" or "answer"
    val sdp: String = ""
)

/**
 * ICE Candidate data
 */
data class IceCandidate(
    val sdp: String = "",
    val sdpMLineIndex: Int = 0,
    val sdpMid: String? = null
)

/**
 * Signaling events
 */
sealed class SignalingEvent {
    data class OfferReceived(val offer: SessionDescription) : SignalingEvent()
    data class AnswerReceived(val answer: SessionDescription) : SignalingEvent()
    data class IceCandidateReceived(val candidate: IceCandidate) : SignalingEvent()
    data class Error(val message: String, val exception: Exception? = null) : SignalingEvent()
    data object ConnectionEstablished : SignalingEvent()
    data object Disconnected : SignalingEvent()
}
