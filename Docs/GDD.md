# Block You — Game Design Document (GDD)

## 1) Game Overview

**Working title:** Block You  
**Genre:** 1v1 precision fighting game (2.5D: 3D characters constrained to a side-view plane)  
**Platform:** Native web (desktop + mobile)  
**Rendering:** Full 3D skeletal stick-figure rigs (visible joints/bones), side camera like Street Fighter  
**Modes:** Single-player only (human vs basic AI)  

### Core fantasy
A clean, highly readable duel where timing and spacing matter more than move count. The entire design is built around **three actions only**:
- **Block** (hold)
- **Punch** (tap)
- **Kick** (tap)

Despite the minimal move list, combat should feel deep through:
- strict frame timing,
- precise hitboxes/hurtboxes,
- responsive control buffering,
- smooth, deterministic animation transitions,
- visible physical reactions on impact.

---

## 2) Design Pillars

1. **Precision over complexity**  
   Few moves, tightly tuned startup/active/recovery windows.

2. **Readability over visual noise**  
   Stick-figure skeletal models with clear silhouettes, hit flashes, and legible reactions.

3. **Responsiveness over spectacle**  
   Low input latency and deterministic combat simulation.

4. **Consistency over randomness**  
   Reliable AI behavior and fixed combat rules so players can learn and improve.

---

## 3) Camera, Space, and Movement

## Camera
- Orthographic-like side perspective (or narrow-FOV perspective camera) fixed on combat axis.
- Both fighters always remain visible with dynamic zoom only if needed.
- No camera roll/tilt during combat.

## Arena
- Flat lane with movement constrained to 2D gameplay plane:
  - **X-axis:** forward/backward (primary movement)
  - **Y-axis:** optional tiny vertical drift only for polish/input expression, but gameplay collision remains lane-based
  - **Z-axis:** locked (no depth movement)

## Movement
- Walk forward/back only.
- No jump, crouch, throw, special moves, or projectiles in v1.
- Tuned acceleration/deceleration for smooth but precise spacing.

---

## 4) Characters

## Visuals
- Two identical full-body 3D skeleton rigs (Unreal-style joint visualization aesthetic).
- Player character: **blue joints**.
- CPU character: **red joints**.
- Minimal mesh/no mesh beyond bones + optional thin limb tubes for readability.

## Stats (shared)
- Mirror match stats for fairness/testing:
  - Walk speed: equal
  - Health: equal
  - Attack frame data: equal
  - Block behavior: equal

---

## 5) Core Combat System

## Input actions
- **Block:** hold input to enter/maintain block state.
- **Punch:** discrete tap/click.
- **Kick:** discrete tap/click.

## Attack philosophy
Both attacks are simple but distinct:
- **Punch:** faster startup, lower damage, shorter reach.
- **Kick:** slower startup, higher damage, longer reach.

## Suggested frame model (60 FPS simulation)
Use fixed-step simulation at 60 Hz for deterministic behavior.

- **Punch**
  - Startup: 5f
  - Active: 3f
  - Recovery: 10f
  - On hit: +2 frame advantage
  - On block: -2
  - Damage: 8
  - Range: short

- **Kick**
  - Startup: 9f
  - Active: 4f
  - Recovery: 14f
  - On hit: +1
  - On block: -4
  - Damage: 12
  - Range: medium

- **Block**
  - Enter: 1f
  - Exit: 2f
  - Chip damage: 0 (v1)
  - Block stun (when hit):
    - vs Punch: 7f
    - vs Kick: 9f

> Numbers are starting points and should be tuned using telemetry (hit rate, whiff rate, round length, and player win spread).

## Hit detection
- Per-frame hitbox/hurtbox update tied to animation/skeleton bones.
- Capsule or box colliders attached to relevant bones:
  - Punch hitbox near hand/forearm.
  - Kick hitbox near shin/foot.
