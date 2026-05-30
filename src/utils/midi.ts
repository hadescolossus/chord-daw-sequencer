import { Measure } from "../types";
import { getChordNotes } from "./chords";

// Helper to convert a number to Variable Length Quantity bytes (MIDI format)
function toVLQ(num: number): number[] {
  const bytes: number[] = [];
  bytes.push(num & 0x7f);
  while (num > 0x7f) {
    num >>>= 7;
    bytes.push((num & 0x7f) | 0x80);
  }
  return bytes.reverse();
}

export function generateMidiFile(measures: Measure[], bpm: number): Uint8Array {
  const ticksPerBeat = 128; // Ticks per quarter note inside the MIDI file

  // Gather absolute MIDI events
  interface MidiEvent {
    absoluteTick: number;
    type: "on" | "off";
    note: number;
  }

  const rawEvents: MidiEvent[] = [];
  let currentTick = 0;

  measures.forEach((measure) => {
    // Determine the tick duration per beat in this measure based on its time signature.
    // Ticks per beat = (128 * 4) / denominator.
    // e.g., if denominator = 4 -> 128 ticks.
    // if denominator = 8 -> 64 ticks.
    // if denominator = 16 -> 32 ticks.
    const sig = measure.timeSignature || "4/4";
    const parts = sig.split("/");
    const denominator = parseInt(parts[1], 10) || 4;
    const beatDuration = Math.round(512 / denominator);

    measure.beats.forEach((beat, bIdx) => {
      if (beat.subBeats && beat.subBeats.length > 0) {
        const subCount = beat.subBeats.length;
        const subDuration = Math.round(beatDuration / subCount);
        beat.subBeats.forEach((subChord, subIdx) => {
          if (subChord) {
            const chordNotes = getChordNotes(subChord);
            if (chordNotes.length > 0) {
              const subStartTick = currentTick + Math.round(subIdx * subDuration);
              const subEndTick = Math.min(currentTick + beatDuration, subStartTick + subDuration);

              // Add note on events
              chordNotes.forEach((noteObj) => {
                rawEvents.push({
                  absoluteTick: subStartTick,
                  type: "on",
                  note: noteObj.midiNumber,
                });
              });

              // Add note off events
              chordNotes.forEach((noteObj) => {
                rawEvents.push({
                  absoluteTick: subEndTick,
                  type: "off",
                  note: noteObj.midiNumber,
                });
              });
            }
          }
        });
      } else if (beat.chord) {
        // Calculate dynamic propagated duration (how many consecutive empty beats this chord sustains over)
        let durationInBeats = 1;
        for (let nextIdx = bIdx + 1; nextIdx < measure.beats.length; nextIdx++) {
          const nextBeat = measure.beats[nextIdx];
          if (nextBeat.chord || (nextBeat.subBeats && nextBeat.subBeats.length > 0)) {
            break;
          }
          durationInBeats++;
        }

        const chordNotes = getChordNotes(beat.chord);
        if (chordNotes.length > 0) {
          // Add note on events
          chordNotes.forEach((noteObj) => {
            rawEvents.push({
              absoluteTick: currentTick,
              type: "on",
              note: noteObj.midiNumber,
            });
          });

          // Add note off events after the propagated duration
          const sustainTickDuration = beatDuration * durationInBeats;
          chordNotes.forEach((noteObj) => {
            rawEvents.push({
              absoluteTick: currentTick + sustainTickDuration,
              type: "off",
              note: noteObj.midiNumber,
            });
          });
        }
      }
      currentTick += beatDuration;
    });
  });

  // Sort raw events:
  // 1. By absolute tick time.
  // 2. If at the same tick, 'off' comes before 'on' to avoid stuck notes or cutting off.
  // 3. Otherwise by note number.
  rawEvents.sort((a, b) => {
    if (a.absoluteTick !== b.absoluteTick) {
      return a.absoluteTick - b.absoluteTick;
    }
    if (a.type !== b.type) {
      return a.type === "off" ? -1 : 1;
    }
    return a.note - b.note;
  });

  // Now, build track event bytes with delta-times
  const trackEvents: number[] = [];
  let lastTick = 0;

  // 1. Set Tempo Meta Event (micro-seconds per quarter note)
  // 60,000,000 / BPM
  const tempoValue = Math.round(60000000 / bpm);
  const tByte1 = (tempoValue >> 16) & 0xff;
  const tByte2 = (tempoValue >> 8) & 0xff;
  const tByte3 = tempoValue & 0xff;

  // Add Tempo event at tick 0
  trackEvents.push(...toVLQ(0)); // Delta-time
  trackEvents.push(0xff, 0x51, 0x03, tByte1, tByte2, tByte3);

  // 2. Add Time Signature Meta Event (we use the first measure's time signature or set to 4/4 by default)
  const firstSig = measures[0]?.timeSignature || "4/4";
  const parts = firstSig.split("/");
  const num = parseInt(parts[0], 10) || 4;
  const denominatorVal = parseInt(parts[1], 10) || 4;
  
  // den in MIDI signature is log2(denominator)
  // e.g. 4 -> 2, 8 -> 3, 16 -> 4...
  let denPower = Math.round(Math.log2(denominatorVal));
  if (isNaN(denPower) || denPower < 0) denPower = 2;

  trackEvents.push(...toVLQ(0)); // Delta time
  // Meta type 0x58 length 4, num, den-power, clocks-per-click, 32nds
  trackEvents.push(0xff, 0x58, 0x04, num, denPower, 24, 8);

  // 3. Add Track Name Meta Event
  const trackName = "Chords Progression";
  const nameBytes = Array.from(trackName).map((c) => c.charCodeAt(0));
  trackEvents.push(...toVLQ(0));
  trackEvents.push(0xff, 0x03, ...toVLQ(nameBytes.length), ...nameBytes);

  // 4. Translate chord note events to track bytes
  rawEvents.forEach((ev) => {
    const deltaTime = ev.absoluteTick - lastTick;
    lastTick = ev.absoluteTick;

    // Write delta-time
    trackEvents.push(...toVLQ(deltaTime));

    // Write status and midi bytes
    if (ev.type === "on") {
      trackEvents.push(0x90, ev.note, 0x60); // 0x60 is default velocity (96)
    } else {
      trackEvents.push(0x80, ev.note, 0x00); // 0x00 velocity = note off
    }
  });

  // 5. Add End of Track Meta Event
  // We place it slightly after the last note off or at the same tick
  trackEvents.push(...toVLQ(0)); // delta-time
  trackEvents.push(0xff, 0x2f, 0x00);

  // Compile Header Chunk and Track Chunk
  const fileBytes: number[] = [];

  // --- HEADER CHUNK (MThd) ---
  fileBytes.push(0x4d, 0x54, 0x68, 0x64); // 'MThd'
  fileBytes.push(0x00, 0x00, 0x00, 0x06); // length of header (6 bytes)
  fileBytes.push(0x00, 0x00); // format 0 (single track)
  fileBytes.push(0x00, 0x01); // 1 track
  // Division: 128 ticks per quarter note
  fileBytes.push(0x00, 0x80);

  // --- TRACK CHUNK (MTrk) ---
  fileBytes.push(0x4d, 0x54, 0x72, 0x6b); // 'MTrk'
  // write track length (4 bytes)
  const trackLen = trackEvents.length;
  fileBytes.push(
    (trackLen >> 24) & 0xff,
    (trackLen >> 16) & 0xff,
    (trackLen >> 8) & 0xff,
    trackLen & 0xff
  );
  fileBytes.push(...trackEvents);

  return new Uint8Array(fileBytes);
}

export function downloadMidiFile(measures: Measure[], bpm: number, filename: string = "chord-progression.mid") {
  const bytes = generateMidiFile(measures, bpm);
  const blob = new Blob([bytes], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
