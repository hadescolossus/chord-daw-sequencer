export type SoundSourceType = "vintage" | "rhodes" | "pad" | "strings";

class AudioSynthEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private soundSource: SoundSourceType = "vintage";

  constructor() {}

  public init() {
    if (!this.ctx) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
        
        // Setup compressor for polished sound (prevents clipping)
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(40, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
 
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5; // Default volume: 50%
 
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
      } catch (e) {
        console.error("Web Audio API is not supported in this browser:", e);
      }
    }
    
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public setVolume(volume: number) {
    this.init();
    if (this.masterGain && this.ctx) {
      // Smooth volume transitions
      this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  public getContextState(): string {
    return this.ctx ? this.ctx.state : "uninitialized";
  }

  public getSoundSource(): SoundSourceType {
    return this.soundSource;
  }

  public setSoundSource(source: SoundSourceType) {
    this.soundSource = source;
  }

  // Play a beautiful synthetic chord
  public playChord(midiNumbers: number[], durationSeconds: number, startDelaySeconds: number = 0) {
    this.init();
    if (!this.ctx || !this.compressor) return;

    const now = this.ctx.currentTime + startDelaySeconds;
    const voiceCount = midiNumbers.length || 1;
    
    // Polyphonic volume adjustment to prevent distortion
    const baseVolume = 0.35 / Math.sqrt(voiceCount); 

    const gainNode = this.ctx.createGain();
    gainNode.connect(this.compressor);

    // Determine custom ADSR envelope times for each sound style, scaled dynamically with tempo / beat duration
    let attack = 0.03;
    let decay = 0.15;
    let sustain = 0.75;
    let release = 0.2;

    if (this.soundSource === "rhodes") {
      // Classic quick EP transient and warm bell ring
      attack = 0.005;
      decay = 0.35;
      sustain = 0.45;
      release = 0.3;
    } else if (this.soundSource === "pad") {
      // Slow warm swelling pad
      attack = Math.min(0.8, durationSeconds * 0.45);
      decay = Math.min(0.6, durationSeconds * 0.3);
      sustain = 0.85;
      release = Math.min(1.2, durationSeconds * 1.5);
    } else if (this.soundSource === "strings") {
      // Organic string section bow-stroke attack and natural resonance
      attack = Math.min(0.25, durationSeconds * 0.35);
      decay = Math.min(0.4, durationSeconds * 0.25);
      sustain = 0.8;
      release = Math.min(0.8, durationSeconds * 1.2);
    }

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(baseVolume, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(baseVolume * sustain, now + attack + decay);

    // Schedule the release phase
    const releaseTime = now + durationSeconds;
    // Handle edge case where duration is shorter than attack + decay
    const actualReleaseTrigger = Math.max(now + attack + decay, releaseTime - release);
    
    gainNode.gain.setValueAtTime(baseVolume * sustain, actualReleaseTrigger);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, actualReleaseTrigger + release);

    midiNumbers.forEach((midiNum) => {
      if (!this.ctx) return;
      const freq = 440 * Math.pow(2, (midiNum - 69) / 12);

      if (this.soundSource === "rhodes") {
        // --- RHODES SUITCASE EP SYNTHESIS ---
        
        // 1. Pure round fundamental (Sine wave - DX7 style fm + Suitcase warmth)
        const osc1 = this.ctx.createOscillator();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(freq, now);
        osc1.connect(gainNode);
        osc1.start(now);
        osc1.stop(actualReleaseTrigger + release);

        // 2. Body harmonic (Triangle wave - reed physics simulation)
        const osc2 = this.ctx.createOscillator();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(freq, now);
        
        const bodyGain = this.ctx.createGain();
        bodyGain.gain.setValueAtTime(0.4, now);
        bodyGain.connect(gainNode);
        
        osc2.connect(bodyGain);
        osc2.start(now);
        osc2.stop(actualReleaseTrigger + release);

        // 3. High Metallic Tine Chime (High additive sine 4.01x freq with near-instant decay)
        const tineOsc = this.ctx.createOscillator();
        tineOsc.type = "sine";
        tineOsc.frequency.setValueAtTime(freq * 4.01, now);

        const tineGain = this.ctx.createGain();
        tineGain.gain.setValueAtTime(0.32, now);
        tineGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08); // finishes within 80ms!
        tineGain.connect(gainNode);

        tineOsc.connect(tineGain);
        tineOsc.start(now);
        tineOsc.stop(now + 0.1);

      } else if (this.soundSource === "pad") {
        // --- AMBIENT SWEEPING LUSH PAD ---
        
        // 1. Warm core fundamental
        const oscCore = this.ctx.createOscillator();
        oscCore.type = "triangle";
        oscCore.frequency.setValueAtTime(freq, now);
        oscCore.connect(gainNode);
        oscCore.start(now);
        oscCore.stop(actualReleaseTrigger + release);

        // Dark warm lowpass filter sweep
        const padFilter = this.ctx.createBiquadFilter();
        padFilter.type = "lowpass";
        padFilter.frequency.setValueAtTime(freq * 1.4, now);
        padFilter.Q.setValueAtTime(1.1, now);
        padFilter.connect(gainNode);

        // 2. Detuned Saw 1 (chorus width -10 cents)
        const oscSaw1 = this.ctx.createOscillator();
        oscSaw1.type = "sawtooth";
        oscSaw1.frequency.setValueAtTime(freq, now);
        oscSaw1.detune.setValueAtTime(-10, now);
        oscSaw1.connect(padFilter);
        oscSaw1.start(now);
        oscSaw1.stop(actualReleaseTrigger + release);

        // 3. Detuned Saw 2 (chorus width +10 cents)
        const oscSaw2 = this.ctx.createOscillator();
        oscSaw2.type = "sawtooth";
        oscSaw2.frequency.setValueAtTime(freq, now);
        oscSaw2.detune.setValueAtTime(10, now);
        oscSaw2.connect(padFilter);
        oscSaw2.start(now);
        oscSaw2.stop(actualReleaseTrigger + release);

      } else if (this.soundSource === "strings") {
        // --- ORCHESTRAL WARM STRINGS ---
        
        const stringFilter = this.ctx.createBiquadFilter();
        stringFilter.type = "lowpass";
        stringFilter.frequency.setValueAtTime(freq * 2.8, now);
        stringFilter.Q.setValueAtTime(1.0, now);
        stringFilter.connect(gainNode);

        // 1. Detuned String Saw 1 (-8 cents)
        const oscSaw1 = this.ctx.createOscillator();
        oscSaw1.type = "sawtooth";
        oscSaw1.frequency.setValueAtTime(freq, now);
        oscSaw1.detune.setValueAtTime(-8, now);
        oscSaw1.connect(stringFilter);
        oscSaw1.start(now);
        oscSaw1.stop(actualReleaseTrigger + release);

        // 2. Detuned String Saw 2 (+8 cents)
        const oscSaw2 = this.ctx.createOscillator();
        oscSaw2.type = "sawtooth";
        oscSaw2.frequency.setValueAtTime(freq, now);
        oscSaw2.detune.setValueAtTime(8, now);
        oscSaw2.connect(stringFilter);
        oscSaw2.start(now);
        oscSaw2.stop(actualReleaseTrigger + release);

        // 3. Air high octave violin simulation (Triangle wave at 2 * freq)
        const oscHigh = this.ctx.createOscillator();
        oscHigh.type = "triangle";
        oscHigh.frequency.setValueAtTime(freq * 2, now);
        
        const highGain = this.ctx.createGain();
        highGain.gain.setValueAtTime(0.2, now);
        highGain.connect(stringFilter);
        
        oscHigh.connect(highGain);
        oscHigh.start(now);
        oscHigh.stop(actualReleaseTrigger + release);

      } else {
        // --- ORIGINAL VINTAGE SYNTH ---
        
        // 1. Triangle wave
        const osc1 = this.ctx.createOscillator();
        osc1.type = "triangle";
        osc1.frequency.setValueAtTime(freq, now);
        osc1.connect(gainNode);
        osc1.start(now);
        osc1.stop(actualReleaseTrigger + release);

        // 2. Sine wave
        const osc2 = this.ctx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(freq, now);
        osc2.connect(gainNode);
        osc2.start(now);
        osc2.stop(actualReleaseTrigger + release);

        // 3. Filtered sawtooth wave
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(freq * 2, now);
        filter.Q.setValueAtTime(1, now);
        filter.connect(gainNode);

        const osc3 = this.ctx.createOscillator();
        osc3.type = "sawtooth";
        osc3.frequency.setValueAtTime(freq, now);
        osc3.connect(filter);
        osc3.start(now);
        osc3.stop(actualReleaseTrigger + release);
      }
    });
  }

  // Play a single note (useful for previewing single clicks)
  public playSingleNote(midiNumber: number, durationSeconds: number = 0.3) {
    this.playChord([midiNumber], durationSeconds);
  }
}

export const synth = new AudioSynthEngine();
export default synth;
