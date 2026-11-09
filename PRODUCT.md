# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are individuals, friends, and collaboration teams who communicate daily through real-time text chat, voice notes, voice/video room calls, and private encrypted spaces.

## Product Purpose

ChatRoom provides frictionless, ultra-fast real-time communication: instant WebSocket messaging, WebRTC group voice and video calling with LiveKit SFU, voice memos, public channels, and invite-protected private rooms. Success means lag-free conversation, delightful aesthetics, and clear, welcoming entry points.

## Positioning

Combines the community intimacy and fluid visual delight of modern lifestyle apps with high-performance real-time infrastructure (WebSockets, WebRTC SFU, MongoDB) without enterprise bloat.

## Operating Context

- Web app running across modern desktop browsers and mobile touchscreens.
- Key surfaces: Landing Page (`/`), Authentication (`/login`, `/register`), Chat App (`/chat`), Direct Messages, Voice/Video Call Rooms, and Super Admin Panel (`/admin`).

## Capabilities and Constraints

- Full authentication with JWT + Bearer token / HttpOnly cookie fallback.
- Google OAuth Single Sign-On integration (`@react-oauth/google`).
- Username / email validation and secure password login.
- Theme system supporting light and dark modes with WCAG AA compliance.
- Responsive design tailored for mobile portrait, tablet, and widescreen desktop.

## Brand Commitments

- Product Name: ChatRoom
- Personality: Warm, welcoming, community-driven, human, expressive.
- Visual Anchor: Friendly character illustration (connecting across clouds/sky), smooth organic shapes, soft borders, clean rounded inputs and buttons.

## Product Principles

1. **Human & Welcoming First:** Entry points feel warm and inviting, not cold or bureaucratic.
2. **Accessible in All Lights:** Flawless contrast and legible hierarchy in both Light and Dark modes.
3. **Responsive Fluidity:** Seamless experience from small smartphone screens to high-resolution desktop displays.
4. **Zero-Lag Reliability:** Instant feedback for validations, loading states, and auth transitions.

