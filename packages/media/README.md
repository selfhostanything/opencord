# Media Client

Media integration boundary for voice and screen share client code.

Phase 03 starts with the shared API join contract in `@opencord/api-client`.
Voice UI work should call `joinVoiceChannel`, then use the returned LiveKit
server URL, participant token, room name, and grants to connect through the
media client boundary.
