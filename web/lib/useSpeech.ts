"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Browser-native voice via the Web Speech API — no keys, no deps. STT
// (SpeechRecognition) is supported in Chrome/Edge/Safari; TTS (speechSynthesis)
// is broadly supported. We degrade gracefully where unavailable. For
// higher-quality / cross-browser STT+TTS later, swap in Deepgram/ElevenLabs
// behind this same hook interface.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SpeechSupport {
  stt: boolean;
  tts: boolean;
}

export function useSpeech() {
  const [support, setSupport] = useState<SpeechSupport>({ stt: false, tts: false });
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    setSupport({ stt: !!SR, tts: "speechSynthesis" in window });
  }, []);

  // Start a single dictation. onResult fires with interim + final transcripts.
  const listen = useCallback(
    (onResult: (text: string, isFinal: boolean) => void) => {
      const w = window as any;
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!SR) return;
      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (e: any) => {
        let text = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          text += e.results[i][0].transcript;
        }
        const isFinal = e.results[e.results.length - 1].isFinal;
        onResult(text.trim(), isFinal);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      rec.start();
    },
    []
  );

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    // Strip raw URLs so they aren't read aloud character by character.
    const cleaned = text.replace(/https?:\/\/\S+/g, "the link");
    const u = new SpeechSynthesisUtterance(cleaned);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }, []);

  const cancelSpeech = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  return { support, listening, listen, stopListening, speak, cancelSpeech };
}
