/**
 * Curated narration voices (T6.15). Kokoro voice ids; the worker passes the id straight through.
 */
export interface VoiceOption {
  id: string;
  name: string;
  gender: 'female' | 'male';
  accent: 'American' | 'British';
  description: string;
}

export const VOICES: VoiceOption[] = [
  { id: 'af_sarah', name: 'Sarah', gender: 'female', accent: 'American', description: 'Warm and steady — the safest default for fiction.' },
  { id: 'af_bella', name: 'Bella', gender: 'female', accent: 'American', description: 'Bright, expressive, good for thrillers.' },
  { id: 'af_nicole', name: 'Nicole', gender: 'female', accent: 'American', description: 'Soft and intimate, works for romance.' },
  { id: 'am_michael', name: 'Michael', gender: 'male', accent: 'American', description: 'Deep and measured, classic narrator.' },
  { id: 'am_adam', name: 'Adam', gender: 'male', accent: 'American', description: 'Conversational and quick.' },
  { id: 'bm_george', name: 'George', gender: 'male', accent: 'British', description: 'British, literary, unhurried.' },
  { id: 'bf_emma', name: 'Emma', gender: 'female', accent: 'British', description: 'British, crisp and modern.' },
  { id: 'bm_lewis', name: 'Lewis', gender: 'male', accent: 'British', description: 'British, wry and dry.' },
];

export const DEFAULT_VOICE = 'af_sarah';

export function findVoice(id: string): VoiceOption | undefined {
  return VOICES.find((voice) => voice.id === id);
}

/**
 * The voice to actually synthesise with. Older audiobooks may still carry an id the Replicate
 * Kokoro model rejects (f_heart), so anything not in the curated list falls back to the default.
 */
export function resolveVoice(id: string): VoiceOption {
  return findVoice(id) ?? (findVoice(DEFAULT_VOICE) as VoiceOption);
}
