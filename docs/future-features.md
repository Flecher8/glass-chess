# Glass Chess Future Features

## Product Direction

Glass Chess should grow from a working browser analysis MVP into a polished chess improvement workspace for casual improvers. The next phase should focus on clarity, confidence, and a premium user experience rather than accounts, databases, cloud storage, payments, or server analysis.

Future work should preserve these defaults:

- Analysis runs locally in the browser.
- Static export compatibility remains practical.
- Imported games and positions are not sent to an application backend by default.
- Visual design stays original and consistent with the current dark glass interface.
- New UI effects must improve the product feel without slowing analysis or reducing accessibility.

## Priority Roadmap

### Phase 1: Analysis Clarity

These features make the existing analysis workflow easier to understand and more useful after a game review.

1. **Review Summary Dashboard**
   - Show an end-of-review summary with estimated accuracy, strongest move, weakest move, move quality counts, and opening, middlegame, and endgame performance.
   - Keep the summary clearly labeled as engine-assisted and dependent on selected depth and device speed.
   - Acceptance: after a PGN review, the user can identify the most important problems without scanning every move.

2. **Critical Moments Timeline**
   - Add an evaluation timeline that marks major swings, mistakes, blunders, missed wins, and best moves.
   - Let users click a timeline point to jump to the relevant move.
   - Acceptance: the timeline remains stable during progressive analysis and updates values without layout shift.

3. **Move Explanation Panel**
   - Add short rule-based explanations for move classifications, such as material loss, missed tactical gain, weakened king safety, lost tempo, or stronger development move.
   - Base explanations on local chess state, material changes, checks, captures, engine best move, and evaluation swing.
   - Acceptance: each reviewed mistake has a plain-language reason when one can be inferred safely.

4. **Mistake Retry Mode**
   - Let users replay only inaccuracies, mistakes, blunders, misses, and selected critical moments.
   - Show the original position and ask the user to find a better move before revealing the engine suggestion.
   - Acceptance: users can practice their own game mistakes without importing the game again.

5. **Tactical Puzzle Extraction**
   - Convert positions from reviewed games into local practice puzzles when the best move is clearly tactical and materially better than the played move.
   - Keep puzzle generation conservative to avoid weak or unclear exercises.
   - Acceptance: puzzle candidates include the source move, target position, best move, and evaluation gain.

### Phase 2: Premium UI And Home Experience

These features make the product feel more complete before adding large new product areas.

6. **Premium Home Hero Refresh**
   - Redesign the home page hero with stronger hierarchy, a clearer value message, and a more refined app preview.
   - Keep the app name as the first-viewport signal and show the chess analysis product immediately.
   - Acceptance: desktop and mobile first view both show the brand, value, and a visible path to the analysis page.

7. **Three.js Hero Wow Effect**
   - Add a lightweight client-only Three.js scene for the home page only.
   - Use an original visual direction such as floating glass chess pieces, a subtle 3D board grid, depth lighting, and slow pointer-based parallax.
   - Lazy-load the scene, pause it when offscreen, dispose all renderer resources on unmount, and provide a CSS fallback for reduced motion or WebGL failure.
   - Acceptance: the effect renders on desktop and mobile, does not affect the analysis bundle, and never blocks page interaction.

8. **Interactive App Preview**
   - Replace the static home preview with an animated product preview showing an evaluation change, highlighted move, candidate moves, and progress state.
   - Use CSS and existing board styling first; keep Three.js separate from this preview unless there is a clear performance-safe reason.
   - Acceptance: the preview communicates what the app does in less than one screen without adding a tutorial block.

9. **Analysis Empty State Upgrade**
   - Improve the first-load analysis page with clearer import choices, sample PGN, sample FEN, and a simple start path.
   - Avoid heavy instructional text; use concise labels, visible controls, and good defaults.
   - Acceptance: a new user can start with a sample game or position in one click.

10. **Better Engine Progress UX**
   - Show current depth, current best move, review progress, and cancel state in a compact, stable area.
   - Reserve layout space before results arrive so candidate moves and previous moves do not jump.
   - Acceptance: analysis progress updates continuously without cumulative layout shift.

### Phase 3: Analysis Interface Polish

These features refine the board, side panel, and controls.

11. **Move Quality Legend**
   - Add an accessible legend for Book, Best, Excellent, Good, Inaccuracy, Mistake, Blunder, Miss, Great Move, and Brilliant.
   - Explain that classifications are estimates based on engine analysis.
   - Acceptance: users can understand colors and labels without leaving the analysis page.

12. **Board Theme Selector**
   - Add original CSS-only board themes, such as glass green, graphite, blue steel, high contrast, and classic muted.
   - Store the selected theme in local browser preferences.
   - Acceptance: changing the board theme updates the board immediately and survives reload.

13. **Piece Style Selector**
   - Add alternate custom or permissively licensed piece sets after license review.
   - Keep the current piece style as the default until replacement sets are verified.
   - Acceptance: every piece set is readable at mobile and desktop sizes and has documented license status.

