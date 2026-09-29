import test from 'node:test';
import assert from 'node:assert/strict';
import {RhythmGame,HIT_WINDOW} from '../dist/engine.js';
import {tracks,midi} from '../dist/tracks.js';
import {readProgress,saveProgress,recordResult} from '../dist/storage.js';

for(const track of tracks){
  test(`${track.id}: chart is playable and a perfect run completes`,()=>{
    const game=new RhythmGame(track);game.start();
    track.notes.forEach((n,i)=>{
      assert.ok(n.lane>=0&&n.lane<4);
      assert.ok(n.midi>=21&&n.midi<=108);
      if(i)assert.ok(n.time>track.notes[i-1].time);
      game.advance(n.time);assert.equal(game.hit(n.lane),'perfect');
    });
    game.advance(track.duration);
    assert.equal(game.state,'completed');assert.equal(game.result().accuracy,100);
    assert.equal(game.maxCombo,track.notes.length);assert.equal(game.lives,3);
    assert.ok(game.score>track.notes.length*100);
  });
}
test('timing windows reward accuracy at early and late boundaries',()=>{
  for(const [offset,grade] of [[-.19,'ok'],[-.13,'good'],[-.065,'perfect'],[0,'perfect'],[.065,'perfect'],[.13,'good'],[.19,'ok']]){
    const game=new RhythmGame(tracks[0]);game.start();game.advance(game.notes[0].time+offset);assert.equal(game.hit(0),grade);
  }
});
test('three missed notes end the game once and never make lives negative',()=>{
  const game=new RhythmGame(tracks[0]);game.start();game.advance(100);
  assert.equal(game.state,'failed');assert.equal(game.lives,0);assert.equal(game.misses,3);
  game.advance(200);assert.equal(game.hit(0),null);
  assert.equal(game.drainEvents().filter(e=>e.type==='failed').length,1);
  assert.equal(game.drainEvents().length,0);
});
test('pause freezes the clock and rejects input, resume preserves position',()=>{
  const game=new RhythmGame(tracks[0]);game.start();game.advance(1);game.pause();
  game.advance(200);assert.equal(game.time,1);assert.equal(game.hit(0),null);assert.equal(game.lives,3);
  game.resume();game.advance(game.notes[0].time);assert.equal(game.hit(0),'perfect');
});
test('wrong lanes consume a life, reset combo and cannot score twice',()=>{
  const game=new RhythmGame(tracks[0]);game.start();game.advance(game.notes[0].time);game.hit(0);
  assert.equal(game.score,100);game.hit(0);assert.equal(game.score,100);assert.equal(game.lives,2);assert.equal(game.combo,0);
});
test('invalid lane and non-monotonic clock are ignored',()=>{
  const game=new RhythmGame(tracks[0]);game.start();game.advance(1);game.advance(-20);game.advance(NaN);
  assert.equal(game.time,1);assert.equal(game.hit(-1),null);assert.equal(game.hit(4),null);assert.equal(game.hit(.5),null);assert.equal(game.lives,3);
});
test('passing just beyond the late boundary marks the note missed',()=>{
  const game=new RhythmGame(tracks[0]);game.start();game.advance(game.notes[0].time+HIT_WINDOW+.001);
  assert.equal(game.notes[0].status,'miss');assert.equal(game.lives,2);
});
test('records preserve completion and personal best after a worse retry',()=>{
  const p=readProgress({getItem:()=>null});
  assert.equal(recordResult(p,{trackId:'joy',score:5000,maxCombo:44,accuracy:98,completed:true}),true);
  assert.equal(recordResult(p,{trackId:'joy',score:10,maxCombo:1,accuracy:2,completed:false}),false);
  assert.deepEqual(p.records.joy,{score:5000,maxCombo:44,accuracy:98,completed:true});assert.equal(p.plays,2);
});
test('corrupt and unavailable device storage never prevent playing',()=>{
  assert.deepEqual(readProgress({getItem:()=>'{broken'}).records,{});
  assert.equal(readProgress({getItem:()=>JSON.stringify({plays:-1,records:{joy:{score:'<script>',maxCombo:Infinity,accuracy:900,completed:'true'}}})}).records.joy.score,0);
  assert.equal(saveProgress({}, {setItem:()=>{throw new Error('quota');}}),false);
});
test('MIDI conversion supports the sharp notes in Fur Elise',()=>{assert.equal(midi('A4'),69);assert.equal(midi('D#5'),75);assert.throws(()=>midi('bad'));});

test('hold notes: pressing enters holding state and holding to the end completes note', () => {
  const track = tracks[0];
  const game = new RhythmGame(track);
  game.start();
  const holdNote = game.notes.find(n => n.isHold);
  assert.ok(holdNote, 'track should have at least one hold note');

  // Play through up to the hold note
  for (const n of game.notes) {
    game.advance(n.time);
    if (n.id === holdNote.id) {
      assert.equal(game.press(n.lane), 'perfect');
      assert.equal(n.status, 'holding');
      break;
    } else {
      game.press(n.lane);
    }
  }

  // Advance partway: hold tick event
  game.advance(holdNote.time + 0.15);
  const events = game.drainEvents();
  assert.ok(events.some(e => e.type === 'hold_tick' || e.type === 'hold_start'));

  // Advance to completion
  game.advance(holdNote.time + holdNote.holdDuration);
  assert.equal(holdNote.status, 'held');
  const finalEvents = game.drainEvents();
  assert.ok(finalEvents.some(e => e.type === 'hold_complete'));
});

test('hold notes: early release breaks hold, consumes a life and penalizes', () => {
  const track = tracks[0];
  const game = new RhythmGame(track);
  game.start();
  const holdNote = game.notes.find(n => n.isHold);

  // Play through up to the hold note
  for (const n of game.notes) {
    game.advance(n.time);
    if (n.id === holdNote.id) {
      assert.equal(game.press(n.lane), 'perfect');
      assert.equal(n.status, 'holding');
      break;
    } else {
      game.press(n.lane);
    }
  }

  const prevLives = game.lives;
  // Released way too early
  game.advance(holdNote.time + 0.1);
  game.release(holdNote.lane);
  assert.equal(holdNote.status, 'dropped');
  assert.equal(game.lives, prevLives - 1);
  const events = game.drainEvents();
  assert.ok(events.some(e => e.type === 'hold_break'));
});

test('speed and score multiplier scale dynamically with combo', () => {
  const game = new RhythmGame(tracks[0]);
  assert.equal(game.speed, 1);
  assert.equal(game.multiplier, 1);

  game.combo = 20;
  assert.ok(game.speed > 1.2);
  assert.equal(game.multiplier, 2);

  game.combo = 75;
  assert.ok(game.speed >= 1.9);
  assert.equal(game.multiplier, 8);
});

test('endless mode generates subsequent melody loops seamlessly', () => {
  const track = tracks[0];
  const game = new RhythmGame(track, { endless: true });
  game.start();
  const initialNotes = [...game.notes];

  for (const n of initialNotes) {
    game.advance(n.time);
    game.hit(n.lane);
  }

  // New loop should have been appended seamlessly while playing
  assert.ok(game.notes.length > initialNotes.length, 'New notes should have been queued');
  assert.ok(game.loop >= 1);
  assert.equal(game.state, 'playing'); // Did not finish at track.duration
});


