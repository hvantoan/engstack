/**
 * Native Text-to-Speech using Web Speech API (zero external dependency).
 */
export function speakTerm(text: string, lang = "en-US") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = 0.9
    window.speechSynthesis.speak(utterance)
  } catch {
    // Ignore speech errors gracefully
  }
}
