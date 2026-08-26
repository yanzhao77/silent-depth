// SILENT DEPTH — WebAudio mock for headless builder tests (tests/tools/lib)
// ---------------------------------------------------------------------------
// A minimal, typed AudioContext/AudioNode stub sufficient to drive the pure
// SFX builders in src/audio/audio.ts without a real WebAudio implementation.
// Nodes record their connect/disconnect edges and AudioParam automation so a
// test can assert the graph topology and envelope/frequency scheduling.
// ---------------------------------------------------------------------------

/** Records scheduled automation on an audio param. */
export interface ParamLogEntry {
  method: string;
  value: number;
  time: number;
}

export class MockAudioParam {
  value: number;
  readonly log: ParamLogEntry[] = [];

  constructor(value = 0) {
    this.value = value;
  }

  setValueAtTime(v: number, t: number): this {
    this.value = v;
    this.log.push({ method: 'setValueAtTime', value: v, time: t });
    return this;
  }

  linearRampToValueAtTime(v: number, t: number): this {
    this.value = v;
    this.log.push({ method: 'linearRampToValueAtTime', value: v, time: t });
    return this;
  }

  exponentialRampToValueAtTime(v: number, t: number): this {
    this.value = v;
    this.log.push({ method: 'exponentialRampToValueAtTime', value: v, time: t });
    return this;
  }

  setTargetAtTime(v: number, t: number, _tc: number): this {
    this.value = v;
    this.log.push({ method: 'setTargetAtTime', value: v, time: t });
    return this;
  }

  cancelScheduledValues(t: number): this {
    this.log.push({ method: 'cancelScheduledValues', value: 0, time: t });
    return this;
  }
}

export interface MockNodeEdge {
  to: MockAudioNode;
  input: 0 | 1 | 2;
}

export class MockAudioNode {
  readonly nodeType: string;
  readonly incoming: MockNodeEdge[] = [];
  readonly outgoing: MockAudioNode[] = [];
  startedAt: number | null = null;
  stoppedAt: number | null = null;

  constructor(nodeType: string) {
    this.nodeType = nodeType;
  }

  connect(destination: MockAudioNode | MockAudioParam | AudioParam, input?: number): this {
    if (destination instanceof MockAudioNode) {
      this.outgoing.push(destination);
      const i = (input ?? 0) as 0 | 1 | 2;
      destination.incoming.push({ to: this, input: i });
    }
    return this;
  }

  disconnect(): void {
    // disconnected edges intentionally not tracked in detail — builders only
    // call it from graph.dispose() to release nodes.
  }

  start(when = 0): void {
    this.startedAt = when;
  }

  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

export class MockOscillator extends MockAudioNode {
  type: string = 'sine';
  readonly frequency = new MockAudioParam(440);
  readonly detune = new MockAudioParam(0);
  constructor() {
    super('oscillator');
  }
}

export class MockGain extends MockAudioNode {
  readonly gain = new MockAudioParam(1);
  constructor() {
    super('gain');
  }
}

export class MockBiquadFilter extends MockAudioNode {
  type: string = 'lowpass';
  readonly frequency = new MockAudioParam(350);
  readonly Q = new MockAudioParam(1);
  constructor() {
    super('biquadFilter');
  }
}

export class MockDelay extends MockAudioNode {
  readonly delayTime = new MockAudioParam(0);
  constructor(public maxDelayTime = 2) {
    super('delay');
  }
}

export class MockBuffer {
  readonly length: number;
  constructor(
    readonly numberOfChannels: number,
    readonly frames: number,
    readonly sampleRate: number,
  ) {
    this.length = frames;
  }
  /** Returns a fresh zeroed channel (tracked for noise assertions). */
  getChannelData(channel: number): Float32Array {
    return this.channels[channel] ?? (this.channels[channel] = new Float32Array(this.frames));
  }
  private channels: Record<number, Float32Array> = {};
}

export class MockBufferSource extends MockAudioNode {
  buffer: MockBuffer | null = null;
  loop: boolean = false;
  constructor() {
    super('bufferSource');
  }
}

export interface MockContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly sources: MockBufferSource[];
  readonly oscillators: MockOscillator[];
  createOscillator(): MockOscillator;
  createGain(): MockGain;
  createBiquadFilter(): MockBiquadFilter;
  createDelay(maxDelayTime?: number): MockDelay;
  createBuffer(channels: number, frames: number, sampleRate: number): MockBuffer;
  createBufferSource(): MockBufferSource;
}

/**
 * Build a fresh WebAudio context double. `framewise` node construction is
 * recorded so tests can assert which node types a builder instantiated.
 */
export function createMockAudioContext(sampleRate = 48000, currentTime = 0): MockContext {
  const sources: MockBufferSource[] = [];
  const oscillators: MockOscillator[] = [];
  const ctx: MockContext = {
    currentTime,
    sampleRate,
    get sources() {
      return sources;
    },
    get oscillators() {
      return oscillators;
    },
    createOscillator(): MockOscillator {
      const n = new MockOscillator();
      oscillators.push(n);
      return n;
    },
    createGain(): MockGain {
      return new MockGain();
    },
    createBiquadFilter(): MockBiquadFilter {
      return new MockBiquadFilter();
    },
    createDelay(maxDelayTime = 2): MockDelay {
      return new MockDelay(maxDelayTime);
    },
    createBuffer(channels: number, frames: number, rate: number): MockBuffer {
      return new MockBuffer(channels, frames, rate);
    },
    createBufferSource(): MockBufferSource {
      const n = new MockBufferSource();
      sources.push(n);
      return n;
    },
  };
  return ctx;
}

/** Recursively collect every node connected (transitively) from a root node. */
export function collectConnectedNodes(root: MockAudioNode): MockAudioNode[] {
  const seen = new Set<MockAudioNode>();
  const stack: MockAudioNode[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const child of n.outgoing) stack.push(child);
  }
  return [...seen];
}
