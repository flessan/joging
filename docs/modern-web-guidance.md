# Modern Web Guidance in Joging

Joging adopts native browser features where they improve accessibility, interaction, and performance. The guidance is applied as progressive enhancement, not added as a runtime package.

## Statistics drawer

- Uses the native `<dialog>` element opened with `showModal()`, so the browser provides top-layer rendering, modal semantics, focus containment, Escape dismissal, and focus restoration.
- Uses `closedby="any"` for native light-dismiss. Browsers without `HTMLDialogElement.prototype.closedBy` receive a small pointer-coordinate fallback.
- Keeps the statistics content in its own scroll container and applies scroll containment to the modal and backdrop to reduce scroll chaining.
- Uses a dedicated handle for downward swipe-to-dismiss. The handle is also a named button, and can close the panel with Enter/Space or Arrow Down. The close button remains available as a direct alternative.
- Keeps the main map and session controls outside the dialog. Opening statistics is intentionally modal because the drawer temporarily takes focus and blocks map interaction.

## Native motion and fallbacks

- Uses CSS transitions on opacity and translate, plus `@starting-style`, `transition-behavior: allow-discrete`, and the `overlay` property for top-layer entry and exit where supported.
- Applies positional movement only when the user has not requested reduced motion. The existing reduced-motion stylesheet shortens or removes transitions.
- Detects actual `display` transition behavior with a temporary element instead of relying only on `CSS.supports()`. Where top-layer exit transitions are unavailable, Joging keeps the dialog open, applies its closing state, waits for its animations, and then closes it.
- No animation library or polyfill is added to the application bundle.

A document-wide View Transition is not used for opening this panel: it would snapshot the entire interactive map and temporarily block page interaction. The drawer has a native top-layer transition instead, scoped to the component that changes.

## Upstream guidance

- [Dialog](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/ui-components/dialog.md)
- [Animate elements to and from the top layer](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/ui-behaviors/animate-to-from-top-layer.md)
- [Light-dismiss a dialog](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/ui-behaviors/light-dismiss-a-dialog.md)
- [Prevent page scroll under a modal dialog](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/ui-behaviors/prevent-page-scroll-under-modal-dialog.md)
- [Build a draggable element](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/ui-behaviors/drag.md)
- [Same-document transitions](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/ui-behaviors/same-document-transitions.md)
