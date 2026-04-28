/**
 * Speak TMS announcement text via the Web Speech API.
 * Handles Chromium's async voice list and cancel+speak timing quirks.
 */
export function speakTmsAnnouncement(text: string): void {
  const synth = globalThis.speechSynthesis;
  if (!synth || !text.trim()) return;

  const utter = new SpeechSynthesisUtterance(text.trim());
  utter.lang = "en-US";

  const speak = () => {
    try {
      synth.resume();
      synth.cancel();
      globalThis.setTimeout(() => {
        synth.speak(utter);
      }, 0);
    } catch {
      /* ignore */
    }
  };

  synth.getVoices();

  let started = false;
  const go = () => {
    if (started) return;
    if (synth.getVoices().length === 0) return;
    started = true;
    speak();
  };

  go();
  if (!started) {
    synth.addEventListener("voiceschanged", go, { once: true });
    globalThis.setTimeout(go, 200);
    globalThis.setTimeout(go, 2000);
  }
}

/** Call from a click handler so voice engines load and (where required) tie TTS to user gesture. */
export function primeSpeechSynthesis(): void {
  const synth = globalThis.speechSynthesis;
  if (!synth) return;
  synth.resume();
  synth.getVoices();
}
