# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of zk-passport-android library
- `webrtc-core` module with framework-agnostic WebRTC implementation
  - `WebRTCManager` for managing peer connections
  - `SignalingManager` interface for pluggable signaling
  - Connection state management with Kotlin StateFlow
  - Data channel messaging
- `webrtc-firebase` module with Firebase Realtime Database signaling
  - `FirebaseSignalingManager` implementation
  - Compatible with @grndd-systems/zk-proof-rtc TypeScript library
- Complete documentation and examples
- MIT License

## [1.0.0-SNAPSHOT] - 2025-01-05

### Added
- Initial development version
- Core WebRTC functionality
- Firebase signaling support
- Protocol compatibility with zk-passport-client
