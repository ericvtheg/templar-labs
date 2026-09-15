let currentAudio: HTMLAudioElement | null = null;
export function stopSpeechPlayback() {
  currentAudio?.pause();
  currentAudio = null;
  if (typeof window !== "undefined") {
    window.speechSynthesis?.cancel();
  }
}
export function ownSpeechPlayback(audio: HTMLAudioElement) {
  if (currentAudio === audio) {
    return;
  }
  stopSpeechPlayback();
  currentAudio = audio;
}
export function releaseSpeechPlayback(audio: HTMLAudioElement | null) {
  if (!audio) {
    return;
  }
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  if (currentAudio === audio) {
    currentAudio = null;
  }
}
