/**
 * Synthesized timer completion sounds using Web Audio API.
 * No external audio files needed.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(frequency: number, duration: number, startTime: number, ctx: AudioContext, gain: GainNode) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startTime);
  osc.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playChime() {
  const ctx = getAudioContext();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);

  // Pleasant ascending chime: C5 → E5 → G5
  playTone(523.25, 0.4, ctx.currentTime, ctx, gain);
  playTone(659.25, 0.4, ctx.currentTime + 0.3, ctx, gain);
  playTone(783.99, 0.6, ctx.currentTime + 0.6, ctx, gain);
}

function playBell() {
  const ctx = getAudioContext();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.0);

  // Bell-like: single strike with harmonics
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(830, ctx.currentTime);
  osc1.connect(gain);
  osc1.start(ctx.currentTime);
  osc1.stop(ctx.currentTime + 2.0);

  const gain2 = ctx.createGain();
  gain2.connect(ctx.destination);
  gain2.gain.setValueAtTime(0.15, ctx.currentTime);
  gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1660, ctx.currentTime);
  osc2.connect(gain2);
  osc2.start(ctx.currentTime);
  osc2.stop(ctx.currentTime + 1.5);
}

export function playTimerSound(sound: string) {
  if (sound === "none") return;
  try {
    if (sound === "bell") {
      playBell();
    } else {
      // Default: chime
      playChime();
    }
  } catch (e) {
    console.warn("Could not play timer sound:", e);
  }
}
