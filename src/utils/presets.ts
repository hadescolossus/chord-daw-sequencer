import { Preset } from "../types";

export const CHORD_PRESETS: Preset[] = [
  {
    name: "Classic Pop (I-V-vi-IV)",
    description: "Dünya genelinde yüzlerce hit şarkıda kullanılan evrensel akor dizilimi.",
    timeSignature: "4/4",
    chords: [
      { measureIndex: 0, beatIndex: 0, root: "C", quality: "maj", inversion: 0, octave: 4 }, // C
      { measureIndex: 1, beatIndex: 0, root: "G", quality: "maj", inversion: 1, octave: 4 }, // G (1st inversion for smooth transition)
      { measureIndex: 2, beatIndex: 0, root: "A", quality: "min", inversion: 0, octave: 4 }, // Am
      { measureIndex: 3, beatIndex: 0, root: "F", quality: "maj", inversion: 2, octave: 4 }, // F (2nd inversion for smooth transition)
    ],
  },
  {
    name: "Jazz ii-V-I (Yumuşak Akış)",
    description: "Zengin 7'li akorlar ve pürüzsüz ses geçişleri (voice leading) içeren caz dizilimi.",
    timeSignature: "4/4",
    chords: [
      { measureIndex: 0, beatIndex: 0, root: "D", quality: "min7", inversion: 0, octave: 4 }, // Dm7 (D F A C)
      { measureIndex: 1, beatIndex: 0, root: "G", quality: "dom7", inversion: 1, octave: 4 }, // G7 (B D F G - 1st inversion)
      { measureIndex: 2, beatIndex: 0, root: "C", quality: "maj7", inversion: 2, octave: 4 }, // Cmaj7 (G B C E - 2nd inversion)
      { measureIndex: 3, beatIndex: 0, root: "C", quality: "maj7", inversion: 2, octave: 4 }, // Holden
    ],
  },
  {
    name: "Epic Dark Progression (vi-IV-I-V)",
    description: "Sinematik ve heyecan uyandıran minör tabanlı güçlü akor geçişleri.",
    timeSignature: "4/4",
    chords: [
      { measureIndex: 0, beatIndex: 0, root: "A", quality: "min", inversion: 0, octave: 4 },  // Am
      { measureIndex: 1, beatIndex: 0, root: "F", quality: "maj", inversion: 1, octave: 4 },  // F
      { measureIndex: 2, beatIndex: 0, root: "C", quality: "maj", inversion: 0, octave: 4 },  // C
      { measureIndex: 3, beatIndex: 0, root: "G", quality: "maj", inversion: 2, octave: 4 },  // G
    ],
  },
  {
    name: "Sad Emotional Mood",
    description: "Duygusal ve melankolik parçalar oluşturmak için mükemmel bir zemin.",
    timeSignature: "4/4",
    chords: [
      { measureIndex: 0, beatIndex: 0, root: "F", quality: "maj7", inversion: 0, octave: 4 }, // Fmaj7
      { measureIndex: 1, beatIndex: 0, root: "G", quality: "dom7", inversion: 0, octave: 4 }, // G  
      { measureIndex: 2, beatIndex: 0, root: "E", quality: "min7", inversion: 1, octave: 4 }, // Em7
      { measureIndex: 3, beatIndex: 0, root: "A", quality: "min", inversion: 2, octave: 4 },  // Am
    ],
  },
  {
    name: "Waltz Melancolie (3/4)",
    description: "3/4'lük ritim yapısıyla hüzünlü ve akışkan klasik vals akorları.",
    timeSignature: "3/4",
    chords: [
      { measureIndex: 0, beatIndex: 0, root: "A", quality: "min", inversion: 0, octave: 4 }, // Am
      { measureIndex: 0, beatIndex: 1, root: "A", quality: "min", inversion: 1, octave: 4 },
      { measureIndex: 0, beatIndex: 2, root: "A", quality: "min", inversion: 1, octave: 4 },
      
      { measureIndex: 1, beatIndex: 0, root: "D", quality: "min", inversion: 0, octave: 4 }, // Dm
      { measureIndex: 1, beatIndex: 1, root: "D", quality: "min", inversion: 2, octave: 4 },
      { measureIndex: 1, beatIndex: 2, root: "D", quality: "min", inversion: 2, octave: 4 },

      { measureIndex: 2, beatIndex: 0, root: "E", quality: "maj", inversion: 0, octave: 4 }, // E Major
      { measureIndex: 2, beatIndex: 1, root: "E", quality: "maj", inversion: 1, octave: 4 },
      { measureIndex: 2, beatIndex: 2, root: "E", quality: "maj", inversion: 1, octave: 4 },

      { measureIndex: 3, beatIndex: 0, root: "A", quality: "min", inversion: 0, octave: 4 }, // Am
      { measureIndex: 3, beatIndex: 1, root: "A", quality: "min", inversion: 0, octave: 4 },
      { measureIndex: 3, beatIndex: 2, root: "A", quality: "min", inversion: 0, octave: 4 },
    ],
  },
];
