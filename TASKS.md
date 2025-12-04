# Block-You Mobile Web Improvement Tasks

## Current Mobile Support Status

✓ **Working:**
- Touch input via Pointer Events API
- Responsive viewport settings
- Board scales to fit screen
- Touch-friendly drag-and-drop for piece placement
- Basic responsive CSS with 768px breakpoint
- Remote multiplayer via WebRTC/PeerJS
- PWA support with install prompt and offline caching
- Safe area support for notched devices
- Dark mode support

## Tasks for Full Mobile Web Playability

### Critical Priority (P0)

#### 1. Portrait Mode Layout Optimization
**Problem:** Current layout optimized for landscape/desktop. Controls and inventory stay in sidebar even on phones.

**Files to modify:**
- `styles.css` - Add portrait-specific media queries
- Board sizing formula `min(90vw, 70vh)` doesn't work well in portrait

**Tasks:**
- [ ] Add `@media (orientation: portrait)` query
- [ ] Stack controls vertically in portrait mode
- [ ] Adjust board sizing: use `min(90vw, 50vh)` in portrait
- [ ] Move status panel above board in portrait
- [ ] Ensure inventory is scrollable in portrait

#### 2. Small Screen Optimization (< 375px)
**Problem:** Touch targets too small, piece previews hard to see

**Files to modify:**
- `styles.css` - Add breakpoints for 375px and 320px

**Tasks:**
- [ ] Add `@media (max-width: 375px)` breakpoint
- [ ] Increase minimum button size to 44×44px (Apple HIG standard)
- [ ] Increase piece inventory card minimum from 88px to 100px
- [ ] Increase mini-grid cells from 10px to 12px on small screens
- [ ] Reduce padding/margins to maximize space
- [ ] Make player count selector larger (easier to tap)

#### 3. Prevent Page Scrolling During Gameplay
**Problem:** Body can scroll during gameplay, causing accidental interactions

**Files to modify:**
- `main.js` - Add overflow control when game starts
- `styles.css` - Add body overflow rules

**Tasks:**
- [ ] Add `body { overflow: hidden; height: 100vh; }` when game is active
- [ ] Add `body { overflow: auto; }` when game hasn't started
- [ ] Ensure game container uses full viewport height
- [ ] Test scrolling behavior on iOS Safari

### High Priority (P1)

#### 4. PWA Support - Make Game Installable ✅ COMPLETED
**Status:** Fully implemented

**Files created/modified:**
- `manifest.json` - PWA manifest with app metadata
- `sw.js` - Service worker for offline caching
- `icon-192.png`, `icon-512.png` - App icons
- `index.html` - PWA meta tags added
- `src/main.js` - Service worker registration and install prompt handling
- `styles.css` - Install button styling

**Completed tasks:**
- [x] Create `manifest.json` with:
  - App name: "Block-You"
  - Short name: "Block-You"
  - Description
  - Theme color: #2196f3 (blue from current design)
  - Background color: #f5f5f5
  - Display: "standalone"
  - Start URL: "/"
  - Icons: 192x192, 512x512
- [x] Create app icons (192x192, 512x512 PNG)
- [x] Add manifest link to `index.html`
- [x] Create basic service worker for offline caching
- [x] Register service worker in `main.js`
- [x] Add "Install App" button to lobby menu
- [x] Handle `beforeinstallprompt` event
- [x] Handle `appinstalled` event

#### 5. Safe Area Support for Notched Devices ✅ COMPLETED
**Status:** Already implemented in existing CSS

**Implementation:**
- `viewport-fit=cover` in viewport meta tag
- `env(safe-area-inset-*)` padding applied to containers
- Tested with iOS Safari notch support

#### 6. Haptic Feedback
**Problem:** No tactile feedback on successful placement

**Files to modify:**
- `main.js` - Add Vibration API calls

**Tasks:**
- [ ] Add vibration on successful piece placement (short: 50ms)
- [ ] Add vibration on invalid placement attempt (double: [50, 100, 50])
- [ ] Add vibration on game end (triple: [100, 100, 100, 100, 200])
- [ ] Feature-detect Vibration API availability
- [ ] Add user preference to disable haptics

### Medium Priority (P2)

#### 7. Mobile-Specific Help/Instructions
**Problem:** No touch-specific help or onboarding

**Files to modify:**
- `index.html` - Add help modal/overlay
- `styles.css` - Style help overlay
- `main.js` - Add help modal logic

**Tasks:**
- [ ] Create help modal with mobile-specific instructions
- [ ] Add "How to Play" button
- [ ] Instructions for:
  - Drag and drop pieces
  - Rotate/flip buttons
  - Placement rules
  - Scoring
- [ ] Show help automatically on first visit (localStorage flag)
- [ ] Add close button and tap-outside-to-close

#### 8. Performance Optimization
**Problem:** Renders 400 board cells every turn, all 21 pieces rendered

**Files to modify:**
- `main.js` - Optimize rendering