- Continuous collision check each simulation frame.
- Priority rules for same-frame clashes:
  1. Blocked hit resolves as block if defender entered block before active frame.
  2. If both attacks connect same frame and neither blocks: trade (both take hit).

## Reactions (must-have)
On successful hit:
- Victim enters hit-stun animation (distinct from idle/block).
- Root/body receives small impulse/knockback along X-axis.
- Brief hit-stop (e.g., 3–5 frames) for impact feel.
- One-frame color flash + spark effect at contact point.

On blocked hit:
- Defender gets block-stun animation and slight pushback.
- Different VFX/SFX from clean hit.

---

## 6) Animation System (Precision + Smoothness)

## Required clips
- Idle loop
- Walk forward / walk backward
- Block enter / hold / exit
- Punch
- Kick
- Hit react (light)
- Block react
- Round win / lose idle (optional polish)

## State machine
Core states:
- `Idle`
- `WalkForward`
- `WalkBackward`
- `BlockEnter`
- `BlockHold`
- `BlockExit`
- `PunchStartup`
- `PunchActive`
- `PunchRecovery`
- `KickStartup`
- `KickActive`
- `KickRecovery`
- `HitStun`
- `BlockStun`

Transition rules:
- No attack canceling during active/recovery in v1.
- Input buffer (2–4 frames) allowed for punch/kick to improve feel.
- Block can interrupt idle/walk immediately (1f enter).
- During `HitStun` and `BlockStun`, ignore new attack inputs; queue at most one buffered input.
- Blend windows:
  - locomotion blends: 100–150ms
  - combat action transitions: 50–90ms
  - hit reactions: immediate override with shortest safe blend (~30ms)

## Quality targets
- Animation sample rate: 30 or 60 FPS, retimed to fixed simulation.
- Root motion policy: in-place attacks, code-driven displacement for deterministic net physics (even though single-player).
- Foot sliding minimized via stride warping or strict speed matching.

---

## 7) AI Opponent (Basic but clean)

## Behavior model
Simple utility/state-based AI with deliberate reaction limits:
- Neutral spacing behavior (hover at preferred range).
- If player within punch range: chance to punch.
- If at kick range edge: chance to kick.
- If player attack startup detected: chance to block.
- If recently hit: short defensive bias window.

## Difficulty fairness constraints
- Reaction delay window: 180–280ms (non-cheating).
- Input noise: occasional late/early actions.
- No reading hidden future states; AI only uses observable data.

---

## 8) Match Rules and Flow

- **Format:** Best of 3 rounds.
- **Round timer:** 45 seconds (tunable).
- **Win conditions:**
  1. Opponent health reaches 0, or
  2. Time-out with higher remaining health.
- **Inter-round downtime:** 2.5–3 seconds with clear HUD messaging.
- **Match end:** show winner + quick rematch button.

---

## 9) HUD and UX

## HUD elements
- Top-left: Player 1 (Blue) health bar.
- Top-right: Player 2 (Red CPU) health bar.
- Top-center: round indicator (R1/R2/R3), timer, and score (e.g., 1–0).

## Action UI (mobile + optional desktop overlay)
- Three large arcade-style buttons:
  - Block (hold-capable)
  - Punch (tap)
  - Kick (tap)
- Visual pressed states and cooldown lockouts based on frame state.

## Floating D-pad
- Appears where user first touches left side (or configurable region).
- Provides left/right movement only for gameplay axis.
- Repositions to new touch origin when touch starts.
- Should not obscure health bars/buttons.

## Desktop controls
Suggested defaults:
- Movement: `A/D` or `←/→`
- Block: `S` or `Shift`
- Punch: `J` or `Z`
- Kick: `K` or `X`
- Pause: `Esc`

Include keybinding remap support later; fixed defaults in v1.

---

## 10) Technical Architecture (Web)

## Runtime
- WebGL/WebGPU via engine/framework of choice (e.g., Three.js + custom combat layer, Babylon.js, or PlayCanvas).
- Fixed-step gameplay simulation (`dt = 1/60`) decoupled from render framerate.
- Deterministic state machine updates in simulation loop.

