import React from "react";
import { ROOT_NOTES } from "../utils/chords";

interface PianoRollProps {
  activeMidiNumbers: number[];
}

export function PianoRoll({ activeMidiNumbers }: PianoRollProps) {
  // We'll show keys from C3 (MIDI 48) to B5 (MIDI 83) (36 keys, 3 octaves)
  const START_MIDI = 48; // C3
  const END_MIDI = 83;   // B5

  const keys: { midi: number; isBlack: boolean; name: string }[] = [];

  for (let m = START_MIDI; m <= END_MIDI; m++) {
    const noteIndex = m % 12;
    const isBlack = [1, 3, 6, 8, 10].includes(noteIndex); // C#, D#, F#, G#, A#
    const noteName = ROOT_NOTES[noteIndex];
    const octave = Math.floor(m / 12) - 1;
    keys.push({ midi: m, isBlack, name: `${noteName}${octave}` });
  }

  return (
    <div className="w-full bg-[#0a0a0a] border border-[#222] rounded-2xl p-4 md:p-6 shadow-2xl flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <h2 className="text-xs font-bold tracking-wider text-white uppercase font-display">
            Canlı Piyano Görünümü (Live Piano Visualizer)
          </h2>
        </div>
        <p className="text-[10px] text-zinc-500 font-mono">
          Tuşlar: C3 - B5 (3 Octaves)
        </p>
      </div>

      <div className="relative select-none overflow-x-auto pb-1 scrollbar-thin">
        <div className="flex relative h-40 min-w-[640px] border border-[#222] rounded bg-[#050505] overflow-hidden">
          {keys.map((key) => {
            const isActive = activeMidiNumbers.includes(key.midi);

            if (key.isBlack) {
              return null; // Rendered absolutely aligned over white keys
            }

            // Calculate position or simply render flex items
            // White keys are basic flex items
            return (
              <div
                key={key.midi}
                className={`relative flex-1 min-w-[20px] h-full border-r border-[#222] border-opacity-30 flex items-end justify-center pb-2.5 transition-all duration-150 ${
                  isActive
                    ? "bg-gradient-to-t from-emerald-500 to-emerald-400 text-black shadow-[inset_0_-10px_20px_rgba(16,185,129,0.3)] font-bold"
                    : "bg-[#fafafa] text-zinc-400 hover:bg-[#f4f4f5]"
                }`}
              >
                <span className="text-[9px] font-mono select-none font-semibold">{key.name}</span>
              </div>
            );
          })}

          {/* Render black keys on top absolutely */}
          <div className="absolute top-0 left-0 w-full h-24 pointer-events-none flex">
            {keys.map((key, index) => {
              if (!key.isBlack) {
                // Return spacer matching white key width
                return (
                  <div key={key.midi} className="flex-1 min-w-[20px] h-full pointer-events-none" />
                );
              }

              // Determine active styling for black keys
              const isActive = activeMidiNumbers.includes(key.midi);

              return (
                <div key={key.midi} className="relative w-0 pointer-events-auto" style={{ zIndex: 10 }}>
                  <div
                    className={`absolute -translate-x-1/2 w-4 md:w-5 h-24 rounded-b border border-[#111] shadow-lg transition-all duration-150 cursor-pointer ${
                      isActive
                        ? "bg-gradient-to-b from-teal-400 to-emerald-500 border-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                        : "bg-[#161616] hover:bg-[#222]"
                    }`}
                    title={key.name}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {activeMidiNumbers.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider mr-1 mt-1">Aktif Notalar:</span>
          {activeMidiNumbers.map((midiNum) => {
            const noteIndex = midiNum % 12;
            const noteName = ROOT_NOTES[noteIndex];
            const octave = Math.floor(midiNum / 12) - 1;
            const isBlack = [1, 3, 6, 8, 10].includes(noteIndex);
            
            return (
              <span
                key={midiNum}
                className={`text-[10px] px-2.5 py-1 rounded-lg font-mono font-semibold ${
                  isBlack
                    ? "bg-[#111] text-teal-400 border border-[#222]"
                    : "bg-[#111] text-emerald-400 border border-[#222]"
                }`}
              >
                {noteName}{octave}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