**Tasks:**
- [ ] Use `requestAnimationFrame` for preview updates during drag
- [ ] Implement virtual scrolling for piece inventory (only render visible pieces)
- [ ] Only re-render changed board cells instead of entire board
- [ ] Debounce pointer move events (every 16ms max)
- [ ] Use CSS transforms instead of re-rendering for piece preview
- [ ] Profile performance on low-end Android devices

#### 9. Better Visual Feedback
**Problem:** Minimal visual feedback on interactions

**Files to modify:**
- `styles.css` - Add animations and transitions
- `main.js` - Add visual state changes

**Tasks:**
- [ ] Add piece selection highlight animation
- [ ] Add board cell hover effect (even on touch)
- [ ] Add ripple effect on button taps
- [ ] Add piece placement animation (fade-in or slide-in)
- [ ] Add "invalid placement" shake animation
- [ ] Show visual feedback for game state changes (turn change, game end)

### Low Priority (P3)

#### 10. Fullscreen Mode
**Tasks:**
- [ ] Add fullscreen toggle button
- [ ] Use Fullscreen API
- [ ] Handle fullscreen change events
- [ ] Add exit fullscreen button when active

#### 11. Landscape Lock Option
**Tasks:**
- [ ] Add landscape lock toggle (on supported browsers)
- [ ] Use Screen Orientation API
- [ ] Show message when orientation locked
- [ ] Allow user to unlock

#### 12. Improved Drag Preview
**Tasks:**
- [ ] Show board boundary constraint during drag
- [ ] Add shadow/glow to preview piece
- [ ] Reset preview immediately when released outside board
- [ ] Add animation when preview snaps to valid position

#### 13. Pinch-to-Zoom Support
**Problem:** Zoom disabled via `touch-action: none`

**Tasks:**
- [ ] Add toggle for pinch-zoom
- [ ] Change `touch-action: none` to `touch-action: pan-x pan-y` when enabled
- [ ] Handle zoom state in pointer event handlers
- [ ] Add zoom controls (+/- buttons) as fallback

#### 14. Accessibility Improvements
**Tasks:**
- [ ] Add screen reader announcements for piece placement
- [ ] Improve ARIA labels for all interactive elements
- [ ] Add keyboard navigation for controls
- [ ] Add high-contrast mode toggle
- [ ] Ensure focus indicators are visible
- [ ] Test with VoiceOver (iOS) and TalkBack (Android)

#### 15. Loading and Error States
**Tasks:**
- [ ] Add loading spinner/skeleton screen
- [ ] Add error messages for:
  - Service worker registration failure
  - Offline mode
  - Invalid game state
- [ ] Add "Network offline" indicator
- [ ] Add retry mechanisms

## CSS Specific Improvements

### Responsive Breakpoints to Add
```css
/* Extra small phones */
@media (max-width: 320px) { }

/* Small phones */
@media (max-width: 375px) { }

/* Medium phones */
@media (max-width: 414px) { }

/* Portrait orientation */
@media (orientation: portrait) { }

/* Landscape orientation */
@media (orientation: landscape) and (max-height: 500px) { }
```

### Touch Target Improvements
- Minimum touch target: 44×44px (Apple HIG)
- Recommended: 48×48px (Material Design)
- Spacing between targets: at least 8px

## Testing Checklist

### Devices to Test
- [ ] iPhone SE (small screen: 375x667)
- [ ] iPhone 14 Pro (notch: 393x852)
- [ ] Android small (320x568)
- [ ] Android medium (360x640)
- [ ] iPad (tablet: 768x1024)
- [ ] Android tablet (800x1280)

### Orientations
- [ ] Portrait mode on all devices
- [ ] Landscape mode on all devices
- [ ] Rotation during gameplay

### Browsers
- [ ] iOS Safari
- [ ] Chrome on Android
- [ ] Firefox on Android
- [ ] Samsung Internet

### Touch Interactions
- [ ] Single tap to select piece
- [ ] Drag and drop piece placement
- [ ] Rotate/flip buttons work
- [ ] Pass button works
- [ ] Player count selector works
- [ ] Start game button works
- [ ] All buttons have visible tap feedback

### Performance
- [ ] 60fps during drag operations
- [ ] No lag on piece placement
- [ ] Smooth animations
- [ ] Fast game start

### Edge Cases
- [x] Works offline (PWA) - Service worker caches all static assets
- [ ] Survives page refresh (save state?)
- [ ] Handles low battery mode
- [ ] Works with reduced motion preference
- [x] Works with dark mode preference

## File Reference

- **Main game logic:** `src/main.js`
- **Piece definitions:** `src/pieces.js`
- **Networking (WebRTC):** `src/networking.js`
- **Styles:** `styles.css`
- **HTML structure:** `index.html`
- **PWA manifest:** `manifest.json`
- **Service worker:** `sw.js`
- **App icons:** `icon-192.png`, `icon-512.png`
- **Icon generator:** `scripts/generate-icons.js`
- **Touch events:** `src/main.js` (pointer event handlers)
- **PWA registration:** `src/main.js:7-52` (service worker and install prompt)
