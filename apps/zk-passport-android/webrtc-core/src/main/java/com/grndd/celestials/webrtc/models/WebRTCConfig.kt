package com.grndd.celestials.webrtc.models

/**
 * Configuration for WebRTC connection
 */
data class WebRTCConfig(
    val dataChannelLabel: String = "ZkPassportDataChannel",
    val enableDebugLogging: Boolean = false,
    val iceServers: List<String> = DEFAULT_ICE_SERVERS
) {
    companion object {
        val DEFAULT_ICE_SERVERS = listOf(
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302"
        )

        val DEFAULT = WebRTCConfig()
    }
}
