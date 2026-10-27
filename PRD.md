<!-- # Product Requirements Document (PRD)
## Project: ChatApp — Real-Time Collaborative Messaging & WebRTC Calling Platform

* **Document Version:** 1.0.0
* **Date:** October 2026
* **Status:** Approved / In Production
* **Author / Team:** Core Engineering Team
* **Target Audience:** Engineering, Product, DevOps, QA, Design

---

## Tasks & Quality Gate Checklist

### Completed Core Tasks
- [x] Real-time messaging with Socket.io (send, receive, optimistic updates, pagination)
- [x] Multi-user emoji reactions with full Unicode support and MongoDB ObjectId persistence
- [x] Integrated `emoji-picker-react` in composer with caret-position insertion
- [x] Viewport-aware reaction popover shelf with dedicated emoji search (🔍)
- [x] Message editing, replies with jump navigation, and tombstone deletion
- [x] File uploads (images, audio, PDF) with magic-byte MIME type validation
- [x] WebM voice note recording and custom waveform audio player
- [x] WebRTC voice and video calling (P2P/SFU signaling, mute, camera toggle, screen sharing)
- [x] Public & private rooms with 6-character invite codes and role-based permissions (owner/admin/member)
- [x] User presence tracking (online, away, offline) and customizable status (text + emoji + auto-expiry)
- [x] Dark / Light / System themes with WCAG 2.1 AA compliant contrast
- [x] Offline-first message queueing with automatic background sync on reconnect
- [x] Zero-warning linter pass (`npm run lint` for backend and frontend)
- [x] Full automated test suite passing (10 backend tests, 35 frontend tests)
- [x] Production PWA build verified (`npm run build`)

### Upcoming Roadmap Tasks
- [ ] End-to-End Encryption (E2EE) with Signal Protocol / Double Ratchet for private 1-on-1 rooms
- [ ] Nested message threads and side-conversations within busy channels
- [ ] Native Mobile App shell (React Native / Capacitor) leveraging existing APIs
- [ ] AI-powered chat assistants and real-time multilingual translation

---

## 1. Executive Summary & Vision

### 1.1 Product Vision
**ChatApp** is an enterprise-grade, real-time communication platform designed to provide a seamless, rich multimedia messaging and WebRTC calling experience across desktop and mobile browsers. Combining the speed of Discord and Slack with the sleek ergonomics of modern consumer messengers like WhatsApp and Telegram, ChatApp enables individuals and communities to chat, share media, react with dynamic emojis, record voice notes, and hop on high-definition audio/video calls without third-party plugins.

### 1.2 Core Problem Statement
Traditional web chat solutions often suffer from:
1. Clunky user interfaces that break on mobile screens.
2. Rigid emoji reaction setups limited to 5–6 hardcoded emojis without search or skin-tone variations.
3. Brittle network synchronization where disconnected clients drop messages or duplicate state.
4. Separate tooling required for text chatting versus voice/video calling.

ChatApp eliminates these friction points with an all-in-one, responsive, real-time progressive web architecture featuring full Unicode emoji integration, offline-first message queueing, and native WebRTC calling.

---

## 2. Target Personas & Use Cases

### 2.1 User Personas
* **Persona A: Casual Social Communicator ("Alex")**
  * *Needs:* Fast instant messaging, expressive emoji reactions with instant search, voice notes, intuitive photo sharing, and mobile-friendly dark mode.
* **Persona B: Community Moderator / Organizer ("Priya")**
  * *Needs:* Ability to create public or invite-only private rooms, assign moderator/admin roles, prune messages, manage room invite codes, and monitor user presence.
* **Persona C: Remote Collaborator ("Marcus")**
  * *Needs:* Seamless 1-click audio/video calls, screen sharing, file exchange (documents, PDFs), star/bookmark important discussions, and multi-device synchronization.

### 2.2 Key User Journeys
1. **Onboarding & Authentication:** User signs up or signs in via email/password, customizes their profile avatar and status emoji, and immediately lands in their active chat rooms.
2. **Interactive Real-Time Conversation:** User types messages, receives live typing indicators, replies to specific messages with clickable jump-links, and reacts using any Unicode emoji with instant feedback.
3. **Direct Calling & Collaboration:** From any active room, users can initiate crystal-clear voice or video calls with mute, camera toggle, and screen share controls.

