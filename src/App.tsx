import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Pause, 
  Square, 
  Repeat, 
  Plus, 
  Trash2, 
  Copy, 
  Download, 
  Music, 
  Sliders, 
  BookOpen, 
  Volume2, 
  Info, 
  Zap,
  RefreshCw,
  X,
  PlusCircle,
  Undo,
  Palette
} from "lucide-react";

import { Chord, Measure, Preset } from "./types";
import { 
  ROOT_NOTES, 
  ALL_ROOT_NOTES,
  CHORD_QUALITIES, 
  getChordNotes, 
  getChordSymbol, 
  supportsThirdInversion 
} from "./utils/chords";
import { downloadMidiFile } from "./utils/midi";
import { synth, SoundSourceType } from "./utils/audio";
import { CHORD_PRESETS } from "./utils/presets";
import { PianoRoll } from "./components/PianoRoll";

const PRESET_TIME_SIGNATURES = [
  "1/4", "2/4", "3/4", "4/4", "5/4", "6/4", "7/4", "8/4", "9/4", "10/4", "11/4", "12/4", "13/4", "14/4",
  "2/8", "3/8", "4/8", "5/8", "6/8", "7/8", "8/8", "9/8", "10/8", "11/8", "12/8", "13/8", "14/8",
  "7/16", "9/16"
];

const isValidTimeSignature = (sig: string): boolean => {
  const match = /^(\d+)\/(\d+)$/.exec(sig);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  const den = parseInt(match[2], 10);
  return num > 0 && num <= 32 && [1, 2, 4, 8, 16, 32].includes(den);
};

