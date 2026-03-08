import { useState, useCallback, useEffect, useRef } from "react";

export function useVoiceNarration() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setIsSupported("speechSynthesis" in window);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !voiceEnabled) return;

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 0.85;

      // Try to pick a good English voice
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Daniel"))
      );
      if (preferred) utterance.voice = preferred;
      else {
        const english = voices.find((v) => v.lang.startsWith("en"));
        if (english) utterance.voice = english;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, voiceEnabled]
  );

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const toggleVoice = useCallback(() => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    setVoiceEnabled((v) => !v);
  }, [isSpeaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  return { speak, stop, isSpeaking, isSupported, voiceEnabled, toggleVoice };
}
