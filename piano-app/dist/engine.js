export const HIT_WINDOW = 0.19;
export const PERFECT_WINDOW = 0.065;
export const GOOD_WINDOW = 0.13;

/** Pure timing/scoring model. Seconds are supplied by the monotonic UI clock. */
export class RhythmGame {
  constructor(track) {
    this.track = track;
    this.notes = track.notes.map(note => ({...note, status:'pending'}));
    this.state = 'ready'; this.time = 0; this.score = 0; this.combo = 0;
    this.maxCombo = 0; this.lives = 3; this.hits = 0; this.perfect = 0;
    this.misses = 0; this.wrong = 0; this.quality = 0; this.events = [];
  }
  start() { if (this.state === 'ready') this.state = 'playing'; }
  pause() { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'playing'; }
  advance(time) {
    if (this.state !== 'playing' || !Number.isFinite(time) || time < this.time) return;
    this.time = time;
    for (const note of this.notes) {
      if (this.state !== 'playing') break;
      if (note.status === 'pending' && time - note.time > HIT_WINDOW + 1e-9) {
        note.status = 'miss'; this.penalty('miss', note.lane);
      }
    }
    if (this.state === 'playing' && time >= this.track.duration) {
      this.state = 'completed'; this.events.push({type:'completed'});
    }
  }
  hit(lane) {
    if (this.state !== 'playing' || !Number.isInteger(lane) || lane < 0 || lane > 3) return null;
    const candidates = this.notes.filter(n=>n.status === 'pending' && n.lane === lane && Math.abs(n.time-this.time) <= HIT_WINDOW + 1e-9);
    const note = candidates.sort((a,b)=>Math.abs(a.time-this.time)-Math.abs(b.time-this.time))[0];
    if (!note) {
      // Warm-up and the final resonance are safe to tap.
      if (this.time >= this.notes[0].time - HIT_WINDOW && this.time <= this.notes.at(-1).time + HIT_WINDOW) this.penalty('wrong', lane);
      return null;
    }
    const delta = Math.abs(note.time-this.time);
    const grade = delta <= PERFECT_WINDOW + 1e-9 ? 'perfect' : delta <= GOOD_WINDOW + 1e-9 ? 'good' : 'ok';
    const quality = grade === 'perfect' ? 1 : grade === 'good' ? .8 : .5;
    note.status = 'hit'; this.hits++; this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (grade === 'perfect') this.perfect++;
    this.quality += quality;
    const multiplier = Math.min(4, 1 + Math.floor((this.combo - 1) / 10));
    this.score += Math.round(100 * quality * multiplier);
    this.events.push({type:'hit',grade,lane,note,multiplier});
    return grade;
  }
  penalty(type,lane) {
    this.combo = 0; this.lives--; this[type === 'miss' ? 'misses' : 'wrong']++;
    this.events.push({type,lane});
    if (this.lives <= 0) { this.state = 'failed'; this.events.push({type:'failed'}); }
  }
  drainEvents() { return this.events.splice(0); }
  result() {
    return {trackId:this.track.id,completed:this.state==='completed',score:this.score,maxCombo:this.maxCombo,hits:this.hits,perfect:this.perfect,misses:this.misses,wrong:this.wrong,accuracy:Math.round(100*this.quality/(this.notes.length+this.wrong)),totalNotes:this.notes.length};
  }
}
