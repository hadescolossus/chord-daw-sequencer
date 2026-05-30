import { Chord } from "../types";

export const ROOT_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const ALL_ROOT_NOTES = [
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"
];

export const ROOT_MAP: { [key: string]: number } = {
  "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
  "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11
};

export const CHORD_QUALITIES = [
  // Üçlüler & Temel (Triads & Basic)
  { id: "maj", name: "Major", intervals: [0, 4, 7] },
  { id: "min", name: "Minor", intervals: [0, 3, 7] },
  { id: "sus4", name: "Sus4", intervals: [0, 5, 7] },
  { id: "sus2", name: "Sus2", intervals: [0, 2, 7] },
  { id: "dim", name: "Diminished", intervals: [0, 3, 6] },
  { id: "aug", name: "Augmented", intervals: [0, 4, 8] },
  
  // 6'lılar (6th Chords)
  { id: "maj6", name: "Major 6", intervals: [0, 4, 7, 9] },
  { id: "min6", name: "Minor 6", intervals: [0, 3, 7, 9] },
  { id: "maj69", name: "6/9", intervals: [0, 4, 7, 9, 14] },
  { id: "min69", name: "m6/9", intervals: [0, 3, 7, 9, 14] },

  // 7'liler (7th Chords)
  { id: "maj7", name: "Major 7", intervals: [0, 4, 7, 11] },
  { id: "min7", name: "Minor 7", intervals: [0, 3, 7, 10] },
  { id: "dom7", name: "Dominant 7", intervals: [0, 4, 7, 10] },
  { id: "m7b5", name: "m7b5", intervals: [0, 3, 6, 10] },
  { id: "dim7", name: "Dim 7", intervals: [0, 3, 6, 9] },
  { id: "minMaj7", name: "m(Maj7)", intervals: [0, 3, 7, 11] },
  { id: "dom7sus4", name: "7sus4", intervals: [0, 5, 7, 10] },

  // 9'lular (9th Chords)
  { id: "maj9", name: "Major 9", intervals: [0, 4, 7, 11, 14] },
  { id: "min9", name: "Minor 9", intervals: [0, 3, 7, 10, 14] },
  { id: "dom9", name: "Dominant 9", intervals: [0, 4, 7, 10, 14] },
  { id: "add9", name: "Add 9", intervals: [0, 4, 7, 14] },
  { id: "madd9", name: "m(Add 9)", intervals: [0, 3, 7, 14] },

  // 11'lik & 13'lük (11th & 13th)
  { id: "min11", name: "Minor 11", intervals: [0, 3, 7, 10, 14, 17] },
  { id: "dom11", name: "Dominant 11", intervals: [0, 4, 7, 10, 14, 17] },
  { id: "maj13", name: "Major 13", intervals: [0, 4, 7, 11, 14, 21] },
  { id: "min13", name: "Minor 13", intervals: [0, 3, 7, 10, 14, 21] }
];

export function getMidiNumber(root: string, octave: number): number {
  const rootIndex = ROOT_MAP[root] !== undefined ? ROOT_MAP[root] : ROOT_NOTES.indexOf(root);
  return 12 * (octave + 1) + rootIndex;
}

export function getNoteName(midiNumber: number): string {
  const noteIndex = midiNumber % 12;
  const octave = Math.floor(midiNumber / 12) - 1;
  return `${ROOT_NOTES[noteIndex]}${octave}`;
}

export function getChordNotes(chord: Chord): { midiNumber: number; name: string }[] {
  const rootIndex = ROOT_MAP[chord.root] !== undefined ? ROOT_MAP[chord.root] : ROOT_NOTES.indexOf(chord.root);
  if (rootIndex === -1 || rootIndex === undefined) return [];

  const qualityObj = CHORD_QUALITIES.find((q) => q.id === chord.quality);
  if (!qualityObj) return [];

  // 1. Get base MIDI numbers for root positions
  const baseMidiNumbers = qualityObj.intervals.map((interval) => {
    return 12 * (chord.octave + 1) + rootIndex + interval;
  });

  // 2. Apply inversion
  // Inversion value k is constrained by the length of the chord
  const k = Math.min(chord.inversion, baseMidiNumbers.length - 1);
  const invertedMidiNumbers = [...baseMidiNumbers];

  for (let i = 0; i < k; i++) {
    const noteToMove = invertedMidiNumbers.shift();
    if (noteToMove !== undefined) {
      invertedMidiNumbers.push(noteToMove + 12);
    }
  }

  // 3. Always add an extremely deep absolute grounding root bass voice
  const rootBassMidi = getMidiNumber(chord.root, Math.max(1, chord.octave - 2));
  if (!invertedMidiNumbers.includes(rootBassMidi)) {
    invertedMidiNumbers.push(rootBassMidi);
  }

  // 4. Always add the custom-overridden (or default) bass note grounding
  const bassRootName = chord.bassRoot || chord.root;
  const bassOctave = Math.max(1, chord.octave - 2);
  const bassMidiNumber = getMidiNumber(bassRootName, bassOctave);

  if (!invertedMidiNumbers.includes(bassMidiNumber)) {
    invertedMidiNumbers.push(bassMidiNumber);
  }

  // Sort them so they are in ascending musical pitch order
  invertedMidiNumbers.sort((a, b) => a - b);

  return invertedMidiNumbers.map((midiNum) => ({
    midiNumber: midiNum,
    name: getNoteName(midiNum),
  }));
}

// Generate chord symbol (e.g., Cmaj7, Am/E, etc.)
export function getChordSymbol(chord: Chord): string {
  const qualitySymbolMap: { [key: string]: string } = {
    maj: "",
    min: "m",
    sus4: "sus4",
    sus2: "sus2",
    dim: "dim",
    aug: "aug",
    maj6: "6",
    min6: "m6",
    maj69: "6/9",
    min69: "m6/9",
    maj7: "maj7",
    min7: "m7",
    dom7: "7",
    m7b5: "m7b5",
    dim7: "dim7",
    minMaj7: "m(maj7)",
    dom7sus4: "7sus4",
    maj9: "maj9",
    min9: "m9",
    dom9: "9",
    add9: "add9",
    madd9: "madd9",
    min11: "m11",
    dom11: "11",
    maj13: "maj13",
    min13: "m13"
  };

  const qualSym = qualitySymbolMap[chord.quality] ?? chord.quality;
  const baseSymbol = `${chord.root}${qualSym}`;

  // If there is a custom bass root, display it as a slash chord!
  if (chord.bassRoot && chord.bassRoot !== chord.root) {
    return `${baseSymbol}/${chord.bassRoot}`;
  }

  if (chord.inversion === 0) {
    return baseSymbol;
  }

  // If there's an inversion, find the lowest note of the inverted upper structure (above the deep bass note)
  const notes = getChordNotes(chord);
  const upperNotes = notes.filter(n => n.midiNumber >= getMidiNumber(chord.root, chord.octave - 1));
  if (upperNotes.length > 0) {
    const bassNote = upperNotes[0].name.replace(/\d+/g, "");
    if (bassNote !== chord.root) {
      return `${baseSymbol}/${bassNote}`;
    }
  }

  return baseSymbol;
}

// Helper to check if a quality supports 3rd inversion (needs at least 4 notes)
export function supportsThirdInversion(quality: string): boolean {
  const qualityObj = CHORD_QUALITIES.find((q) => q.id === quality);
  return (qualityObj?.intervals.length ?? 0) >= 4;
}
