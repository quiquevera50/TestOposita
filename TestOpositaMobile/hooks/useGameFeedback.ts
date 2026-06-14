import * as Haptics from 'expo-haptics';
import { Vibration, Platform } from 'react-native';

// ==========================================
// 🔊 FEEDBACK DE JUEGO: háptico + sonidos sintetizados (Web Audio)
// En web suenan; en nativo se apoya en la vibración.
// ==========================================

let _ctx: any = null;
const getCtx = () => {
  if (Platform.OS !== 'web') return null;
  try {
    if (typeof window === 'undefined') return null;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!_ctx) _ctx = new AC();
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  } catch { return null; }
};

// Reproduce una nota
const tono = (freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.14) => {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime + start;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch {}
};

export const useGameFeedback = () => {
  // ✅ ACIERTO — dos notas ascendentes alegres + háptico
  const feedbackAcierto = () => {
    if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else Vibration.vibrate([0, 40, 40, 40]);
    tono(659, 0, 0.12, 'triangle');      // E5
    tono(988, 0.09, 0.18, 'triangle');   // B5
  };

  // ❌ ERROR — buzz grave descendente + vibración larga
  const feedbackError = () => {
    Vibration.vibrate(350);
    tono(196, 0, 0.18, 'sawtooth', 0.10); // G3
    tono(146, 0.12, 0.22, 'sawtooth', 0.10); // D3
  };

  // 👆 SELECCIÓN — toque seco
  const feedbackSeleccion = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    tono(440, 0, 0.05, 'sine', 0.06);
  };

  // 🃏 COMODÍN — chispitas mágicas ascendentes
  const feedbackComodin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    [1175, 1568, 2093].forEach((f, i) => tono(f, i * 0.06, 0.12, 'triangle', 0.10));
  };

  // 🏆 VICTORIA — arpegio de fanfarria
  const feedbackVictoria = () => {
    if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else Vibration.vibrate([0, 60, 50, 60, 50, 120]);
    [523, 659, 784, 1046].forEach((f, i) => tono(f, i * 0.11, 0.3, 'triangle', 0.13));
  };

  return { feedbackAcierto, feedbackError, feedbackSeleccion, feedbackComodin, feedbackVictoria };
};