## Input pipeline
- Collect raw inputs per frame.
- Normalize to action intents (`move`, `blockHeld`, `punchPressed`, `kickPressed`).
- Apply buffering window and state-gated execution.

## Performance targets
- 60 FPS on mid-tier mobile and desktop.
- Input-to-action latency target:
  - Desktop: < 80ms typical
  - Mobile: < 110ms typical
- Minimize GC spikes (pool effects/colliders, avoid per-frame allocations).

---

## 11) Precision & Feel Techniques (inspired by high-discipline action combat design)

To achieve “simple but exact” combat quality:

1. **Frame-data-first authoring**  
   Build attacks from startup/active/recovery first, then fit animation to those windows.

2. **Hitbox/hurtbox debug visualizer**  
   Toggle overlays for live box inspection and frame stepping.

3. **Input buffering + tiny grace windows**  
   Prevent dropped commands while preserving strict timing.

4. **Hit-stop and consistent stun rules**  
   Short freeze on impact dramatically improves perceived contact precision.

5. **State machine determinism**  
   One source of truth for combat state; avoid animation graph race conditions.

6. **Spacing honesty**  
   Keep ranges explicit so outcomes are predictable and learnable.

7. **Animation blending constraints**  
   Use fast but controlled blends; never blur attack readability.

8. **Telemetry-led tuning**  
   Log per-round metrics: hit accuracy, block rate, average TTK, and whiff punish frequency.

9. **Non-cheating AI rules**  
   Force reaction delay and observable-only decisions.

10. **Iterative slow-motion review**  
    In debug mode, run 0.25x speed + frame advance to validate fairness.

---

## 12) Release, PWA, and Auto-Deploy

## Hosting / CI-CD
- Deploy automatically with Vercel on main branch updates.
- Version stamp embedded at build time.

## Update notification behavior
Implement the same user-facing update pattern as requested:
- Service worker checks for new release.
- When update available, show non-intrusive toast/banner:
  - “New version available.”
  - Button: **Force Refresh**
- Force refresh action:
  1. Skip waiting service worker,
  2. Claim clients,
  3. Hard reload app shell.

## PWA requirements
- Installable manifest icons/splash metadata.
- Offline shell cache for core assets.
- Fast startup and no stale combat logic after refresh.

---

## 13) MVP Scope (Must Ship)

1. Single arena, single mode (Player vs CPU).
2. Two mirrored skeletal stick fighters (red/blue joints).
3. Movement + Block + Punch + Kick only.
4. Hit reactions with pushback/hit-stop.
5. Best-of-3 rounds + HUD health bars/timer.
6. Desktop + mobile controls (buttons + floating D-pad + keyboard).
7. Vercel deploy + service-worker update notification + force refresh.

---

## 14) Out of Scope (v1)

- Online multiplayer
- Extra characters/moves
- Jumping/crouching/throws/projectiles
- Advanced combo system/juggles
- Ranked progression/cosmetics

---

## 15) Acceptance Criteria

- Combat is deterministic at 60 Hz simulation.
- Punch and kick feel distinct in startup/range/recovery.
- Block hold reliably guards if entered before active frames.
- Hit reactions are obvious and physical (stun + pushback + impact feedback).
- Mobile controls are fully playable one-handed + two-handed.
- Desktop keybinds work with no input ghosting issues.
- Best-of-3 match loop functions end-to-end.
- Update notification appears on new deploy and force refresh works.

---

## 16) Research Notes and Constraints

- External web browsing was attempted in this environment but blocked by network restrictions (`403 Forbidden`), so this GDD uses established fighting-game/action-combat best practices and known design patterns aligned with high-precision action titles.
- Recommended follow-up when unrestricted internet is available:
  1. Gather direct interviews/postmortems from Team Ninja developers.
  2. Compare frame-data cadence with classic 3D action/fighting systems.
  3. Validate animation transition budgets and reaction timing against published talks.

