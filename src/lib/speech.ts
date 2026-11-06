export type AnnounceLang = "en" | "hi" | "both";

interface Line {
  text: string;
  lang: "en" | "hi";
}

let audioCtx: AudioContext | null = null;

/** Must run from a user gesture: unlocks speech and Web Audio on TV browsers. */
export function primeSpeechSynthesis(): void {
  const synth = globalThis.speechSynthesis;
  if (synth) {
    synth.resume();
    synth.getVoices();
  }
  try {
    audioCtx ??= new AudioContext();
    void audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

/** Two-note "ding-dong" before an announcement; a brighter three-note one for celebrations. */
export function chime(big = false): void {
  if (!audioCtx) return;
  const notes = big ? [784, 988, 1319] : [880, 1319];
  const t0 = audioCtx.currentTime + 0.02;
  notes.forEach((freq, i) => {
    const osc = audioCtx!.createOscillator();
    const gain = audioCtx!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = t0 + i * 0.22;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
    osc.connect(gain).connect(audioCtx!.destination);
    osc.start(start);
    osc.stop(start + 0.65);
  });
}

const INDIAN_NAMES = /neerja|prabhat|heera|ravi|swara|madhur|kalpana|hemant|veena|rishi|lekha/i;

function voiceScore(v: SpeechSynthesisVoice, want: "en" | "hi"): number {
  const lang = v.lang.replace("_", "-").toLowerCase();
  let s = 0;
  if (want === "hi") {
    if (lang.startsWith("hi")) s += 100;
  } else {
    if (lang === "en-in") s += 100;
    else if (lang.startsWith("en-gb")) s += 30;
    else if (lang.startsWith("en")) s += 20;
  }
  if (INDIAN_NAMES.test(v.name)) s += 20;
  if (/natural|online|google/i.test(v.name)) s += 10;
  return s;
}

function pickVoice(voices: SpeechSynthesisVoice[], want: "en" | "hi"): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = 0;
  for (const v of voices) {
    const sc = voiceScore(v, want);
    if (sc > bestScore) {
      bestScore = sc;
      best = v;
    }
  }
  return best;
}

/** Runs ``fn`` once voices are loaded (Chrome fills the list asynchronously). */
function withVoices(fn: (voices: SpeechSynthesisVoice[]) => void): void {
  const synth = globalThis.speechSynthesis;
  if (!synth) return;
  let done = false;
  const go = () => {
    if (done) return;
    const voices = synth.getVoices();
    if (voices.length === 0) return;
    done = true;
    fn(voices);
  };
  go();
  if (!done) {
    synth.addEventListener("voiceschanged", go, { once: true });
    globalThis.setTimeout(go, 300);
    globalThis.setTimeout(() => {
      if (!done) {
        done = true;
        fn([]);
      }
    }, 2000);
  }
}

function speakLines(lines: Line[], withChime: boolean, bigChime = false): void {
  const synth = globalThis.speechSynthesis;
  if (!synth || lines.length === 0) return;
  if (withChime) chime(bigChime);
  withVoices((voices) => {
    globalThis.setTimeout(
      () => {
        try {
          synth.resume();
          synth.cancel();
          for (const line of lines) {
            const utter = new SpeechSynthesisUtterance(line.text);
            const voice = pickVoice(voices, line.lang);
            if (voice) utter.voice = voice;
            utter.lang = voice?.lang ?? (line.lang === "hi" ? "hi-IN" : "en-IN");
            utter.rate = 0.95;
            synth.speak(utter);
          }
        } catch {
          // ignore browser speech errors
        }
      },
      withChime ? 750 : 0,
    );
  });
}

function hasHindiVoice(): boolean {
  return (globalThis.speechSynthesis?.getVoices() ?? []).some((v) => v.lang.toLowerCase().startsWith("hi"));
}

/** Hindi line for a token; romanised when the device has no Hindi voice so an English voice can read it. */
function hindiLine(tokenNumber: string, reminder: boolean): Line {
  if (hasHindiVoice()) {
    return {
      lang: "hi",
      text: reminder
        ? `टोकन नंबर ${tokenNumber}। आपका खाना अभी भी काउंटर पर आपका इंतज़ार कर रहा है। गरम-गरम ले जाइए!`
        : `टोकन नंबर ${tokenNumber}। आपका खाना तैयार है। कृपया काउंटर से ले लीजिए, धन्यवाद!`,
    };
  }
  return {
    lang: "en",
    text: reminder
      ? `Token number ${tokenNumber}. Aapka khaana abhi bhi counter par aapka intezaar kar raha hai.`
      : `Token number ${tokenNumber}. Aapka khaana taiyaar hai. Kripya counter se le lijiye. Dhanyavaad!`,
  };
}

/** Ready (or reminder) call for one token, in the chosen language mode, after a chime. */
export function announceToken(tokenNumber: string, english: string, mode: AnnounceLang, reminder = false): void {
  const lines: Line[] = [];
  if (mode !== "hi" && english.trim()) lines.push({ text: english.trim(), lang: "en" });
  if (mode !== "en") lines.push(hindiLine(tokenNumber, reminder));
  speakLines(lines, true);
}

/** Free-form English announcement (milestones). */
export function speakTmsAnnouncement(text: string, bigChime = false): void {
  if (!text.trim()) return;
  speakLines([{ text: text.trim(), lang: "en" }], true, bigChime);
}
