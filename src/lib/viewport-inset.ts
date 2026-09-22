/**
 * Single source of truth for the on-screen keyboard inset.
 *
 * Why this exists: several layers (the recap dialog, bottom sheets, the client
 * picker) each listened to `visualViewport` and repositioned themselves on every
 * resize/scroll event. While the soft keyboard animates, those events fire
 * dozens of times with intermediate values, so each layer re-rendered and moved
 * repeatedly — the visible "bouncing".
 *
 * Here the raw events are collapsed into one rAF-batched value with hysteresis:
 * small changes are ignored, a small inset counts as "keyboard closed", and
 * layers stacked above a dialog can freeze the dialog's updates so only the top
 * layer moves.
 */

type Listener = (inset: number) => void;

interface Entry {
  fn: Listener;
  respectFreeze: boolean;
}

const entries = new Set<Entry>();
let current = 0;
let frozenCount = 0;
let rafId = 0;
let attached = false;

/** Below this the inset is treated as browser chrome, not a keyboard. */
const KEYBOARD_MIN_PX = 80;
/** Ignore movement smaller than this to avoid animation jitter. */
const JITTER_PX = 32;

const compute = () => {
  if (typeof window === "undefined" || !window.visualViewport) return 0;
  const vv = window.visualViewport;
  const raw = window.innerHeight - vv.offsetTop - vv.height;
  const inset = Math.max(0, Math.round(raw));
  return inset < KEYBOARD_MIN_PX ? 0 : inset;
};

const publish = () => {
  rafId = 0;
  const next = compute();
  if (next === current) return;
  // Opening/closing the keyboard is a big jump; intermediate frames are not.
  if (next !== 0 && current !== 0 && Math.abs(next - current) < JITTER_PX) return;
  current = next;
  for (const entry of entries) {
    if (entry.respectFreeze && frozenCount > 0) continue;
    entry.fn(current);
  }
};

const schedule = () => {
  if (rafId) return;
  rafId = requestAnimationFrame(publish);
};

const attach = () => {
  if (attached || typeof window === "undefined" || !window.visualViewport) return;
  attached = true;
  window.visualViewport.addEventListener("resize", schedule);
  window.visualViewport.addEventListener("scroll", schedule);
  window.addEventListener("orientationchange", schedule);
};

const detach = () => {
  if (!attached || typeof window === "undefined" || !window.visualViewport) return;
  attached = false;
  window.visualViewport.removeEventListener("resize", schedule);
  window.visualViewport.removeEventListener("scroll", schedule);
  window.removeEventListener("orientationchange", schedule);
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
};

export function getKeyboardInset() {
  return current;
}

export function subscribeKeyboardInset(fn: Listener, respectFreeze = false) {
  const entry: Entry = { fn, respectFreeze };
  entries.add(entry);
  attach();
  current = compute();
  fn(entry.respectFreeze && frozenCount > 0 ? 0 : current);
  return () => {
    entries.delete(entry);
    if (entries.size === 0) detach();
  };
}

/**
 * Called by layers rendered above a dialog (the client picker) so the dialog
 * underneath stops repositioning while that layer owns the keyboard.
 */
export function freezeDialogViewport() {
  frozenCount += 1;
  return () => {
    frozenCount = Math.max(0, frozenCount - 1);
    if (frozenCount === 0) schedule();
  };
}
