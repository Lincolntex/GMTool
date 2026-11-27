# GMTool — MVP Outline

**Status:** Approved for implementation (2026-11-23)  
**Supersedes:** The priority order in `DEVELOPMENT_PLAN.md`  
**Goal:** Prove the shared live session first, locally, with the smallest possible scope.

---

## 1. Alpha goal

> Two or more browsers open a link, enter a PIN, and see the same scene at the same time. Everyone can point at things in the scene. The GM controls the session.

That is the entire alpha. No tokens, no characters, no campaign, no frame, no persistence.

If this does not feel good at the table, nothing built on top of it will matter.

---

## 2. Alpha scope

### Included

- GM creates a session with a title.
- GM creates **one scene** with a scene title and a background image.
- GM launches the session.
- The app generates a join link and a 6-digit PIN.
- GM can copy the link and PIN to the clipboard.
- Players open the link, enter the PIN, and enter a display name and marker color.
- Everyone sees the same scene title and background.
- A simple participant strip in the session header shows who is connected.
- Everyone can point at the scene:
  - Players use their chosen color.
  - The GM uses silver with a distinct diamond pointer and square ping.
  - Pointers appear only over the scene area.
  - **Shift+click** to ping; **Shift+click and drag** to point continuously.
  - A normal click does nothing, to prevent accidental pings.
- The GM can end the session.
- A browser refresh can rejoin the live session while the server is still running.

### Not included

- Tokens.
- Grid overlay.
- Token movement.
- Movement limits or approvals.
- Multiple scenes or scene switching.
- Characters or character sheets.
- Campaigns or Frames.
- Notes, party journal, or Session Zero.
- Fear, countdowns, or dice.
- GM view-as-player.
- Voice, video, or text chat.
- Persistence across a server restart.
- Remote access or Docker deployment.
- Mobile/touch support.
- User accounts.

---

## 3. Alpha acceptance criteria

The alpha is successful when:

- [ ] GM can create a session, enter a title, upload a background, and launch it.
- [ ] GM sees the scene title, background, join link, and PIN.
- [ ] At least two players can join from separate browsers with the link and PIN.
- [ ] Every browser shows the same scene title and background.
- [ ] Every participant sees the participant strip update when someone joins or leaves.
- [ ] Each player can point at the scene in their own color.
- [ ] The GM can point in silver with a distinct diamond/square marker.
- [ ] A normal click does nothing; Shift+click pings; Shift+click+drag points continuously.
- [ ] Pointers do not appear over the drawers or other UI.
- [ ] A new player who joins late sees the current scene immediately.
- [ ] A browser refresh can rejoin while the server is running.
- [ ] GM can end the session, after which the link no longer works.
- [ ] No token, character, or campaign UI is required to complete the test.

---

## 4. Roadmap after alpha

| Version | Scope | Notes |
|---|---|---|
| **V0.1 Alpha** | Session + single scene + pointers | Local only; no persistence |
| **V0.2** | Campaign dashboard + multi-scene builder | Implemented as an in-memory shell; build/copy/edit/delete/launch |
| **V0.2.1** | Live scene switching | Implemented with header arrows and a GM scene drawer |
| **V0.2.2** | Scene grids and token placement | Implemented: per-scene square grid with step arrows, pre-launch GM token placement, shared visibility toggle, player/enemy/NPC shapes, Active Tokens management, inline rename, hide/show with reveal push, stats drawers, permanent delete, shape-matched pings, movement mode, colorblind-safe shape picker |
| **V0.3** | Movement rules and GM control | Movement allowance or range-band checks, board lock, Pass/Fail, token locks, Requests drawer |
| **V1.0** | Persistence | Save campaigns/sessions across restarts |
| **V1.1** | Frame Lite | Reusable Frame templates, pinned versions, campaign copying |
| **V1.2** | Character basics | Up to 10 characters; create/select; portrait, name, HP, description; session-scoped selection |
| **V1.3** | Table tools | Fear, countdowns, dice, roll log, private notes, GM notes, party journal |
| **V1.4** | Session Zero and collaboration | Guided world notes, shared Campaign documents, Frame history/lore/timeline |
| **V2.0** | Daggerheart character system | Full builder, sheet, Hope/Fear/HP/Armor/Stress, domain cards, inventory, actions, level guide |
| **V3.0+** | Advanced features | Hotspots, fog, freehand whiteboard, chat, voice/video, mobile, accounts, public sharing |

### Priority rules

1. **Session first.** The live table remains the foundation.
2. **Campaign shell before persistence.** Validate the dashboard and builder with in-memory data first.
3. **Cell placement before movement rules.** The grid confirms scale, occupancy, and snapping first.
4. **No movement approvals until grid placement is stable.**
5. **Persistence after tokens and movement.** Table it until the interaction model is stable.
6. **Characters after Frame Lite.**
7. **Local testing first.** Docker and live deployment come after the core interaction is stable.

---

## 5. Alpha implementation shape

This is intentionally minimal. Final technology selection comes after sign-off.

- Single local process.
- One active room at a time.
- In-memory room state; no database.
- WebSocket for presence, scene state, and pointers.
- Scene background uploaded to a local folder.
- GM access via a simple local passphrase or environment key.
- Player identity is a display name and color stored for the live session only.
- No account, email, or persistent user record.
- No database migrations, snapshots, or campaign data.

### Suggested alpha flow

1. GM opens `/gm`.
2. GM enters the local passphrase.
3. GM creates a session:
   - Session title.
   - Scene title.
   - Background image.
4. GM clicks **Launch**.
5. App shows:
   - **Join session** button in the upper right.
   - Popup with join link, 6-digit PIN, and copy button.
   - Participant strip.
6. GM shares link and PIN with players.
7. Players open the link, enter the PIN, name, and color.
8. Everyone sees the scene and can point.
9. GM clicks **End Session** when finished.

---

## 6. Approved alpha decisions

- One active room at a time.
- Background: upload an image or choose a built-in fallback.
- Local testing on the same machine first; LAN access if it is easy.
- GM access via a passphrase from an environment variable.
- Participant strip shows display names and colors in the session header.
- Pointer: **Shift+click** to ping, **Shift+click+drag** to point continuously. A normal click does nothing.
- Scene title and background are locked at launch.
- Refreshing a browser can rejoin the live session while the server is running.
- Restarting the server ends the session; no recovery.
- The GM can end the session; there is no Save or Refresh flow yet.
- No database, no snapshots, no audit log in alpha.

---

## 7. Sign-off checklist

- [x] Alpha is session + single scene + pointers only.
- [x] No tokens, grid, movement, or approvals.
- [x] No characters, Campaigns, or Frames.
- [x] No persistence across server restart.
- [x] Local-only; Docker and live deployment come later.
- [x] Multiple scenes and scene switching are the first post-alpha feature.
- [x] Tokens come after scene switching.
- [x] Characters come after Campaign & Frame Lite.
- [x] Everything else is deferred.
- [x] Technology selection happens after this outline is approved.
- [x] Pointers require Shift to avoid accidental pings.

---

## 8. Technology selected

The local alpha uses:

- Node.js 20 + TypeScript
- Express 4
- Socket.IO 4
- React 18 + Vite 6
- React Router 7
- Plain CSS
- Local disk uploads under `uploads/`
- In-memory room state; no database

Astro is deferred. The alpha is a real-time application shell, and Vite + React is the
smallest path to a working shared scene. Astro can wrap the React client later for the
dashboard and marketing pages if needed.

See `ALPHA_IMPLEMENTATION.md` for the implementation details.

## 9. Implementation status

The alpha implementation is in place. See `README.md` for setup and the first local test.