---

## 3. System Architecture & Tech Stack

```
                          ┌────────────────────────────┐
                          │   Frontend: React + Vite   │
                          │  (PWA, Contexts, Vanilla)  │
                          └──────────────┬─────────────┘
                                         │
                        HTTP REST / JSON │ WebSocket (Socket.io)
                                         ▼
                          ┌────────────────────────────┐
                          │   Backend: Express + Node  │
                          │  (Cluster, Rate Limiter)   │
                          └──────┬───────────────┬─────┘
                                 │               │
                 Mongoose / BSON │               │ Cloudinary API / Local FS
                                 ▼               ▼
                      ┌──────────────────┐   ┌───────────────────────┐
                      │  MongoDB Atlas   │   │  Media Storage CDN    │
                      └──────────────────┘   └───────────────────────┘
```

* **Frontend:** React 18, Vite, `emoji-picker-react` (v5), Custom CSS Design System (Gajim-inspired tokens), Web Audio API, WebRTC APIs.
* **Backend:** Node.js, Express.js, Socket.IO (v4), Mongoose (v8).
* **Database:** MongoDB Atlas (with in-memory fallback for offline/isolated tests).
* **Security & Storage:** JWT (Bearer + Cookie fallback), Multer with magic-byte file validation, Cloudinary CDN, Helmet CSP.

---

## 4. Detailed Functional Requirements

### 4.1 Authentication & User Management
* **FR-AUTH-1:** Email & password authentication with bcrypt hashing (salt rounds: 10).
* **FR-AUTH-2:** Stateless JWT authentication delivered via `Authorization: Bearer <token>` and `HttpOnly` cookie for cross-origin and PWA resilience.
* **FR-AUTH-3:** User profile management: custom username, display avatar URL, and customizable status (text description + emoji + auto-expiry timestamp).
* **FR-AUTH-4:** Real-time presence tracking: `online`, `away`, and `offline` with timestamped `lastSeen` indicators.

### 4.2 Room & Channel Architecture
* **FR-ROOM-1:** Public rooms discoverable by all authenticated users.
* **FR-ROOM-2:** Private, invite-only rooms protected by membership authorization checks in both REST and WebSocket handshakes.
* **FR-ROOM-3:** Role-Based Access Control (RBAC): `owner`, `admin`, `moderator`, and `member` with granular permissions (delete room, kick member, edit room settings).
* **FR-ROOM-4:** Instant room joining via unique 6-character room invite codes and shareable deep links.
* **FR-ROOM-5:** Unread message badges, tab-title counters, and sound notification alerts.

### 4.3 Real-Time Messaging Engine
* **FR-MSG-1:** Sub-50ms message broadcast to all connected room participants via Socket.IO room channels.
* **FR-MSG-2:** Rich message formatting supporting Unicode, line breaks, and automatic URL detection.
* **FR-MSG-3:** Message replies with contextual parent preview and click-to-scroll jump navigation.
* **FR-MSG-4:** Message editing with historical `isEdited` badge and edit timestamp.
* **FR-MSG-5:** Message deletion with two modes:
  * *Delete for Everyone:* Tombstones the message (`"This message was deleted"`), removes file references, and updates all clients.
  * *Delete for Me:* Appends user ID to `deletedFor` array in MongoDB, filtering it exclusively for the requesting user.
* **FR-MSG-6:** Starred / Bookmarked messages with dedicated filter drawer for quick access.
* **FR-MSG-7:** Typing status indicators with debounce timeout to prevent network spam.
* **FR-MSG-8:** Delivery receipts: Sent → Delivered → Read indicators with user avatar tooltips.

### 4.4 Dynamic Emoji Picker & Reaction System
* **FR-EMOJI-1 (Composer Emoji Picker):**
  * Integrated `emoji-picker-react` component in the message composer.
  * Preserves cursor position, inserting selected emojis at the exact caret index without overriding draft text.
  * Category navigation, search bar, skin-tone selector, and recently used emojis.