export default function App() {
  const [measures, setMeasures] = useState<Measure[]>(() => [
    { id: "m1", timeSignature: "4/4", beats: Array.from({ length: 4 }, () => ({ chord: null })) },
    { id: "m2", timeSignature: "4/4", beats: Array.from({ length: 4 }, () => ({ chord: null })) },
    { id: "m3", timeSignature: "4/4", beats: Array.from({ length: 4 }, () => ({ chord: null })) },
    { id: "m4", timeSignature: "4/4", beats: Array.from({ length: 4 }, () => ({ chord: null })) },
  ]);

  const [appTheme, setAppTheme] = useState<"emerald" | "amber" | "indigo">(
    () => (localStorage.getItem("chord-daw-theme") as "emerald" | "amber" | "indigo") || "emerald"
  );

  useEffect(() => {
    localStorage.setItem("chord-daw-theme", appTheme);
  }, [appTheme]);

  const [bpm, setBpm] = useState<number>(120);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(0.5);
  const [soundSource, setSoundSource] = useState<SoundSourceType>("vintage");
  const [defaultTimeSignature, setDefaultTimeSignature] = useState<string>("4/4");
  const [customTimeSignature, setCustomTimeSignature] = useState<string>("");
  const [customInputError, setCustomInputError] = useState<string | null>(null);

  // Selection states
  const [activeSelectedBeat, setActiveSelectedBeat] = useState<{
    measureIndex: number;
    beatIndex: number;
    subBeatIndex?: number;
  } | null>({ measureIndex: 0, beatIndex: 0 }); // Default editable beat

  const [currentSubBeatActiveIndex, setCurrentSubBeatActiveIndex] = useState<number | null>(null);
  const subbeatTimersRef = useRef<NodeJS.Timeout[]>([]);

  // Drag and drop states
  const [dragSource, setDragSource] = useState<{
    measureIndex: number;
    beatIndex: number;
    subBeatIndex?: number;
  } | null>(null);

  const [dragOverTarget, setDragOverTarget] = useState<{
    measureIndex: number;
    beatIndex: number;
    subBeatIndex?: number;
  } | null>(null);

  const [currentPlayhead, setCurrentPlayhead] = useState<{
    measureIndex: number;
    beatIndex: number;
  } | null>(null);

  const [activePlayingNotes, setActivePlayingNotes] = useState<number[]>([]);
  const [activeScaleRoot, setActiveScaleRoot] = useState<string>("C");
  const [activeScaleType, setActiveScaleType] = useState<"major" | "minor">("major");
  
  // Custom audio engine start warning banner state
  const [isSynthReady, setIsSynthReady] = useState(false);

  // Timekeepers and refs for the non-blocking playback loop
  const playheadRef = useRef<{ measureIndex: number; beatIndex: number }>({ measureIndex: 0, beatIndex: 0 });
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const bpmRef = useRef<number>(bpm);
  const loopRef = useRef<boolean>(isLooping);

  // Synced refs
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    loopRef.current = isLooping;
  }, [isLooping]);

  // Handle synth volume
  useEffect(() => {
    synth.setVolume(volume);
  }, [volume]);

  // Handle synth sound source
  useEffect(() => {
    synth.setSoundSource(soundSource);
  }, [soundSource]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Set initial volume
  useEffect(() => {
    // Warm startup note trigger or setup on click
    const handleGesture = () => {
      synth.init();
      setIsSynthReady(true);
      window.removeEventListener("click", handleGesture);
    };
    window.addEventListener("click", handleGesture);
    return () => window.removeEventListener("click", handleGesture);
  }, []);

  // Sequencer Playback Step Mechanism
  useEffect(() => {
    if (isPlaying) {
      // Start or preserve playback coordinate pointer
      let startM = 0;
      let startB = 0;
      
      if (currentPlayhead) {
        startM = currentPlayhead.measureIndex;
        startB = currentPlayhead.beatIndex;
      }
      
      playheadRef.current = { measureIndex: startM, beatIndex: startB };
 
      const runStep = () => {
        const { measureIndex, beatIndex } = playheadRef.current;
        setCurrentPlayhead({ measureIndex, beatIndex });
 
        // Clear any running subbeat visual update timers from the previous step
        subbeatTimersRef.current.forEach(clearTimeout);
        subbeatTimersRef.current = [];
 
        const activeMeasure = measures[measureIndex];
        let stepDurationSec = 60 / bpmRef.current; // fallback standard
 
        if (activeMeasure) {
          const sig = activeMeasure.timeSignature || "4/4";
          const parts = sig.split("/");
          const denominator = parseInt(parts[1], 10) || 4;
          stepDurationSec = (60 / bpmRef.current) * (4 / denominator);
 
          const beatObj = activeMeasure.beats[beatIndex];
          if (beatObj) {
            if (beatObj.subBeats && beatObj.subBeats.length > 0) {
              const subCount = beatObj.subBeats.length;
              const subDuration = stepDurationSec / subCount;
 
              beatObj.subBeats.forEach((subChord, subIdx) => {
                let midiNums: number[] = [];
                if (subChord) {
                  const notesObj = getChordNotes(subChord);
                  midiNums = notesObj.map((n) => n.midiNumber);
                  synth.playChord(midiNums, subDuration * 0.95, subIdx * subDuration);
                }
 
                // Schedule visual highlights at start of sub-beat
                const visTimer = setTimeout(() => {
                  setActivePlayingNotes(midiNums);
                  setCurrentSubBeatActiveIndex(subIdx);
                }, subIdx * subDuration * 1000);
                subbeatTimersRef.current.push(visTimer);
              });
            } else {
              setCurrentSubBeatActiveIndex(null);
              if (beatObj.chord) {
                // Calculate dynamic structural duration for this chord
                let durationBeats = 1;
                for (let i = beatIndex + 1; i < activeMeasure.beats.length; i++) {
                  const b = activeMeasure.beats[i];
                  if (b.chord || (b.subBeats && b.subBeats.length > 0)) {
                    break;
                  }
                  durationBeats++;
                }

                const notesObj = getChordNotes(beatObj.chord);
                const midiNums = notesObj.map((n) => n.midiNumber);
 
                // Play chord with full sustain duration matching empty beats
                synth.playChord(midiNums, durationBeats * stepDurationSec * 0.95);
                setActivePlayingNotes(midiNums);
              } else {
                // If it is an empty beat, scan backwards to see if there is an active preceding chord that sustains across it.
                // If found, keep its piano roll keys illuminated, but keep the synth silent (since it was already triggered).
                let sustainedChord: Chord | null = null;
                for (let i = beatIndex - 1; i >= 0; i--) {
                  const b = activeMeasure.beats[i];
                  if (b.chord) {
                    sustainedChord = b.chord;
                    break;
                  }
                  if (b.subBeats && b.subBeats.length > 0) {
                    break;
                  }
                }

                if (sustainedChord) {
                  const notesObj = getChordNotes(sustainedChord);
                  const midiNums = notesObj.map((n) => n.midiNumber);
                  setActivePlayingNotes(midiNums);
                } else {
                  setActivePlayingNotes([]);
                }
              }
            }
          } else {
            setCurrentSubBeatActiveIndex(null);
            setActivePlayingNotes([]);
          }
        }
 
        // Calculate next beat indices
        let nextMeasure = measureIndex;
        let nextBeat = beatIndex + 1;
 
        const currentActiveMeasure = measures[measureIndex];
        const currentSig = currentActiveMeasure?.timeSignature || "4/4";
        const totalMeasureBeats = parseInt(currentSig.split("/")[0], 10) || 4;
 
        if (nextBeat >= totalMeasureBeats) {
          nextBeat = 0;
          nextMeasure = measureIndex + 1;
        }
 
        if (nextMeasure >= measures.length) {
          if (loopRef.current) {
            nextMeasure = 0;
          } else {
            setIsPlaying(false);
            setCurrentPlayhead(null);
            setCurrentSubBeatActiveIndex(null);
            setActivePlayingNotes([]);
            return;
          }
        }
 
        playheadRef.current = { measureIndex: nextMeasure, beatIndex: nextBeat };
 
        // Schedule next ticker
        const nextMeasureObj = measures[nextMeasure];
        const nextSig = nextMeasureObj?.timeSignature || "4/4";
        const nextParts = nextSig.split("/");
        const nextDenominator = parseInt(nextParts[1], 10) || 4;
        const nextDurationSec = (60 / bpmRef.current) * (4 / nextDenominator);
        const delayMs = nextDurationSec * 1000;
 
        timerRef.current = setTimeout(runStep, delayMs);
      };
 
      runStep();
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      subbeatTimersRef.current.forEach(clearTimeout);
      subbeatTimersRef.current = [];
      setCurrentSubBeatActiveIndex(null);
      setActivePlayingNotes([]);
    }
 
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      subbeatTimersRef.current.forEach(clearTimeout);
      subbeatTimersRef.current = [];
    };
  }, [isPlaying, measures]);

  // Utility to obtain currently edited chord or create default target
  const getSelectedChord = (): Chord | null => {
    if (!activeSelectedBeat) return null;
    const { measureIndex, beatIndex, subBeatIndex } = activeSelectedBeat;
    const beat = measures[measureIndex]?.beats[beatIndex];
    if (beat) {
      if (typeof subBeatIndex === "number" && beat.subBeats) {
        return beat.subBeats[subBeatIndex] || null;
      }
      return beat.chord || null;
    }
    return null;
  };

  // Preview Chord helper
  const triggerChordPreview = (chord: Chord) => {
    synth.init();
    setIsSynthReady(true);
    const notes = getChordNotes(chord);
    const midiNums = notes.map((n) => n.midiNumber);
    synth.playChord(midiNums, 0.5);
    setActivePlayingNotes(midiNums);
    // Dim the notes lighting up on the keyboard after some time
    setTimeout(() => {
      setActivePlayingNotes((prev) => {
        // Only clear if the playing notes match this chord (prevent overlap clear-out)
        const currentSymbol = notes.map(n => n.midiNumber).join(",");
        const prevSymbol = prev.join(",");
        return currentSymbol === prevSymbol ? [] : prev;
      });
    }, 500);
  };

  // Update specific selected beat's chord settings
  const updateSelectedChord = (updates: Partial<Chord> | null) => {
    if (!activeSelectedBeat) return;
    const { measureIndex, beatIndex, subBeatIndex } = activeSelectedBeat;

    const beatObj = measures[measureIndex].beats[beatIndex];
    const currentChordObj = (typeof subBeatIndex === "number" && beatObj.subBeats)
      ? beatObj.subBeats[subBeatIndex]
      : beatObj.chord;

    let newChord: Chord | null = null;

    if (updates !== null) {
      if (currentChordObj) {
        newChord = { ...currentChordObj, ...updates } as Chord;
      } else {
        // Fallback default chord values
        newChord = {
          root: "C",
          quality: "maj",
          inversion: 0,
          octave: 4,
          ...updates,
        } as Chord;
      }

      // Constrain inversion if quality notes density changes
      // e.g. from 7-chord (4 notes) to triad (3 notes), 3rd inversion is reset to 2nd inversion.
      if (!supportsThirdInversion(newChord.quality) && newChord.inversion === 3) {
        newChord.inversion = 2;
      }

      // Instantly trigger preview of updated chord
      triggerChordPreview(newChord);
    }

    setMeasures(
      measures.map((measure, mIdx) => {
        if (mIdx !== measureIndex) return measure;
        const newBeats = measure.beats.map((beat, bIdx) => {
          if (bIdx !== beatIndex) return beat;
          if (typeof subBeatIndex === "number" && beat.subBeats) {
            const newSubBeats = [...beat.subBeats];
            newSubBeats[subBeatIndex] = newChord;
            return { ...beat, subBeats: newSubBeats };
          } else {
            return { ...beat, chord: newChord };
          }
        });
        return { ...measure, beats: newBeats };
      })
    );
  };

  // Transport control triggers
  const playSeq = () => {
    synth.init();
    setIsSynthReady(true);
    setIsPlaying(true);
  };

  const pauseSeq = () => {
    setIsPlaying(false);
  };

  const stopSeq = () => {
    setIsPlaying(false);
    setCurrentPlayhead(null);
    setCurrentSubBeatActiveIndex(null);
    setActivePlayingNotes([]);
    subbeatTimersRef.current.forEach(clearTimeout);
    subbeatTimersRef.current = [];
  };

  // Manage Measures
  const handleTimeSignatureChange = (newSig: string) => {
    if (!isValidTimeSignature(newSig)) return;
    setDefaultTimeSignature(newSig);

    const parts = newSig.split("/");
    const numBeats = parseInt(parts[0], 10) || 4;

    setMeasures((prev) =>
      prev.map((m) => {
        // Carry over existing chords up to boundary, fill remaining with { chord: null }
        const updatedBeats = Array.from({ length: numBeats }, (_, bIdx) => {
          return m.beats[bIdx] || { chord: null };
        });
        return {
          ...m,
          timeSignature: newSig,
          beats: updatedBeats,
        };
      })
    );

    // Safeguard active selected beat
    if (activeSelectedBeat && activeSelectedBeat.beatIndex >= numBeats) {
      setActiveSelectedBeat({ measureIndex: activeSelectedBeat.measureIndex, beatIndex: 0 });
    }
  };

  const addMeasure = () => {
    const parts = defaultTimeSignature.split("/");
    const numBeats = parseInt(parts[0], 10) || 4;
    const newMeasure: Measure = {
      id: `m_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timeSignature: defaultTimeSignature,
      beats: Array.from({ length: numBeats }, () => ({ chord: null })),
    };
    setMeasures([...measures, newMeasure]);
  };

  const deleteMeasure = (measureIndex: number) => {
    if (measures.length <= 1) return; // Must have at least one measure
    const filtered = measures.filter((_, idx) => idx !== measureIndex);
    setMeasures(filtered);

    // If active selected beat was inside deleted measure, move selection safely
    if (activeSelectedBeat && activeSelectedBeat.measureIndex >= filtered.length) {
      setActiveSelectedBeat({ measureIndex: filtered.length - 1, beatIndex: 0 });
    }
  };

  const clearMeasure = (measureIndex: number) => {
    setMeasures(
      measures.map((m, idx) => {
        if (idx !== measureIndex) return m;
        return {
          ...m,
          beats: m.beats.map(() => ({ chord: null })),
        };
      })
    );
  };

  const cloneMeasure = (measureIndex: number) => {
    const target = measures[measureIndex];
    if (!target) return;

    // Deep copy beats
    const clonedBeats = target.beats.map((b) => ({
      chord: b.chord ? { ...b.chord } : null,
      subBeats: b.subBeats ? b.subBeats.map(sc => sc ? { ...sc } : null) : undefined,
    }));

    const newMeasure: Measure = {
      id: `m_${Date.now()}_cloned`,
      timeSignature: target.timeSignature,
      beats: clonedBeats,
    };

    const updated = [...measures];
    updated.splice(measureIndex + 1, 0, newMeasure);
    setMeasures(updated);
  };

  const setBeatSubdivision = (measureIndex: number, beatIndex: number, subCount: 1 | 2 | 4) => {
    setMeasures(
      measures.map((measure, mIdx) => {
        if (mIdx !== measureIndex) return measure;
        const newBeats = measure.beats.map((beat, bIdx) => {
          if (bIdx !== beatIndex) return beat;
          
          if (subCount === 1) {
            // Join back to single chord beat
            const fallbackChord = beat.subBeats && beat.subBeats.length > 0 ? beat.subBeats[0] : beat.chord;
            return {
              chord: fallbackChord,
              subBeats: undefined
            };
          } else {
            // Subdivide into 2 or 4 smaller segments
            let initialSubBeats: (Chord | null)[] = [];
            const originalChord = beat.chord;
            if (beat.subBeats && beat.subBeats.length > 0) {
              // Convert existing subBeats array to target length
              for (let i = 0; i < subCount; i++) {
                initialSubBeats.push(beat.subBeats[i % beat.subBeats.length] || null);
              }
            } else {
              // First time dividing: copy original chord onto the first slot
              initialSubBeats.push(originalChord);
              for (let i = 1; i < subCount; i++) {
                initialSubBeats.push(null);
              }
            }
            return {
              chord: null, // Clear single chord field when subdivided
              subBeats: initialSubBeats
            };
          }
        });
        return { ...measure, beats: newBeats };
      })
    );

    // Synchronize selected beat target
    if (subCount === 1) {
      setActiveSelectedBeat({ measureIndex, beatIndex });
    } else {
      setActiveSelectedBeat({ measureIndex, beatIndex, subBeatIndex: 0 });
    }
  };

  const updateIndividualMeasureTimeSignature = (mIdx: number, newSig: string) => {
    if (!isValidTimeSignature(newSig)) return;
    const parts = newSig.split("/");
    const numBeats = parseInt(parts[0], 10) || 4;
    
    setMeasures(
      measures.map((m, idx) => {
        if (idx !== mIdx) return m;

        // Carry existing chords up to boundary
        const updatedBeats = Array.from({ length: numBeats }, (_, bIdx) => {
          return m.beats[bIdx] || { chord: null };
        });

        return {
          ...m,
          timeSignature: newSig,
          beats: updatedBeats,
        };
      })
    );

    // Safeguard selected beat coordinate
    if (activeSelectedBeat && activeSelectedBeat.measureIndex === mIdx && activeSelectedBeat.beatIndex >= numBeats) {
      setActiveSelectedBeat({ measureIndex: mIdx, beatIndex: 0 });
    }
  };

  // Presets load trigger
  const loadPresetProgression = (preset: Preset) => {
    setDefaultTimeSignature("4/4");
    stopSeq();

    const maxPresetMeasureIndex = Math.max(...preset.chords.map((c) => c.measureIndex));
    const size = Math.max(4, maxPresetMeasureIndex + 1);

    const generatedMeasures: Measure[] = Array.from({ length: size }, (_, mIdx) => {
      const numBeats = 4; // standard 4'lük division for pop presets
      
      const beatsList = Array.from({ length: numBeats }, (_, bIdx) => {
        const match = preset.chords.find(
          (pc) => pc.measureIndex === mIdx && pc.beatIndex === bIdx
        );

        return {
          chord: match
            ? {
                root: match.root,
                quality: match.quality,
                inversion: match.inversion,
                octave: match.octave,
              }
            : null,
        };
      });

      return {
        id: `m_preset_${mIdx}_${Date.now()}`,
        timeSignature: "4/4",
        beats: beatsList,
      };
    });

    setMeasures(generatedMeasures);
    setActiveSelectedBeat({ measureIndex: 0, beatIndex: 0 });
    
    // Quick success chime
    synth.init();
    setIsSynthReady(true);
  };

  const handleChordDrop = (
    targetM: number,
    targetB: number,
    targetS?: number,
    forceCopy?: boolean
  ) => {
    if (!dragSource) return;
    const { measureIndex: sourceM, beatIndex: sourceB, subBeatIndex: sourceS } = dragSource;

    // Prevent dropping on self
    if (sourceM === targetM && sourceB === targetB && sourceS === targetS) {
      setDragSource(null);
      setDragOverTarget(null);
      return;
    }

    const sourceMeasure = measures[sourceM];
    if (!sourceMeasure) return;
    const sourceBeat = sourceMeasure.beats[sourceB];
    if (!sourceBeat) return;

    let chordToCopy: Chord | null = null;
    if (typeof sourceS === "number" && sourceBeat.subBeats) {
      chordToCopy = sourceBeat.subBeats[sourceS];
    } else {
      chordToCopy = sourceBeat.chord;
    }

    if (!chordToCopy) return;

    // Deep copy
    const copiedChord: Chord = { ...chordToCopy };

    setMeasures(
      measures.map((measure, mIdx) => {
        let updatedBeats = [...measure.beats];

        // 1. If this is the SOURCE measure and we are MOVING (not copying), clear the source
        if (!forceCopy && mIdx === sourceM) {
          updatedBeats = updatedBeats.map((beat, bIdx) => {
            if (bIdx !== sourceB) return beat;
            if (typeof sourceS === "number" && beat.subBeats) {
              const newSub = [...beat.subBeats];
              newSub[sourceS] = null;
              return { ...beat, subBeats: newSub };
            } else {
              return { ...beat, chord: null };
            }
          });
        }

        // 2. If this is the TARGET measure, apply the chord to target
        if (mIdx === targetM) {
          updatedBeats = updatedBeats.map((beat, bIdx) => {
            if (bIdx !== targetB) return beat;

            if (typeof targetS === "number" && beat.subBeats) {
              const newSub = [...beat.subBeats];
              newSub[targetS] = copiedChord;
              return { ...beat, subBeats: newSub };
            } else if (beat.subBeats && beat.subBeats.length > 0 && typeof targetS !== "number") {
              const newSub = [...beat.subBeats];
              newSub[0] = copiedChord;
              return { ...beat, subBeats: newSub };
            } else {
              return { ...beat, chord: copiedChord, subBeats: undefined };
            }
          });
        }

        return { ...measure, beats: updatedBeats };
      })
    );

    // Clean up drag state
    setDragSource(null);
    setDragOverTarget(null);

    // Trigger brief preview of dropped chord
    triggerChordPreview(copiedChord);
  };

  // Clean MIDI Downloader trigger
  const handleMidiExport = () => {
    downloadMidiFile(measures, bpm, "akor-da-sekansi.mid");
  };

  // Reset Everything Helper
  const handleClearAll = () => {
    stopSeq();
    setMeasures([
      { id: "m1", timeSignature: "4/4", division: "4'lük", beats: Array.from({ length: 4 }, () => ({ chord: null })) },
    ]);
    setActiveSelectedBeat({ measureIndex: 0, beatIndex: 0 });
  };

  // Scale degrees helper definition
  const MAJOR_SCALE_DEGREES = [
    { degree: "I", offset: 0, quality: "maj", roman: "I", bg: "hover:border-emerald-500 hover:bg-emerald-950/20" },
    { degree: "ii", offset: 2, quality: "min", roman: "ii", bg: "hover:border-zinc-500 hover:bg-zinc-800/30" },
    { degree: "iii", offset: 4, quality: "min", roman: "iii", bg: "hover:border-zinc-500 hover:bg-zinc-800/30" },
    { degree: "IV", offset: 5, quality: "maj", roman: "IV", bg: "hover:border-teal-500 hover:bg-teal-950/20" },
    { degree: "V", offset: 7, quality: "maj", roman: "V", bg: "hover:border-amber-500 hover:bg-amber-950/20" },
    { degree: "vi", offset: 9, quality: "min", roman: "vi", bg: "hover:border-indigo-500 hover:bg-indigo-950/20" },
    { degree: "vii°", offset: 11, quality: "dim", roman: "vii°", bg: "hover:border-rose-500 hover:bg-rose-950/20" },
  ];

  const MINOR_SCALE_DEGREES = [
    { degree: "i", offset: 0, quality: "min", roman: "i", bg: "hover:border-indigo-500 hover:bg-indigo-950/20" },
    { degree: "ii°", offset: 2, quality: "dim", roman: "ii°", bg: "hover:border-rose-500 hover:bg-rose-950/20" },
    { degree: "III", offset: 3, quality: "maj", roman: "III", bg: "hover:border-emerald-500 hover:bg-emerald-950/20" },
    { degree: "iv", offset: 5, quality: "min", roman: "iv", bg: "hover:border-zinc-500 hover:bg-zinc-800/30" },
    { degree: "v", offset: 7, quality: "min", roman: "v", bg: "hover:border-zinc-500 hover:bg-zinc-800/30" },
    { degree: "VI", offset: 8, quality: "maj", roman: "VI", bg: "hover:border-teal-500 hover:bg-teal-950/20" },
    { degree: "VII", offset: 10, quality: "maj", roman: "VII", bg: "hover:border-amber-500 hover:bg-amber-950/20" },
  ];

  // Load degree chords instantly based on selected tonality (activeScaleRoot + activeScaleType)
  const applyScaleDegreeChord = (offset: number, quality: string) => {
    const rootIndex = ROOT_NOTES.indexOf(activeScaleRoot);
    if (rootIndex === -1) return;

    const degreeRootNote = ROOT_NOTES[(rootIndex + offset) % 12];
    
    // Choose sensible octave (e.g., C Major -> vii° B is in B3 so that it doesn't sound too squeaky, standard is 4)
    let octaveVal = 4;
    // Lower upper scale root chords if they reach too high
    const calculatedIndex = rootIndex + offset;
    if (calculatedIndex >= 8) {
      octaveVal = 3; // keep voices in comfortable mid-range
    }

    updateSelectedChord({
      root: degreeRootNote,
      quality: quality,
      inversion: 0,
      octave: octaveVal,
    });
  };

  const selectedChord = getSelectedChord();
  const currentDetails = selectedChord ? getChordNotes(selectedChord) : [];

  // Theme configuration values for the 3 beautiful styles
  const primaryColor = appTheme === "indigo" ? "#6366f1" : appTheme === "amber" ? "#f59e0b" : "#10b981";
  const primaryHover = appTheme === "indigo" ? "#818cf8" : appTheme === "amber" ? "#fbbf24" : "#34d399";
  const primaryGlow = appTheme === "indigo" ? "rgba(99, 102, 241, 0.15)" : appTheme === "amber" ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)";
  const primaryGlowHeavy = appTheme === "indigo" ? "rgba(99, 102, 241, 0.3)" : appTheme === "amber" ? "rgba(245, 158, 11, 0.3)" : "rgba(16, 185, 129, 0.3)";
  const primaryBorderGlow = appTheme === "indigo" ? "rgba(99, 102, 241, 0.4)" : appTheme === "amber" ? "rgba(245, 158, 11, 0.4)" : "rgba(16, 185, 129, 0.4)";
  const primaryMutedBg = appTheme === "indigo" ? "rgba(99, 102, 241, 0.05)" : appTheme === "amber" ? "rgba(245, 158, 11, 0.05)" : "rgba(16, 185, 129, 0.05)";
  const selectionBg = appTheme === "indigo" ? "rgba(99, 102, 241, 0.2)" : appTheme === "amber" ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.2)";

  return (
    <div id="main-applet-container" className="min-h-screen bg-[#050505] text-[#d1d5db] flex flex-col font-sans selection:bg-emerald-500/20">
      
      {/* Dynamic Theme Styles Injection */}
      <style>{`
        :root {
          --primary-color: ${primaryColor};
          --primary-color-hover: ${primaryHover};
          --primary-glow: ${primaryGlow};
          --primary-glow-heavy: ${primaryGlowHeavy};
          --primary-border-glow: ${primaryBorderGlow};
          --selection-bg: ${selectionBg};
        }

        /* Fully styled custom classes map to theme */
        .text-emerald-400, .group-hover\\:text-emerald-400:hover, .hover\\:text-emerald-400:hover {
          color: ${primaryColor} !important;
        }
        .text-emerald-500, .group-hover\\:text-emerald-500:hover, .hover\\:text-emerald-500:hover, .text-emerald-450 {
          color: ${primaryColor} !important;
        }
        .bg-emerald-500, .hover\\:bg-emerald-500:hover, .group-hover\\:bg-emerald-500:hover {
          background-color: ${primaryColor} !important;
        }
        .bg-emerald-500\\/10, .bg-\\[\\#0b100b\\]\\/40 {
          background-color: ${primaryGlow} !important;
        }
        .bg-emerald-500\\/20 {
          background-color: ${primaryGlowHeavy} !important;
        }
        .bg-emerald-500\\/25, .bg-emerald-505\\/10 {
          background-color: ${primaryMutedBg} !important;
        }
        .border-emerald-500\\/20, .border-emerald-500\\/30, .border-emerald-500\\/35, .border-emerald-900\\/30 {
          border-color: ${primaryBorderGlow} !important;
        }
        .border-emerald-500\\/40, .border-emerald-500\\/45, .border-emerald-400 {
          border-color: ${primaryColor} !important;
        }
        .border-emerald-500\\/80 {
          border-color: ${primaryColor} !important;
        }
        .accent-emerald-500 {
          accent-color: ${primaryColor} !important;
        }
        .shadow-\\[0_0_12px_rgba\\(16\\,185\\,129\\,0\\.15\\)\\] {
          box-shadow: 0 0 12px ${primaryGlowHeavy} !important;
        }
        .shadow-\\[0_0_15px_rgba\\(16\\,185\\,129\\,0\\.25\\)\\] {
          box-shadow: 0 0 15px ${primaryGlowHeavy} !important;
        }
        .hover\\:shadow-\\[0_0_20px_rgba\\(16\\,185\\,129\\,0\\.4\\)\\]:hover {
          box-shadow: 0 0 20px ${primaryGlowHeavy} !important;
        }
        .hover\\:border-emerald-500\\/30:hover {
          border-color: ${primaryBorderGlow} !important;
        }
        .shadow-\\[inset_0_0_10px_rgba\\(16\\,185\\,129\\,0\\.1\\)\\] {
          box-shadow: inset 0 0 10px ${primaryGlow} !important;
        }
        .hover\\:border-emerald-500:hover {
          border-color: ${primaryColor} !important;
        }
        .hover\\:bg-emerald-950\\/20:hover {
          background-color: ${primaryGlow} !important;
        }
        .selection\\:bg-emerald-500\\/20::selection {
          background-color: ${selectionBg} !important;
        }

        /* Premium drag-over transition animation */
        @keyframes dragOverPulse {
          0% { transform: scale(1.00); box-shadow: 0 0 0 0 ${primaryBorderGlow}; }
          50% { transform: scale(1.04); box-shadow: 0 0 16px 5px ${primaryGlowHeavy}; border-color: ${primaryColor} !important; }
          100% { transform: scale(1.00); box-shadow: 0 0 0 0 ${primaryBorderGlow}; }
        }
        .drag-over-scale-pulse {
          animation: dragOverPulse 0.75s infinite ease-in-out !important;
          border-style: dashed !important;
          border-width: 2px !important;
          border-color: ${primaryColor} !important;
          background-color: ${primaryGlow} !important;
        }
      `}</style>
      
      {/* Dynamic Glassy Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-[#222] px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 text-emerald-500 font-display">
            <Music className="h-6 w-6" id="app-logo-main" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex flex-wrap items-center gap-x-2 gap-y-1 font-display">
              <span>Chord DAW Sequencer</span>
              <span className="text-xs font-medium text-zinc-400 font-sans normal-case">
                By: Ersin BsGeN
              </span>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                MIDI LAB
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Akorlarınızı ölçü bazında sırayla yazın, çevrimleyin ve profesyonel MIDI indirin
            </p>
          </div>
        </div>

        {/* Global Action Handlers */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Theme Selector (Pill controls) */}
          <div className="flex items-center bg-[#111] border border-[#222] p-1 rounded-xl gap-1" id="global-theme-switcher">
            <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono px-2 hidden sm:inline-block">
              Tema:
            </div>
            <button
              onClick={() => setAppTheme("emerald")}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                appTheme === "emerald" 
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold" 
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
              title="Zümrüt Yeşili (Midnight Emerald)"
            >
              <span className="h-2 w-2 rounded-full bg-[#10b981]" />
              <span className="text-[10px]">Zümrüt</span>
            </button>
            <button
              onClick={() => setAppTheme("amber")}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                appTheme === "amber" 
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold" 
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
              title="Klasik Kehribar (Vintage Amber)"
            >
              <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
              <span className="text-[10px]">Kehribar</span>
            </button>
            <button
              onClick={() => setAppTheme("indigo")}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                appTheme === "indigo" 
                  ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-semibold" 
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
              title="Derin Safir (Cosmic Indigo)"
            >
              <span className="h-2 w-2 rounded-full bg-[#6366f1]" />
              <span className="text-[10px]">Safir</span>
            </button>
          </div>

          {!isSynthReady && (
            <button
              onClick={() => {
                synth.init();
                setIsSynthReady(true);
              }}
              id="init-audio-button"
              className="text-xs bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/20 font-bold font-mono px-3.5 py-2 rounded-xl flex items-center gap-2 cursor-pointer transition-all uppercase tracking-wider"
            >
              <Volume2 className="h-3.5 w-3.5 animate-bounce" />
              Sesi Aktifleştir (Click to Unmute)
            </button>
          )}

          <button
            onClick={handleMidiExport}
            id="export-midi-button-main"
            className="text-xs bg-emerald-500 hover:bg-emerald-400 text-black font-semibold uppercase tracking-wider px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.25)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-pointer transition-all active:scale-[0.98]"
            title="Tüm akor sekansını MIDI dosyası olarak indirir"
          >
            <Download className="h-4 w-4" />
            MIDI Dosyası İndir (.mid)
          </button>

          <button
            onClick={handleClearAll}
            id="clear-all-progression"
            className="text-xs text-zinc-400 hover:text-rose-400 hover:bg-rose-955/10 border border-[#222] hover:border-rose-900/30 px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer font-mono uppercase tracking-wider"
            title="Tüm ölçüleri sıfırlar"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Temizle
          </button>
        </div>
      </header>

      {/* Main Container Dashboard Split */}
      <main className="flex-1 p-6 max-w-[1700px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: DAW TIMELINE & TRACKS CONTROLS (8/12 layout) */}
        <div className="lg:col-span-8 flex flex-col gap-6 w-full">
          
          {/* DAW Transport Panel (Play / Pause / BPM Selector) */}
          <section className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
            {/* Transport controls */}
            <div className="flex items-center gap-3">
              {isPlaying ? (
                <button
                  onClick={pauseSeq}
                  id="transport-pause-button"
                  className="h-12 w-12 rounded-xl bg-[#111] hover:bg-[#161616] border border-[#222] text-white flex items-center justify-center transition-all cursor-pointer active:scale-[0.95]"
                  title="Durdur (Space)"
                >
                  <Pause className="h-5 w-5 text-amber-500" />
                </button>
              ) : (
                <button
                  onClick={playSeq}
                  id="transport-play-button"
                  className="h-12 w-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center transition-all shadow-[0_0_12px_rgba(16,185,129,0.25)] hover:shadow-[0_0_18px_rgba(16,185,129,0.4)] cursor-pointer active:scale-[0.95]"
                  title="Başlat"
                >
                  <Play className="h-5 w-5 fill-current text-white" />
                </button>
              )}

              <button
                onClick={stopSeq}
                id="transport-stop-button"
                className="h-12 w-12 rounded-xl bg-[#111] hover:bg-[#161616] border border-[#222] text-zinc-300 flex items-center justify-center transition-all cursor-pointer active:scale-[0.95]"
                title="Sıfırla"
              >
                <Square className="h-5 w-5 fill-current text-zinc-400" />
              </button>

              <button
                onClick={() => setIsLooping(!isLooping)}
                id="transport-loop-button"
                className={`h-12 w-[60px] rounded-xl flex items-center justify-center gap-1.5 border text-xs font-mono font-bold cursor-pointer transition-all uppercase tracking-wider ${
                  isLooping 
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" 
                    : "bg-[#111] text-zinc-500 border-[#222]"
                }`}
                title="Döngü Modu"
              >
                <Repeat className={`h-4 w-4 ${isLooping ? "animate-spin-slow" : ""}`} />
                Rpt
              </button>
            </div>

            {/* BPM slider control */}
            <div className="flex items-center gap-4 bg-[#111] border border-[#222] px-5 py-2.5 rounded-xl w-full sm:w-auto">
              <Sliders className="h-4 w-4 text-zinc-400 shrink-0" />
              <div className="flex flex-col flex-1 sm:w-40">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase font-mono">Tempo</span>
                  <span className="text-sm font-mono font-bold text-white flex items-center">
                    {bpm} <span className="text-[10px] text-zinc-500 ml-1">BPM</span>
                  </span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="240"
                  value={bpm}
                  onChange={(e) => setBpm(parseInt(e.target.value))}
                  id="bpm-slider"
                  className="accent-emerald-500 h-1 rounded-lg w-full cursor-pointer bg-[#222]"
                />
              </div>
            </div>

            {/* Time signature / division default selector */}
            <div className="flex flex-col gap-1.5 w-full sm:w-auto shrink-0 font-medium font-mono text-xs">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Şarkı Zaman Ölçüsü (Time Signature)</span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={PRESET_TIME_SIGNATURES.includes(defaultTimeSignature) ? defaultTimeSignature : "custom"}
                  onChange={(e) => {
                    if (e.target.value !== "custom") {
                      handleTimeSignatureChange(e.target.value);
                      setCustomInputError(null);
                    }
                  }}
                  id="global-time-signature"
                  className="bg-[#111] border border-[#222] text-zinc-200 px-3 py-2 rounded-xl text-xs font-bold focus:outline-none focus:border-emerald-500/50 cursor-pointer min-w-[100px]"
                >
                  <optgroup label="Seçenekler">
                    {PRESET_TIME_SIGNATURES.map((sig) => (
                      <option key={sig} value={sig}>
                        {sig}
                      </option>
                    ))}
                  </optgroup>
                  <option value="custom">Özel Zaman Yaz...</option>
                </select>

                <div className="flex items-center gap-1.5 border border-[#222] bg-[#0c0c0e] rounded-xl px-2 py-1 relative">
                  <input
                    type="text"
                    placeholder="Örn: 11/16"
                    value={customTimeSignature}
                    onChange={(e) => {
                      setCustomTimeSignature(e.target.value);
                      setCustomInputError(null);
                    }}
                    id="custom-timesig-input"
                    className="bg-transparent text-white placeholder-zinc-650 text-xs w-20 focus:outline-none font-bold"
                    title="Herhangi bir zaman ölçüsü girin (örn: 11/16 veya 15/8)"
                  />
                  <button
                    onClick={() => {
                      if (isValidTimeSignature(customTimeSignature)) {
                        handleTimeSignatureChange(customTimeSignature);
                        setCustomInputError(null);
                      } else {
                        setCustomInputError("Geçersiz! Örn: 11/16");
                      }
                    }}
                    id="apply-custom-timesig"
                    className="px-2 py-1 text-[9px] uppercase font-bold tracking-wider font-sans rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black transition-colors cursor-pointer"
                  >
                    Uygula
                  </button>
                  {customInputError && (
                    <div className="absolute top-10 left-0 bg-rose-950/90 text-rose-300 border border-rose-900 px-2 py-1 rounded text-[9px] font-sans font-semibold whitespace-nowrap z-50 shadow-md">
                      {customInputError}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Ses Kaynağı Seçici */}
            <div className="flex flex-col gap-1.5 w-full sm:w-auto shrink-0 font-medium font-mono text-xs">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Ses Enstrümanı (Sound Engine)</span>
              <div className="flex border border-[#222] rounded-xl overflow-hidden bg-[#111] p-0.5">
                {([
                  { key: "vintage", label: "Vintage Synth", short: "Synth" },
                  { key: "rhodes", label: "Rhodes", short: "Rhodes" },
                  { key: "pad", label: "Ambient Pad", short: "Pad" },
                  { key: "strings", label: "Warm Strings", short: "Strings" }
                ] as const).map(({ key, label, short }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSoundSource(key);
                      synth.setSoundSource(key);
                      synth.playSingleNote(60, 0.4);
                    }}
                    id={`sound-source-${key}`}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      soundSource === key
                        ? "bg-[#222] text-emerald-400 font-bold shadow-sm border border-[#333]/40"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                    title={label}
                  >
                    <span className="hidden md:inline">{label}</span>
                    <span className="inline md:hidden">{short}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
              {/* Measuring Grid (Timeline Track) */}
          <section className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-6 flex flex-col gap-5 relative shadow-xl">
            <div className="flex items-center justify-between border-b border-[#222]/60 pb-3">
              <h2 className="text-xs font-bold text-zinc-300 tracking-wider uppercase flex items-center gap-2 font-display">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                Ölçü Akor Sekanseri
              </h2>
              <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
                {currentPlayhead !== null && (
                  <div className="bg-emerald-500/10 text-emerald-400 px-3 py-1.5 border border-emerald-500/20 rounded-xl flex items-center gap-1.5 animate-pulse font-mono font-bold text-[10px] uppercase tracking-wider">
                    <span>Oynatılıyor:</span>
                    <strong className="text-white">
                      Ölçü {currentPlayhead.measureIndex + 1} • Vuruş {currentPlayhead.beatIndex + 1}
                    </strong>
                  </div>
                )}
                <span className="text-zinc-500">Ölçü Sayısı: {measures.length}</span>
              </div>
            </div>

            {/* The Timeline scrollable box - Single Square Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[600px] overflow-y-auto pr-1">
              {measures.map((measure, mIdx) => {
                const isMeasureCurrentlyPlaying = currentPlayhead?.measureIndex === mIdx;
                const sig = measure.timeSignature || "4/4";
                const parts = sig.split("/");
                const numerator = parseInt(parts[0], 10) || 4;

                return (
                  <div
                    key={measure.id}
                    id={`measure-track-row-${mIdx}`}
                    className={`border rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 relative min-h-[290px] ${
                      isMeasureCurrentlyPlaying
                        ? "bg-[#0b0c10] border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.08)]"
                        : "bg-[#050505] border border-[#161618] hover:border-[#222]"
                    }`}
                  >
                    {/* Header bar of measure */}
                    <div className="flex items-center justify-between border-b border-[#222]/30 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wider ${
                          isMeasureCurrentlyPlaying
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : "bg-[#111] border border-[#1e1e1e] text-zinc-400"
                        }`}>
                          ÖLÇÜ {mIdx + 1} ({sig})
                        </span>
                        
                        {isMeasureCurrentlyPlaying && (
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping absolute -top-1 -right-1" />
                        )}
                      </div>

                      {/* Measure Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => cloneMeasure(mIdx)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-[#111] border border-[#222]/60 hover:bg-[#1a1a1a] transition-all cursor-pointer"
                          id={`clone-measure-${mIdx}`}
                          title="Bu ölçüyü kopyala"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => clearMeasure(mIdx)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 bg-[#111] border border-[#222]/60 hover:bg-[#1a1a1a] transition-all cursor-pointer"
                          id={`clear-measure-${mIdx}`}
                          title="Ölçüyü boşalt"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>

                        {measures.length > 1 && (
                          <button
                            onClick={() => deleteMeasure(mIdx)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 bg-[#111] border border-[#222]/60 hover:bg-[#1a1a1a] transition-all cursor-pointer"
                            id={`delete-measure-${mIdx}`}
                            title="Ölçüyü sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Ölçü Zaman Ölçüsü (Time Signature) Seçimi */}
                    <div className="flex items-center justify-between mb-4 bg-[#0a0a0a] border border-[#1a1a1c] rounded-xl py-1.5 px-3">
                      <span className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-wider">Ölçü Vuruşu / Zamanı:</span>
                      <select
                        value={PRESET_TIME_SIGNATURES.includes(measure.timeSignature || "4/4") ? (measure.timeSignature || "4/4") : "custom"}
                        onChange={(e) => {
                          if (e.target.value !== "custom") {
                            updateIndividualMeasureTimeSignature(mIdx, e.target.value);
                          }
                        }}
                        id={`measure-${mIdx}-timesig`}
                        className="bg-[#111] border border-[#222] text-emerald-400 font-mono text-[10px] font-bold py-1 px-2.5 rounded-lg focus:outline-none cursor-pointer"
                      >
                        {PRESET_TIME_SIGNATURES.map((sigOption) => (
                          <option key={sigOption} value={sigOption}>
                            {sigOption}
                          </option>
                        ))}
                        {!PRESET_TIME_SIGNATURES.includes(measure.timeSignature || "4/4") && (
                          <option value={measure.timeSignature}>
                            {measure.timeSignature} (Özel)
                          </option>
                        )}
                      </select>
                    </div>

                    {/* Beats Grid */}
                    <div className="flex-1 flex flex-col justify-center">
                      <div className="grid gap-2 h-full min-h-[110px]" style={{
                        gridTemplateColumns: `repeat(${numerator <= 6 ? numerator : 4}, minmax(0, 1fr))`
                      }}>
                        {measure.beats.map((beat, bIdx) => {
                          const isBeatCurrentlyPlaying = isMeasureCurrentlyPlaying && currentPlayhead?.beatIndex === bIdx;
                          const isBeatSelected = activeSelectedBeat?.measureIndex === mIdx && activeSelectedBeat?.beatIndex === bIdx;
                          const chordSymbol = beat.chord ? getChordSymbol(beat.chord) : null;
                          const isSubdivided = beat.subBeats && beat.subBeats.length > 0;

                          // Scan backwards inside this measure to find any sustaining previous chord
                          let sustainedChord = null;
                          if (!beat.chord && !isSubdivided) {
                            for (let i = bIdx - 1; i >= 0; i--) {
                              const b = measure.beats[i];
                              if (b.chord) {
                                sustainedChord = b.chord;
                                break;
                              }
                              if (b.subBeats && b.subBeats.length > 0) {
                                break;
                              }
                            }
                          }
                          const sustainedSymbol = sustainedChord ? getChordSymbol(sustainedChord) : null;

                          // Drag & drop status target matching
                          const isDraggedOver = dragOverTarget?.measureIndex === mIdx && 
                                                dragOverTarget?.beatIndex === bIdx && 
                                                typeof dragOverTarget?.subBeatIndex !== "number";

                          return (
                            <div
                              key={bIdx}
                              draggable={!!beat.chord || isSubdivided}
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", JSON.stringify({ mIdx, bIdx }));
                                e.dataTransfer.effectAllowed = "copyMove";
                                setDragSource({ measureIndex: mIdx, beatIndex: bIdx });
                                
                                // Beautiful default drag avatar
                                if (beat.chord) {
                                  e.dataTransfer.setDragImage(e.currentTarget, 20, 20);
                                }
                              }}
                              onDragEnd={() => {
                                setDragSource(null);
                                setDragOverTarget(null);
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
                              }}
                              onDragEnter={(e) => {
                                e.preventDefault();
                                setDragOverTarget({ measureIndex: mIdx, beatIndex: bIdx });
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const isCopy = e.altKey || e.ctrlKey || e.metaKey;
                                handleChordDrop(mIdx, bIdx, undefined, isCopy);
                              }}
                              onClick={() => {
                                if (isSubdivided) {
                                  setActiveSelectedBeat({ measureIndex: mIdx, beatIndex: bIdx, subBeatIndex: 0 });
                                  if (beat.subBeats && beat.subBeats[0]) {
                                    triggerChordPreview(beat.subBeats[0]);
                                  }
                                } else {
                                  setActiveSelectedBeat({ measureIndex: mIdx, beatIndex: bIdx });
                                  if (beat.chord) {
                                    triggerChordPreview(beat.chord);
                                  } else if (sustainedChord) {
                                    triggerChordPreview(sustainedChord);
                                  }
                                }
                              }}
                              id={`coord-${mIdx}-${bIdx}`}
                              className={`relative border rounded-xl flex flex-col justify-center items-center text-center p-2 cursor-pointer select-none transition-all duration-200 ${
                                isDraggedOver
                                  ? "drag-over-scale-pulse text-white z-10 scale-105"
                                  : isBeatSelected
                                  ? "bg-emerald-500/10 border-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/25"
                                  : isBeatCurrentlyPlaying
                                  ? "bg-[#111115] border-emerald-500/30 text-emerald-400"
                                  : (beat.chord || isSubdivided)
                                  ? "bg-[#111] border border-[#1f1f22] hover:border-[#333] hover:bg-[#161616] text-white cursor-grab active:cursor-grabbing"
                                  : bIdx === 0
                                  ? "bg-[#0b100b]/40 border-emerald-900/30 text-emerald-400/90 hover:bg-[#0c140c] hover:border-emerald-700/65"
                                  : "bg-transparent border border-dashed border-[#1a1a1c] hover:bg-[#0c0c0c] hover:border-[#333] text-zinc-650 hover:text-zinc-400"
                              } ${numerator <= 2 ? "py-7" : numerator <= 5 ? "py-4.5" : "py-2"}`}
                              title={
                                beat.chord 
                                  ? "Akoru tutup başka vuruşa sürükleyin (Kopyalamak için Alt tuşuna basın)"
                                  : sustainedChord
                                  ? `Önceki akor (${sustainedSymbol}) buradan uzuyor.`
                                  : "Akor oluşturmak için tıklayın."
                              }
                            >
                              {/* Animated current beat border glow */}
                              {isBeatCurrentlyPlaying && (
                                <div className="absolute inset-0 border border-emerald-400/40 rounded-xl animate-pulse pointer-events-none" />
                              )}

                              {/* Beat index identifier with accented beat visual downbeat cue */}
                              <span className={`absolute top-1.5 left-2 text-[8px] font-mono scale-90 leading-none flex items-center gap-0.5 ${
                                bIdx === 0 
                                  ? "text-emerald-400 font-bold" 
                                  : isBeatCurrentlyPlaying 
                                  ? "text-emerald-500" 
                                  : "text-zinc-500"
                              }`}>
                                {bIdx === 0 && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                                )}
                                {bIdx + 1}.Vuruş {bIdx === 0 && "(Aksan)"}
                              </span>

                              {isSubdivided ? (
                                <div className="w-full h-full flex flex-col gap-1 mt-3 justify-center">
                                  <div className={`grid h-full w-full gap-1 ${
                                    beat.subBeats!.length === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2"
                                  }`}>
                                    {beat.subBeats!.map((subChord, subIdx) => {
                                      const isSubCurrentlyPlaying = isBeatCurrentlyPlaying && currentSubBeatActiveIndex === subIdx;
                                      const isSubSelected = activeSelectedBeat?.measureIndex === mIdx && 
                                                            activeSelectedBeat?.beatIndex === bIdx && 
                                                            activeSelectedBeat?.subBeatIndex === subIdx;
                                      const subSymbol = subChord ? getChordSymbol(subChord) : "Ø";
                                      const isSubDraggedOver = dragOverTarget?.measureIndex === mIdx && 
                                                               dragOverTarget?.beatIndex === bIdx && 
                                                               dragOverTarget?.subBeatIndex === subIdx;

                                      return (
                                        <div
                                          key={subIdx}
                                          draggable={!!subChord}
                                          onDragStart={(e) => {
                                            e.stopPropagation();
                                            e.dataTransfer.setData("text/plain", JSON.stringify({ mIdx, bIdx, subIdx }));
                                            e.dataTransfer.effectAllowed = "copyMove";
                                            setDragSource({ measureIndex: mIdx, beatIndex: bIdx, subBeatIndex: subIdx });
                                          }}
                                          onDragEnd={(e) => {
                                            e.stopPropagation();
                                            setDragSource(null);
                                            setDragOverTarget(null);
                                          }}
                                          onDragOver={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
                                          }}
                                          onDragEnter={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setDragOverTarget({ measureIndex: mIdx, beatIndex: bIdx, subBeatIndex: subIdx });
                                          }}
                                          onDrop={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const isCopy = e.altKey || e.ctrlKey || e.metaKey;
                                            handleChordDrop(mIdx, bIdx, subIdx, isCopy);
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveSelectedBeat({ measureIndex: mIdx, beatIndex: bIdx, subBeatIndex: subIdx });
                                            if (subChord) triggerChordPreview(subChord);
                                          }}
                                          className={`flex flex-col items-center justify-center rounded-lg border p-1 text-[9px] font-sans font-semibold transition-all ${
                                            isSubDraggedOver
                                              ? "drag-over-scale-pulse text-white z-10 scale-105"
                                              : isSubSelected
                                              ? "bg-emerald-500/25 border-emerald-400 text-white shadow-inner"
                                              : isSubCurrentlyPlaying
                                              ? "bg-[#111] border-emerald-500/45 text-emerald-400 font-bold"
                                              : subChord
                                              ? "bg-[#18181c] border-[#25252a] hover:bg-[#1f1f24] text-zinc-200 cursor-grab active:cursor-grabbing"
                                              : "bg-transparent border-dashed border-[#1a1a1c] text-zinc-500 hover:text-zinc-300"
                                          }`}
                                          title={`Alt Vuruş ${subIdx + 1} (Tutarak sürükleyin / Alt+Sürükle ile kopyalayın)`}
                                        >
                                          <span className="truncate w-full text-center tracking-tight leading-none font-bold">
                                            {subSymbol}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : beat.chord ? (
                                <div className="flex flex-col items-center mt-1 w-full justify-center">
                                  <span className={`font-display font-black tracking-wide text-zinc-100 drop-shadow-md truncate w-full max-w-[95%] leading-none ${
                                    numerator <= 2 ? "text-lg pb-1" : numerator <= 5 ? "text-sm pb-0.5" : "text-xs"
                                  }`}>
                                    {chordSymbol}
                                  </span>
                                  {numerator <= 6 && (
                                    <span className="text-[7.5px] text-emerald-500/80 mt-1 uppercase font-mono tracking-wider scale-90 leading-none">
                                      {beat.chord.bassRoot && beat.chord.bassRoot !== beat.chord.root
                                        ? "Çevrim"
                                        : beat.chord.inversion === 0 
                                          ? "Kök" 
                                          : `${beat.chord.inversion}.Çev.`}
                                    </span>
                                  )}
                                </div>
                              ) : sustainedSymbol ? (
                                <div className="flex flex-col items-center justify-center opacity-35 mt-1 leading-none select-none">
                                  <span className="font-display font-black tracking-wider text-emerald-500/80 text-xs truncate animate-pulse">
                                    » {sustainedSymbol}
                                  </span>
                                  <span className="text-[6.5px] text-zinc-450 font-mono mt-1 font-bold uppercase tracking-wider">
                                    UZATMA (TIE)
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] uppercase font-mono tracking-wider font-semibold hover:text-zinc-400 flex items-center justify-center gap-1 mt-1">
                                  <PlusCircle className="h-3.5 w-3.5" />
                                </span>
                              )}

                              {/* Delete Chord Single Action */}
                              {(beat.chord || isSubdivided) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Clear this beat specifically
                                    setMeasures(
                                      measures.map((m, m_i) => {
                                        if (m_i !== mIdx) return m;
                                        return {
                                          ...m,
                                          beats: m.beats.map((b, b_i) => {
                                            if (b_i !== bIdx) return b;
                                            return { chord: null, subBeats: undefined };
                                          }),
                                        };
                                      })
                                    );
                                    if (isBeatSelected) {
                                      setActivePlayingNotes([]);
                                    }
                                  }}
                                  className="absolute top-1 right-1 opacity-100 p-0.5 rounded hover:bg-rose-955/20 text-rose-500 transition-colors bg-[#161616] border border-[#222] z-10"
                                  style={{ transform: "scale(0.8)" }}
                                  title="Boşalt"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom track modifier */}
            <button
              onClick={addMeasure}
              id="add-new-measure-row"
              className="py-3.5 bg-[#0a0a0a] border border-dashed border-[#222] hover:border-emerald-500/30 hover:bg-[#0c0c0c] transition-all rounded-xl text-center text-xs text-zinc-400 hover:text-white flex items-center justify-center gap-2 group cursor-pointer font-bold uppercase tracking-wider font-mono animate-fade-in"
            >
              <Plus className="h-4 w-4 text-emerald-500 group-hover:scale-110 transition-transform" />
              Yeni Ölçü Ekle (+ Measure)
            </button>
          </section>
        </div>

        {/* RIGHT COLUMN: ACTIVE CHORD INSPECTOR & CHORD SEARCH TOOLS & HELPMATES (4/12 layout) */}
        <div className="lg:col-span-4 flex flex-col gap-6 w-full">
          
          {/* Scale Helpers & Smart chord suggester */}
          <section className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-4 md:p-6 shadow-xl flex flex-col gap-4">
            <div className="border-b border-[#222]/60 pb-3">
              <h2 className="text-xs font-bold text-zinc-300 tracking-wider uppercase flex items-center gap-1.5 font-display">
                <Music className="h-4 w-4 text-emerald-500" />
                Gam Akor Bulucu (Scale Chord Suggester)
              </h2>
              <p className="text-[10px] text-zinc-500 uppercase mt-1 tracking-wider font-mono">
                Belirli bir tondaki akorları hızlıca öğrenin ve tek tıkla uygulayın
              </p>
            </div>

            {/* Tonality key selection */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold font-mono">Ana Ton (Key Center)</span>
              <div className="grid grid-cols-6 gap-1">
                {["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].map((noteKey) => (
                  <button
                    key={noteKey}
                    onClick={() => setActiveScaleRoot(noteKey)}
                    id={`scale-root-selector-${noteKey.replace('#', 's')}`}
                    className={`p-1.5 text-xs font-mono font-semibold rounded-lg border transition-all cursor-pointer ${
                      activeScaleRoot === noteKey
                        ? "bg-[#222] text-emerald-500 border-[#333]"
                        : "bg-[#111] border border-[#222] hover:bg-[#161616]"
                    }`}
                  >
                    {noteKey}
                  </button>
                ))}
              </div>
            </div>

            {/* Key Quality Mode buttons (Major/Minor) */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveScaleType("major")}
                id="scale-type-major"
                className={`py-2 px-3 rounded-xl text-[10px] font-bold flex-1 border transition-all cursor-pointer uppercase tracking-wider font-mono ${
                  activeScaleType === "major"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/35"
                    : "bg-[#111] border border-[#222] text-zinc-500 hover:text-zinc-300"
                }`}
              >
                MAJÖR (Major)
              </button>

              <button
                onClick={() => setActiveScaleType("minor")}
                id="scale-type-minor"
                className={`py-2 px-3 rounded-xl text-[10px] font-bold flex-1 border transition-all cursor-pointer uppercase tracking-wider font-mono ${
                  activeScaleType === "minor"
                    ? "bg-indigo-500/10 text-indigo-450 border-indigo-500/35"
                    : "bg-[#111] border border-[#222] text-zinc-500 hover:text-zinc-300"
                }`}
              >
                MİNÖR (Natural Minor)
              </button>
            </div>

            {/* Suggested degrees keyboard trigger panel */}
            <div className="flex flex-col gap-2 pt-2 border-t border-[#222]/60">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
                {activeScaleRoot} {activeScaleType === "major" ? "Major" : "Minor"} GAMI AKORLARI (Chords)
              </span>

              {activeSelectedBeat ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-4 gap-2">
                    {(activeScaleType === "major" ? MAJOR_SCALE_DEGREES : MINOR_SCALE_DEGREES).map((degreeObj) => {
                      const rootIndex = ROOT_NOTES.indexOf(activeScaleRoot);
                      const targetNote = ROOT_NOTES[(rootIndex + degreeObj.offset) % 12];
                      const displaySymbol = `${targetNote}${degreeObj.quality === "min" ? "m" : degreeObj.quality === "dim" ? "dim" : ""}`;

                      return (
                        <button
                          key={degreeObj.degree}
                          onClick={() => applyScaleDegreeChord(degreeObj.offset, degreeObj.quality)}
                          id={`scale-chord-${degreeObj.degree}`}
                          className={`py-2.5 px-1 border border-[#222] bg-[#111] hover:bg-[#161616] hover:border-emerald-500/30 rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center group`}
                          title={`Düzenlenen vuruşa ${displaySymbol} akorunu yükler`}
                        >
                          <span className="text-[9px] font-mono text-zinc-500 group-hover:text-emerald-400 transition-colors font-bold">
                            {degreeObj.roman}
                          </span>
                          <span className="text-xs font-bold font-mono tracking-tight mt-0.5 text-zinc-100">
                            {displaySymbol}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[9px] text-zinc-500 font-sans leading-normal">
                    * Akor butonlarına tıklayarak seçtiğiniz vuruşa akoru yerleştirebilir, ardından çevrim pozisyonunu değiştirebilirsiniz.
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-zinc-500 bg-[#070707] p-4 rounded-xl border border-[#222]/80 text-center font-sans">
                  Lütfen yukarıda bir vuruş seçin.
                </div>
              )}
            </div>
          </section>

          {/* Active Edit Block */}
          {activeSelectedBeat ? (
            <section className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-6 shadow-xl flex flex-col gap-5">
              <div className="flex items-center justify-between border-b border-[#222]/60 pb-3">
                <div>
                  <h2 className="text-xs font-bold text-emerald-400 tracking-wider uppercase font-display">
                    Akor Düzenleyici (Chord Editor)
                  </h2>
                  <p className="text-[10px] text-zinc-500 font-mono font-bold uppercase mt-1">
                    ÖLÇÜ {activeSelectedBeat.measureIndex + 1} • VURUŞ {activeSelectedBeat.beatIndex + 1}
                    {typeof activeSelectedBeat.subBeatIndex === "number" && ` • ALT-VURUŞ ${activeSelectedBeat.subBeatIndex + 1}`}
                  </p>
                </div>

                {selectedChord && (
                  <button
                    onClick={() => updateSelectedChord(null)}
                    className="text-[10px] text-zinc-400 hover:text-rose-400 bg-[#111] hover:bg-rose-950/20 border border-[#222] px-2.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 font-mono uppercase tracking-wider"
                    title="Akoru bu vuruştan kaldırır"
                  >
                    <Trash2 className="h-3 w-3" /> Kaldır
                  </button>
                )}
              </div>

              {/* Beat Subdivision Control */}
              {(() => {
                const selectedBeatObj = measures[activeSelectedBeat.measureIndex]?.beats[activeSelectedBeat.beatIndex];
                const currentSubdivision = selectedBeatObj?.subBeats ? selectedBeatObj.subBeats.length : 1;
                return (
                  <div className="flex flex-col gap-1.5 bg-[#0e0e11] border border-[#222]/50 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                        VURUŞ ALT BÖLÜNTÜSÜ
                      </span>
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-mono px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold uppercase tracking-wider">
                        {currentSubdivision === 1 ? "Normal (1x)" : `${currentSubdivision} Segment`}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mt-1">
                      {([1, 2, 4] as const).map((divOption) => {
                        const isCurrent = currentSubdivision === divOption;
                        return (
                          <button
                            key={divOption}
                            onClick={() => setBeatSubdivision(activeSelectedBeat.measureIndex, activeSelectedBeat.beatIndex, divOption)}
                            id={`subdiv-option-${divOption}`}
                            className={`py-1.5 text-[9px] uppercase font-mono font-bold rounded-lg border transition-all cursor-pointer ${
                              isCurrent
                                ? "bg-emerald-505/10 text-emerald-400 border-emerald-500/30 font-bold shadow-sm"
                                : "bg-[#111] border-[#1e1e1e] hover:bg-[#161618] hover:text-white text-zinc-400"
                            }`}
                            title={
                              divOption === 1
                                ? "Vuruşu tek akora geri birleştirir"
                                : `Vuruşu ${divOption} alt birime böler (aynı vuruşta birden çok akor)`
                            }
                          >
                            {divOption === 1 ? "Kombine" : `${divOption} Böl`}
                          </button>
                        );
                      })}
                    </div>
                    {selectedBeatObj?.subBeats && selectedBeatObj.subBeats.length > 0 && (
                      <div className="mt-2 flex items-center justify-between border-t border-[#222]/30 pt-2">
                        <span className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-wider">Alt-Vuruş Seçimi:</span>
                        <div className="flex gap-1 bg-[#111] p-0.5 border border-[#222] rounded-lg">
                          {selectedBeatObj.subBeats.map((_, sIdx) => {
                            const isSelSub = activeSelectedBeat.subBeatIndex === sIdx;
                            return (
                              <button
                                key={sIdx}
                                onClick={() => setActiveSelectedBeat({
                                  ...activeSelectedBeat,
                                  subBeatIndex: sIdx
                                })}
                                id={`select-sub-item-${sIdx}`}
                                className={`px-2 py-1 text-[8px] font-mono font-bold rounded-md transition-all cursor-pointer ${
                                  isSelSub
                                    ? "bg-emerald-500 text-black font-bold shadow"
                                    : "text-zinc-400 hover:text-white"
                                }`}
                              >
                                {sIdx + 1}. SEG
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Tonika / Root key picker grid */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
                  1. Kök Nota (Root Degree)
                </span>
                <div className="grid grid-cols-6 gap-1">
                  {ALL_ROOT_NOTES.map((root) => {
                    const isActive = selectedChord?.root === root;
                    return (
                      <button
                        key={root}
                        onClick={() => updateSelectedChord({ root })}
                        id={`root-pick-${root.replace('#', 's').replace('b', 'flat')}`}
                        className={`py-2 text-[10px] font-mono font-bold rounded-xl border transition-all cursor-pointer ${
                          isActive
                            ? "bg-emerald-500 hover:bg-emerald-400 text-black border-emerald-500 shadow-md"
                            : "bg-[#111] border border-[#222]/65 hover:bg-[#161616] hover:text-white text-zinc-300"
                        }`}
                      >
                        {root}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chord Quality picker */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
                  2. Ton Kalitesi (Chord Quality)
                </span>
                <div className="grid grid-cols-3 gap-1">
                  {CHORD_QUALITIES.map((qual) => {
                    const isActive = selectedChord?.quality === qual.id;
                    return (
                      <button
                        key={qual.id}
                        onClick={() => updateSelectedChord({ quality: qual.id })}
                        id={`quality-pick-${qual.id}`}
                        className={`py-1.5 px-1.5 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[46px] ${
                          isActive
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-[inset_0_0_10px_rgba(16,185,129,0.1)]"
                            : "bg-[#111] border border-[#222] hover:bg-[#161616] hover:border-[#333] text-zinc-300"
                        }`}
                      >
                        <span className="text-[10px] font-bold leading-tight truncate w-full">{qual.name}</span>
                        <span className="text-[7.5px] font-mono text-zinc-500 mt-0.5 leading-none uppercase tracking-wider">
                          {qual.id}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chord Inversion (Çevrim) section */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
                    3. Çevrim Pozisyonu (Inversion)
                  </span>
                  <a
                    href="#inversion-details-card"
                    className="text-[9px] text-emerald-400/80 hover:text-emerald-300 hover:underline flex items-center gap-1 font-mono uppercase tracking-wider"
                  >
                    <BookOpen className="h-2.5 w-2.5" /> Çevrim Nedir?
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => updateSelectedChord({ inversion: 0 })}
                    id="inverse-pick-0"
                    className={`py-2.5 px-3 rounded-xl border text-left transition-all flex flex-col justify-center cursor-pointer ${
                      (selectedChord?.inversion ?? 0) === 0
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40"
                        : "bg-[#111] border border-[#222] hover:bg-[#161616] text-zinc-300"
                    }`}
                  >
                    <span className="text-xs font-bold leading-none">Kök Pozisyon (Root)</span>
                    <span className="text-[8px] font-mono text-zinc-500 mt-1 uppercase">0. Çevrim</span>
                  </button>

                  <button
                    onClick={() => updateSelectedChord({ inversion: 1 })}
                    id="inverse-pick-1"
                    className={`py-2.5 px-3 rounded-xl border text-left transition-all flex flex-col justify-center cursor-pointer ${
                      (selectedChord?.inversion ?? 0) === 1
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40"
                        : "bg-[#111] border border-[#222] hover:bg-[#161616] text-zinc-300"
                    }`}
                  >
                    <span className="text-xs font-bold leading-none">1. Çevrim (1st Inv)</span>
                    <span className="text-[8px] font-mono text-zinc-500 mt-1 uppercase">Bas: 3'lü derece</span>
                  </button>

                  <button
                    onClick={() => updateSelectedChord({ inversion: 2 })}
                    id="inverse-pick-2"
                    className={`py-2.5 px-3 rounded-xl border text-left transition-all flex flex-col justify-center cursor-pointer ${
                      (selectedChord?.inversion ?? 0) === 2
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40"
                        : "bg-[#111] border border-[#222] hover:bg-[#161616] text-zinc-300"
                    }`}
                  >
                    <span className="text-xs font-bold leading-none">2. Çevrim (2nd Inv)</span>
                    <span className="text-[8px] font-mono text-zinc-500 mt-1 uppercase">Bas: 5'li derece</span>
                  </button>

                  {/* 3rd inversion only shows if quality supports 4 notes */}
                  {selectedChord && supportsThirdInversion(selectedChord.quality) && (
                    <button
                      onClick={() => updateSelectedChord({ inversion: 3 })}
                      id="inverse-pick-3"
                      className={`py-2.5 px-3 rounded-xl border text-left transition-all flex flex-col justify-center cursor-pointer ${
                        selectedChord.inversion === 3
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40"
                          : "bg-[#111] border border-[#222] hover:bg-[#161616] text-zinc-300"
                      }`}
                    >
                      <span className="text-xs font-bold leading-none">3. Çevrim (3rd Inv)</span>
                      <span className="text-[8px] font-mono text-zinc-500 mt-1 uppercase">Bas: 7'li derece</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Octave selection and Pitch Details */}
              <div className="flex flex-col gap-3.5 pt-2 border-t border-[#222]/60">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
                    4. Oktav (Pitch Register)
                  </span>
                  <div className="flex border border-[#222] rounded-lg overflow-hidden bg-[#111] scale-95 origin-right">
                    {[2, 3, 4, 5].map((oct) => (
                      <button
                        key={oct}
                        onClick={() => updateSelectedChord({ octave: oct })}
                        id={`octave-pick-${oct}`}
                        className={`px-3 py-1 text-xs font-mono font-bold transition-all cursor-pointer ${
                          (selectedChord?.octave ?? 4) === oct
                            ? "bg-[#222] text-emerald-500 font-bold"
                            : "text-zinc-400 hover:text-zinc-300"
                        }`}
                      >
                        Oct {oct}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Bass Override */}
                <div className="flex flex-col gap-2 pt-3 border-t border-[#222]/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
                      5. Özel Bas Nota (Bass Override)
                    </span>
                    {selectedChord?.bassRoot && selectedChord.bassRoot !== selectedChord.root && (
                      <button
                        onClick={() => updateSelectedChord({ bassRoot: undefined })}
                        className="text-[9px] text-rose-455 hover:text-rose-400 hover:underline font-mono uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Varsayılana Dön (Reset)
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {ALL_ROOT_NOTES.map((note) => {
                      const isOverridden = selectedChord?.bassRoot === note;
                      const isDefaultBass = !selectedChord?.bassRoot && selectedChord?.root === note;
                      
                      return (
                        <button
                          key={note}
                          onClick={() => updateSelectedChord({ bassRoot: note })}
                          id={`bass-override-${note.replace("#", "sharp").replace("b", "flat")}`}
                          className={`py-1 text-[10px] font-mono rounded transition-colors cursor-pointer border ${
                            isOverridden
                              ? "bg-amber-500 hover:bg-amber-400 text-black border-amber-500 font-bold shadow-sm"
                              : isDefaultBass
                              ? "bg-emerald-500/10 text-emerald-450 border-emerald-500/30 font-semibold"
                              : "bg-[#111] border border-[#222]/60 hover:bg-[#161618] hover:text-white text-zinc-500"
                          }`}
                          title={`Kök bas sesini ${note} yapar`}
                        >
                          {note}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-zinc-500 mt-1 italic leading-normal">
                    * Her akora en pes oktavda kök bas sesi <strong>otomatik eklenir</strong>. Alternatif bir bas sesi seçerek akorunuzu "Slash Chord/Çevrimli" (örn: C/F) haline getirebilirsiniz.
                  </p>
                </div>

                {/* Notes list viewer for learning */}
                {selectedChord && currentDetails.length > 0 && (
                  <div className="bg-[#111] border border-[#222] rounded-xl p-3 flex flex-col gap-1.5 mt-1">
                    <span className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-wider">
                      AKOR REÇETESİ (Voicing Plan):
                    </span>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-zinc-400 font-mono">
                        Akor Sesi:
                      </span>
                      <span className="text-emerald-400 font-bold font-mono">
                        {getChordSymbol(selectedChord)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 font-mono">Bas Nota (Bass Link):</span>
                      <span className="text-white font-mono font-semibold bg-[#222] border border-[#333]/30 px-1.5 py-0.5 rounded">
                        {currentDetails[0]?.name}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <div className="bg-[#0a0a0a] border border-[#222] border-dashed rounded-2xl p-6 text-center text-zinc-500 text-xs shadow-xl min-h-36 flex flex-col items-center justify-center">
              <Info className="h-5 w-5 text-zinc-600 mb-2" />
              <p className="font-medium">Düzenleme yapmak için sekans üzerinde herhangi bir vuruşa tıklayın.</p>
            </div>
          )}

          {/* Education Inversion Help Box */}
          <section
            id="inversion-details-card"
            className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-6 shadow-xl flex flex-col gap-3.5"
          >
            <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-[#222]/60 pb-3 font-display">
              <BookOpen className="h-4 w-4 text-emerald-500" />
              <h3>Akor Çevrimleri Nedir?</h3>
            </div>
            
            <p className="text-xs text-zinc-400 leading-relaxed font-sans">
              Akor çevrimleri, bir akordaki notaların çalınma sırasını (kalınlık sırasını/perdesini) değiştirmektir. 
              Müzikte inanılmaz derecede önemlidir çünkü pürüzsüz geçişler yapmanızı sağlar (buna <strong>Voice Leading</strong> denir).
            </p>

            <div className="flex flex-col gap-2.5 text-xs">
              <div className="bg-[#111] p-2.5 rounded-xl border border-[#222]">
                <span className="font-bold text-emerald-400">0. Çevrim (Root Position):</span>
                <p className="text-zinc-500 text-[11px] mt-0.5">En pes nota akorun kök sesidir. (Örn: C E G akorunda en altta C çalar)</p>
              </div>

              <div className="bg-[#111] p-2.5 rounded-xl border border-[#222]">
                <span className="font-bold text-emerald-400">1. Çevrim (1st Inversion):</span>
                <p className="text-zinc-500 text-[11px] mt-0.5">Kök nota bir oktav yukarı kaydırılır. (Örn: C E G akorunda en altta E çalar: E G C)</p>
              </div>

              <div className="bg-[#111] p-2.5 rounded-xl border border-[#222]">
                <span className="font-bold text-emerald-400">2. Çevrim (2nd Inversion):</span>
                <p className="text-zinc-500 text-[11px] mt-0.5">Kök ve 3'lü nota bir oktav yukarı kaydırılır. (Örn: G C E akorunda en altta G çalar)</p>
              </div>
            </div>
            
            <span className="text-[10px] text-zinc-500 tracking-tight leading-relaxed font-sans mt-1">
              💡 <strong>DAW İpucu:</strong> Akorlar arasında geçiş yaparken bas notaların birbirine en yakın olduğu çevrimleri seçerseniz, akor akışınız çok daha profesyonel ve kulağa hoş gelecektir!
            </span>
          </section>

          {/* Ritim & Akor Süre Sözlüğü */}
          <section
            id="rhythm-sustain-glossary-card"
            className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-6 shadow-xl flex flex-col gap-3.5"
          >
            <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-[#222]/60 pb-3 font-display">
              <Sliders className="h-4 w-4 text-emerald-500" />
              <h3>Ritim & Akor Süre Sözlüğü</h3>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed font-sans">
              Sekanserimiz akorların sürelerini ve değerlerini otomatik olarak vuruş yerleşimlerine göre uyarlar:
            </p>

            <div className="flex flex-col gap-3 text-xs">
              <div className="bg-[#111] p-3 rounded-xl border border-[#222]/80">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                  Tek Akor / Tam Ölçü Modu
                </span>
                <p className="text-zinc-500 text-[11px] mt-1 leading-relaxed">
                  Ölçüde sadece tek bir vuruşa akor girdiyseniz (örneğin 1. vuruşa <strong>La minör / Am</strong>), bu akor otomatik olarak <strong>tüm ölçü boyunca (3/4 veya 4/4 olsa da)</strong> aralıksız uzatılır (TIE/Sustain).
                </p>
              </div>

              <div className="bg-[#111] p-3 rounded-xl border border-[#222]/80">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                  Çoklu Akor / Vuruş Sıkıştırma
                </span>
                <p className="text-zinc-500 text-[11px] mt-1 leading-relaxed">
                  Ölçüye birden fazla akor yazarsanız (örneğin 2 vuruşluk <strong>La minör</strong>, 2 vuruşluk <strong>Mi minör</strong>), akorların toplamı ölçünün sınırlarını asla aşmayarak <strong>tam olarak bir ölçü kutusunun içine sığar</strong>.
                </p>
              </div>

              <div className="bg-[#111] p-3 rounded-xl border border-[#222]/80">
                <span className="font-bold text-purple-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-purple-500 inline-block" />
                  Alt Vuruş Bölüntüsü (Sub-divisions)
                </span>
                <p className="text-zinc-500 text-[11px] mt-1 leading-relaxed">
                  Daha kompleks ritmik hareketler için tek bir vuruşu <strong>2'ye veya 4'e bölerek</strong>, bir vuruş süresi içine birden fazla akor yerleştirebilir, dinamik ritimler yaratabilirsiniz.
                </p>
              </div>
            </div>

            <span className="text-[10.5px] text-zinc-500 tracking-tight leading-relaxed font-sans">
              🎹 <strong>Sürükle & Bırak:</strong> Hazırladığınız akorları vuruşlar ve ölçüler arasında kolayca taşımak için sürükleyebilirsiniz. Kopyalamak için sürüklerken alt tuşunu basılı tutun!
            </span>
          </section>
        </div>
      </main>

      {/* FOOTER PIANO ROLL DISPLAY */}
      <footer className="w-full mt-auto p-6 bg-[#0a0a0a] border-t border-[#222] flex flex-col gap-6">
        <PianoRoll activeMidiNumbers={activePlayingNotes.length > 0 ? activePlayingNotes : selectedChord ? getChordNotes(selectedChord).map(n => n.midiNumber) : []} />
        
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-center text-zinc-500 text-[11px] font-mono tracking-wider font-bold border-t border-[#222]/80 pt-5">
          <p>© 2026 CHORD DAW SEQUENCER LAB • CRAFTED FOR AI STUDIO BUILD</p>
          <div className="flex gap-4">
            <span>STANDART MIDI DOSYA FORMATI 0</span>
            <span>WEB AUDIO API SYNTHESIZER</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