14. **Responsive Analysis Layout Presets**
   - Add layout modes for Board Focus, Review Focus, and Compact Mobile.
   - Store the layout preference locally and keep the default balanced for desktop.
   - Acceptance: users can switch layout without losing the current game, position, engine state, or move history.

15. **Improved Mobile Analysis UX**
   - Add sticky move navigation, larger touch targets, collapsible candidate lines, and a board-first mobile flow.
   - Keep import controls reachable but secondary after the user has loaded a game.
   - Acceptance: mobile users can navigate moves, inspect best lines, and flip the board without awkward scrolling.

16. **Keyboard Shortcut Help Modal**
   - Add an accessible shortcut panel for previous move, next move, flip board, reset board, focus PGN import, focus FEN import, and stop analysis.
   - Ensure shortcuts do not fire while typing in inputs or textareas.
   - Acceptance: keyboard users can discover and use navigation shortcuts safely.

### Phase 4: Guided Improvement

These features add coaching-style value without a backend.

17. **Coach Tab MVP**
   - Turn the disabled Coach tab into a local guidance panel.
   - Show the current move quality, likely reason, better move if available, retry prompt, and next suggested action.
   - Acceptance: the Coach tab gives useful guidance for the selected move without claiming perfect coaching accuracy.

18. **Opening Card Redesign**
   - Improve the opening display with ECO code, opening name, book status, current move number, and a short out-of-book state.
   - Avoid large opening databases until licensed data has been selected.
   - Acceptance: users can tell whether the current position is still in the app's local opening book.

19. **Evaluation Bar Polish**
   - Improve evaluation bar readability, mate-state display, animation smoothness, and label stability.
   - Keep sizing fixed so long labels do not clip or resize the board.
   - Acceptance: centipawn and mate scores remain readable on mobile and desktop.

20. **Visual Polish Pass**
   - Refine spacing, contrast, focus states, hover states, scrollbars, dialogs, legal pages, footer, and page transitions.
   - Keep cards at the existing 8px radius style and avoid decorative effects that distract from analysis.
   - Acceptance: home, analysis, review, privacy, terms, licenses, and not-found pages feel like one finished product.

### Phase 5: Position Capture

This feature expands import options while keeping data local to the browser.

21. **Import Position From Screenshot**
   - Let users upload or paste a screenshot of a chessboard and convert the detected position into editable FEN.
   - Start with a safe workflow: user crops or confirms the board, the app detects orientation and pieces, then the user verifies side to move, castling rights, en-passant, and counters before loading.
   - Keep recognition browser-only unless a later phase explicitly approves remote processing.
   - Acceptance: users can import a clear board screenshot, correct uncertain squares, and load the final confirmed position into the board.

## Three.js Visual Direction

The first Three.js feature should be a home page visual layer, not a chessboard replacement.

Implementation constraints:

- Add Three.js only after reviewing its license, package size, maintenance status, and browser support.
- Load it with a client-only dynamic import so the analysis page does not pay for the visual effect.
- Use a fixed, responsive canvas container with a stable aspect ratio.
- Resize the renderer to the displayed canvas size and update the camera projection on resize.
- Pause the animation when the scene is outside the viewport.
- Stop the animation loop and dispose renderer, geometries, materials, and textures on unmount.
- Respect `prefers-reduced-motion` with a static CSS fallback.
- Provide a fallback when WebGL is unavailable.
- Use the current palette: deep navy, glass green, blue, white, and muted gray.
- Avoid yellow-heavy styling and avoid imitating other chess platforms.

Validation requirements:

- Desktop screenshot shows a nonblank, correctly framed scene.
- Mobile screenshot shows a nonblank, correctly cropped or simplified scene.
- Reduced-motion mode shows a static fallback.
- Analysis page bundle does not include the Three.js code path.
- Static build succeeds.

## Static And Privacy Constraints

Future features in this document should remain browser-first unless a later phase explicitly changes the product direction.

Do not add these for the next UI/UX phase:

- User accounts.
- Cloud-saved games.
- Database-backed study libraries.
- Payment or subscription logic.
- Analytics or tracking scripts.
- Server-side Stockfish.
- Backend game review APIs.
- Remote storage of imported PGN or FEN data.

If a future feature requires remote data, it must be opt-in and clearly documented before implementation.

## Validation Checklist

For this roadmap document:

- The document lists the current future feature set.
- The document is public-safe.
- The document does not reference non-public workflow details.
- The document keeps the next phase browser-first and privacy-first.
- The document avoids copying any third-party product identity.

For future code work:

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run test`.
- Run `npm run build`.
- Add focused Playwright checks for home, analysis desktop, and analysis mobile when UI changes are implemented.
- For Three.js work, verify desktop, mobile, reduced-motion fallback, WebGL fallback, cleanup on navigation, and static export output.