* **FR-EMOJI-2 (Quick Reactions Shelf):**
  * Hover/long-press menu displaying top quick reactions (`👍`, `❤️`, `😂`, `🔥`, `😮`, `😢`).
  * Dedicated **Search Emoji button (🔍)** and **Expand button (+)** to open the full emoji reaction popover.
* **FR-EMOJI-3 (Viewport-Aware Placement):**
  * Dynamic calculation of popover positioning: automatically renders **below** the message (`.msg-unified-menu--bottom`) when close to the top viewport/header, avoiding screen clipping.
* **FR-EMOJI-4 (Single Reaction per User & Toggle):**
  * Clicking an active reaction removes it (toggle off).
  * Selecting a different emoji atomically moves the user's reaction from the previous emoji to the new one.
* **FR-EMOJI-5 (Production Persistence & Broadcast):**
  * BSON-safe MongoDB updates using `mongoose.Types.ObjectId` casting for `reactions.users`.
  * Emits `message_reaction_updated` with populated usernames and avatars to the room channel.
  * Fallback REST endpoint (`POST /api/messages/:messageId/reaction`) for HTTP clients, automatically broadcasting changes to connected socket peers.

### 4.5 Media & Voice Notes
* **FR-MEDIA-1:** File uploads supporting images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`), audio (`.mp3`, `.wav`, `.ogg`, `.webm`), and documents (`.pdf`).
* **FR-MEDIA-2 (Magic-Byte Sniffing):** Server-side binary inspection verifying that file headers match declared MIME types (spoofed `.exe` files disguised as `.png` are rejected).
* **FR-MEDIA-3 (Voice Recorder):** In-browser microphone recording with live duration timer, waveform preview, cancel option, and one-click dispatch as compressed WebM audio.
* **FR-MEDIA-4 (Audio Player):** Custom audio playback component with interactive seek bar, duration tracker, and volume control.
* **FR-MEDIA-5 (Lightbox):** Full-screen image preview modal with background blur and escape/click-out dismiss.

### 4.6 WebRTC Audio & Video Calling
* **FR-CALL-1:** Peer-to-Peer / SFU audio and video call signaling through Socket.IO (`call_user`, `call_accepted`, `call_rejected`, `call_ended`).
* **FR-CALL-2:** Media track controls: Mute/Unmute microphone, Enable/Disable camera, and Switch audio output device.
* **FR-CALL-3:** Screen sharing using `navigator.mediaDevices.getDisplayMedia` with automatic track replacement.
* **FR-CALL-4:** Call history logging in MongoDB (`CallHistory` schema) tracking caller, receiver, room, duration, and status (`completed`, `missed`, `declined`).

### 4.7 Offline Resilience & Progressive Web App (PWA)
* **FR-OFFLINE-1:** Detection of network status (`navigator.onLine`) with visual offline banner.
* **FR-OFFLINE-2 (Local Message Queue):** Messages sent during disconnections are assigned a client-side `tempId`, queued locally, and dispatched immediately upon socket reconnection.
* **FR-OFFLINE-3:** Service worker caching static assets and CSS for instant PWA loading on mobile and desktop.

### 4.8 Personalization & Appearance Studio
* **FR-THEME-1:** Dark mode, Light mode, and System preference synchronization.
* **FR-THEME-2:** Custom room wallpapers (solid colors, gradients, custom imagery) with CSS backdrop blend modes.
* **FR-THEME-3:** Sound Manager with toggleable sound effects for sending, receiving, typing, and room events.

---

## 5. Non-Functional Requirements (NFRs)

### 5.1 Performance & Scalability
* **NFR-PERF-1:** Real-time socket message delivery latency under 100ms in normal network conditions.
* **NFR-PERF-2:** Initial frontend page load under 1.8 seconds (First Contentful Paint) via Vite code-splitting and asset minification.
* **NFR-PERF-3:** Database compound indexing on `{ room: 1, createdAt: 1 }` and `{ room: 1, isDeleted: 1, createdAt: -1 }` guaranteeing sub-20ms pagination queries on 1,000,000+ message tables.

### 5.2 Security & Compliance
* **NFR-SEC-1:** Passwords stored using one-way bcrypt hashing.
* **NFR-SEC-2:** Zero ghost-user vulnerability: forged or malformed tokens are rejected without creating unauthorized state.
* **NFR-SEC-3:** Cross-Origin Resource Sharing (CORS) restricted to verified frontend domains (`localhost`, `.vercel.app`, `.onrender.com`, `.netlify.app`).
* **NFR-SEC-4:** Rate limiting on sensitive endpoints:
  * Authentication: 10 requests per 15 minutes per IP.
  * File Uploads: 200 requests per 15 minutes per IP.
  * WebRTC Tokens: 30 requests per minute per IP.
  * Socket message spam guard: max 20 messages per 10 seconds per client.
* **NFR-SEC-5:** Helmet security headers configured with Content Security Policy (CSP), anti-clickjacking (`X-Frame-Options`), and MIME-sniffing protection.

### 5.3 Reliability & Fault Tolerance
* **NFR-REL-1:** Graceful server shutdown on `SIGTERM` / `SIGINT` signals, closing HTTP listeners and disconnecting MongoDB cleanly.
* **NFR-REL-2:** Automated in-memory fallback for all messaging, room, and user functions when MongoDB connection drops, preventing server crashes during database maintenance.
* **NFR-REL-3:** Automatic WebSocket reconnection with exponential backoff on client disconnections.

### 5.4 Usability & Accessibility
* **NFR-A11Y-1:** WCAG 2.1 AA compliant color contrast ratios across both Dark and Light themes.
* **NFR-A11Y-2:** Full keyboard navigation support (Enter to send, Shift+Enter for newline, Escape to dismiss popovers).
* **NFR-A11Y-3:** Fully responsive UI adapting dynamically from 320px mobile screens to 4K displays.

---

## 6. Data Models & Entity Schemas

### 6.1 User Schema (`User.js`)
```javascript
{
  username: { type: String, required: true, unique: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  avatar:   { type: String, default: 'https://api.dicebear.com/7.x/bottts/svg?seed=...' },
  status:   { type: String, enum: ['online', 'away', 'offline'], default: 'offline' },
  customStatus: {
    text: { type: String, maxlength: 100 },
    emoji: { type: String, maxlength: 10 },
    expiresAt: { type: Date }
  },
  lastSeen: { type: Date, default: Date.now }
}
```

### 6.2 Room Schema (`Room.js`)
```javascript
{
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  isPrivate:   { type: Boolean, default: false },
  inviteCode:  { type: String, unique: true },
  owner:       { type: ObjectId, ref: 'User', required: true },
  members:     [{ type: ObjectId, ref: 'User' }],
  admins:      [{ type: ObjectId, ref: 'User' }],
  moderators:  [{ type: ObjectId, ref: 'User' }]
}
```

### 6.3 Message Schema (`Message.js`)
```javascript
{
  room:        { type: ObjectId, ref: 'Room', required: true, index: true },
  sender:      { type: ObjectId, ref: 'User', required: true, index: true },
  content:     { type: String, default: '', trim: true },
  fileUrl:     { type: String, default: null },
  fileType:    { type: String, enum: ['image', 'pdf', 'document', 'audio', 'call', null] },
  fileName:    { type: String, default: null },
  replyTo:     { type: ObjectId, ref: 'Message', default: null },
  reactions: [
    {
      emoji: { type: String, required: true },
      users: [{ type: ObjectId, ref: 'User' }]
    }
  ],
  readBy:      [{ type: ObjectId, ref: 'User' }],
  deliveredTo: [{ type: ObjectId, ref: 'User' }],
  starredBy:   [{ type: ObjectId, ref: 'User' }],
  deletedFor:  [{ type: ObjectId, ref: 'User' }],
  isEdited:    { type: Boolean, default: false },
  isDeleted:   { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now, index: true }
}
```

### 6.4 Call History Schema (`CallHistory.js`)
```javascript
{
  caller:    { type: ObjectId, ref: 'User', required: true },
  receiver:  { type: ObjectId, ref: 'User', default: null },
  room:      { type: ObjectId, ref: 'Room', required: true },
  callType:  { type: String, enum: ['audio', 'video'], default: 'audio' },
  status:    { type: String, enum: ['initiated', 'completed', 'missed', 'declined'] },
  duration:  { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  endedAt:   { type: Date, default: null }
}
```

---

## 7. Real-Time Socket.IO Protocol Matrix

| Event Name | Direction | Payload | Purpose |
|---|---|---|---|
| `join_room` | Client → Server | `{ roomId, user }` | Joins socket to the target room channel |
| `leave_room` | Client → Server | `{ roomId }` | Leaves room and notifies peers |
| `send_message` | Client → Server | `{ roomId, content, fileUrl, tempId, replyToId }` | Sends a message; derives sender from auth socket |
| `receive_message` | Server → Client | `MessageObject` (with `tempId` if present) | Broadcasts incoming message to room members |
| `toggle_reaction` | Client → Server | `{ messageId, roomId, emoji }`, `ack` | Toggles or updates user reaction on message |
| `message_reaction_updated` | Server → Client | `PopulatedMessageObject` | Broadcasts updated reaction pill data to all room members |
| `edit_message` | Client → Server | `{ messageId, roomId, newContent }` | Edits owned message; emits `message_edited` |
| `delete_message` | Client → Server | `{ messageId, roomId }` | Tombstones owned message; emits `message_deleted` |
| `typing_start` / `typing_stop` | Client → Server | `{ roomId }` | Dispatches ephemeral typing status |
| `call_user` | Client → Server | `{ userToCall, signalData, from, name }` | Initiates WebRTC call negotiation |
| `call_accepted` | Client → Server | `{ signal, to }` | Completes WebRTC peer handshake |

---

## 8. Deployment & DevOps Architecture

### 8.1 Multi-Environment Deployment Targets
1. **PaaS Cloud Target (Current Production Setup):**
   * **Backend:** Render (`onrender.com`) running Node.js + Express with health checks (`GET /api/health`).
   * **Frontend:** Vercel (`vercel.app`) running Vite static SPA with rewrites in `vercel.json`.
   * **Database:** MongoDB Atlas M0/Dedicated cluster.
2. **Containerized Production (Docker Compose):**
   * Multi-stage Docker build with Nginx reverse proxy routing `/api` and `/socket.io` to Express backend and serving `/dist` static files.
3. **Bare Metal (PM2 Cluster):**
   * Node process clustering managed by `ecosystem.config.cjs` with automatic restart on memory exhaustion (`max_memory_restart: '500M'`).

---

## 9. Success Metrics (KPIs)

* **Real-time Delivery Rate:** > 99.9% of messages delivered to online participants within 100ms.
* **Crash-Free Sessions:** > 99.8% across desktop and mobile browsers.
* **Reaction Interaction Success:** 100% reaction toggles synchronized without `ReferenceError` or missing user indicators.
* **WebRTC Connection Success Rate:** > 95% successful peer-to-peer connections under standard NAT/STUN configurations.

---

## 10. Future Product Roadmap

* **Phase 2 (Q1 2027):** End-to-End Encryption (E2EE) with Signal Protocol / Double Ratchet for private 1-on-1 rooms.
* **Phase 3 (Q2 2027):** Message threads / side-conversations within busy channels.
* **Phase 4 (Q3 2027):** Native Mobile Apps (React Native / Capacitor) leveraging the existing REST & Socket.IO APIs.
* **Phase 5 (Q4 2027):** AI-powered chat assistants and real-time message translation.

---

## 11. Document Sign-Off & Quality Verification

| Role | Name | Status | Timestamp |
|---|---|---|---|
| Lead Architect | Core Engineering | Approved | October 2026 |
| QA & Test Automation | Test Suite Runner | Passed (All 45 Tests, Zero Lint Warnings) | October 2026 |
| DevOps & Infrastructure | Deployment Orchestrator | Verified (PWA Build Passing) | October 2026 | -->

## Tasks to Complete
- [ ] Fix: Chatroom me refresh karne par usi room me bane rehna chahiye (Room persistence on refresh)
- [ ] Verify: Database me message aur reaction theek se save ho rahe hain ya nahi
- [ ] Feature: Add typing indicator enhancement
