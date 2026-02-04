package com.grndd.celestials.webrtc.models

/**
 * ICE server configuration with optional credentials for TURN servers
 */
data class IceServerConfig(
    val url: String,
    val username: String? = null,
    val password: String? = null
)

/**
 * Configuration for WebRTC connection
 */
data class WebRTCConfig(
    val dataChannelLabel: String = "ZkPassportDataChannel",
    val enableDebugLogging: Boolean = false,
    val iceServers: List<IceServerConfig> = DEFAULT_ICE_SERVERS
) {
    companion object {
        val DEFAULT_ICE_SERVERS = listOf(
            // STUN servers (no credentials needed)
            IceServerConfig("stun:stun.l.google.com:19302"),
            IceServerConfig("stun:stun1.l.google.com:19302"),
            // TURN servers (with credentials for NAT traversal)
            IceServerConfig(
                url = "turn:openrelay.metered.ca:80",
                username = "openrelayproject",
                password = "openrelayproject"
            ),
            IceServerConfig(
                url = "turn:openrelay.metered.ca:443",
                username = "openrelayproject",
                password = "openrelayproject"
            ),
            IceServerConfig(
                url = "turn:openrelay.metered.ca:443?transport=tcp",
                username = "openrelayproject",
                password = "openrelayproject"
            )
        )

        val DEFAULT = WebRTCConfig()
    }
}
