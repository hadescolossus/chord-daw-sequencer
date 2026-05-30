export interface Chord {
  root: string;       // C, C#, D, D#, E, F, F#, G, G#, A, A#, B
  quality: string;    // maj, min, dim, aug, maj7, min7, dom7, sus4
  inversion: number;  // 0: Root, 1: 1st Inversion, 2: 2nd Inversion, 3: 3rd Inversion
  octave: number;     // 3, 4, 5
  bassRoot?: string;  // Custom bass note override (optional)
}

export interface Beat {
  chord: Chord | null; // Null means no chord / rest on this beat
  subBeats?: (Chord | null)[]; // Optional sub-beat chords (length is 2 or 4)
}

export interface Measure {
  id: string;
  timeSignature: string; // "4/4", "3/4", "2/4", "6/8" for backward compatibility
  division?: "1'lik" | "4'lük" | "8'lik"; // "1'lik" (1 beat), "4'lük" (4 beats), "8'lik" (8 beats)
  beats: Beat[];         // Length corresponds to division: 1'lik -> 1, 4'lük -> 4, 8'lik -> 8
}

export interface Preset {
  name: string;
  description: string;
  timeSignature: string;
  chords: { measureIndex: number; beatIndex: number; root: string; quality: string; inversion: number; octave: number }[];
}
