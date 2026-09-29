import { createLoopNotes } from './tracks.js';

export const HIT_WINDOW = 0.19;
export const PERFECT_WINDOW = 0.065;
export const GOOD_WINDOW = 0.13;
export const HOLD_TOLERANCE = 0.15;

/** Pure timing/scoring model. Seconds are supplied by the monotonic UI clock. */
export class RhythmGame {
  constructor(track, options = {}) {
    this.track = track;
    this.options = { endless: false, ...options };
    this.notes = track.notes.map(note => ({...note, status:'pending'}));
    this.state = 'ready'; this.time = 0; this.score = 0; this.combo = 0;
    this.maxCombo = 0; this.lives = 3; this.hits = 0; this.perfect = 0;
    this.misses = 0; this.wrong = 0; this.quality = 0; this.events = [];
    this.holdingNotes = new Map(); // lane -> note
    this.activeLanes = new Set();
    this.loop = 0;
  }
  get speed() {
    return Math.min(2.2, 1 + this.combo * 0.012);
  }
  get multiplier() {
    return Math.min(8, 1 + Math.floor(Math.max(0, this.combo - 1) / 10));
  }
  start() { if (this.state === 'ready') this.state = 'playing'; }
  pause() { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'playing'; }

  advance(time) {
    if (this.state !== 'playing' || !Number.isFinite(time) || time < this.time) return;
    this.time = time;

    // Check misses for pending notes
    for (const note of this.notes) {
      if (this.state !== 'playing') break;
      if (note.status === 'pending' && time - note.time > HIT_WINDOW + 1e-9) {
        note.status = 'miss';
        this.penalty('miss', note.lane);
      }
    }

    // Process holding notes
    for (const [lane, note] of [...this.holdingNotes.entries()]) {
      if (this.state !== 'playing') break;
      // Hold tick every 0.1s
      if (time - note.lastTickTime >= 0.1) {
        note.lastTickTime = time;
        this.score += Math.round(15 * this.multiplier);
        this.events.push({ type: 'hold_tick', lane, note, multiplier: this.multiplier });
      }
      // If reached the end of the hold duration
      if (time >= note.time + note.holdDuration - 0.04) {
        this.completeHold(lane, note);
      }
    }

    // Endless mode check: queue next loop if approaching the end
    if (this.options.endless && this.track.sequence && typeof createLoopNotes === 'function') {
      const lastNote = this.notes.at(-1);
      if (lastNote && time >= lastNote.time - 5) {
        this.loop++;
        const nextNotes = createLoopNotes(this.track, this.loop).map(n => ({ ...n, status: 'pending' }));
        this.notes.push(...nextNotes);
        this.events.push({ type: 'loop', loop: this.loop });
      }
    }

    // Completion in non-endless mode
    if (!this.options.endless && this.state === 'playing' && time >= this.track.duration) {
      this.state = 'completed';
      this.events.push({ type: 'completed' });
    }
  }

  press(lane) {
    if (this.state !== 'playing' || !Number.isInteger(lane) || lane < 0 || lane > 3) return null;
    this.activeLanes.add(lane);
    const candidates = this.notes.filter(n => n.status === 'pending' && n.lane === lane && Math.abs(n.time - this.time) <= HIT_WINDOW + 1e-9);
    const note = candidates.sort((a,b) => Math.abs(a.time - this.time) - Math.abs(b.time - this.time))[0];
    if (!note) {
      if (this.notes.length && this.time >= this.notes[0].time - HIT_WINDOW && this.time <= this.notes.at(-1).time + HIT_WINDOW) {
        this.penalty('wrong', lane);
      }
      return null;
    }
    const delta = Math.abs(note.time - this.time);
    const grade = delta <= PERFECT_WINDOW + 1e-9 ? 'perfect' : delta <= GOOD_WINDOW + 1e-9 ? 'good' : 'ok';
    const quality = grade === 'perfect' ? 1 : grade === 'good' ? .8 : .5;

    this.hits++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (grade === 'perfect') this.perfect++;

    const multiplier = this.multiplier;

    if (note.isHold) {
      note.status = 'holding';
      note.holdGrade = grade;
      note.quality = quality;
      note.lastTickTime = this.time;
      this.holdingNotes.set(lane, note);
      this.quality += quality * 0.5;
      this.score += Math.round(50 * quality * multiplier);
      this.events.push({ type: 'hold_start', grade, lane, note, multiplier });
    } else {
      note.status = 'hit';
      this.quality += quality;
      this.score += Math.round(100 * quality * multiplier);
      this.events.push({ type: 'hit', grade, lane, note, multiplier });
    }
    return grade;
  }

  hit(lane) {
    return this.press(lane);
  }

  release(lane) {
    if (!Number.isInteger(lane)) return;
    this.activeLanes.delete(lane);
    if (!this.holdingNotes.has(lane)) return;
    const note = this.holdingNotes.get(lane);
    const remaining = (note.time + note.holdDuration) - this.time;
    if (remaining <= HOLD_TOLERANCE) {
      this.completeHold(lane, note);
    } else {
      // Early release penalty / break
      this.holdingNotes.delete(lane);
      note.status = 'dropped';
      this.penalty('miss', lane);
      this.events.push({ type: 'hold_break', lane, note });
    }
  }

  completeHold(lane, note) {
    if (note.status !== 'holding') return;
    this.holdingNotes.delete(lane);
    note.status = 'held';
    this.quality += (note.quality || 1) * 0.5;
    const multiplier = this.multiplier;
    this.score += Math.round(150 * multiplier);
    this.events.push({ type: 'hold_complete', lane, note, multiplier });
  }

  penalty(type, lane) {
    this.combo = 0;
    this.lives--;
    this[type === 'miss' ? 'misses' : 'wrong']++;
    if (this.holdingNotes.has(lane)) {
      const n = this.holdingNotes.get(lane);
      n.status = 'dropped';
      this.holdingNotes.delete(lane);
    }
    this.events.push({ type, lane });
    if (this.lives <= 0) {
      this.state = 'failed';
      this.events.push({ type: 'failed' });
    }
  }

  drainEvents() {
    return this.events.splice(0);
  }

  result() {
    return {
      trackId: this.track.id,
      completed: this.state === 'completed',
      score: this.score,
      maxCombo: this.maxCombo,
      hits: this.hits,
      perfect: this.perfect,
      misses: this.misses,
      wrong: this.wrong,
      accuracy: Math.round(100 * this.quality / (this.notes.length + this.wrong)),
      totalNotes: this.notes.length,
      loop: this.loop,
      speed: this.speed
    };
  }
}
