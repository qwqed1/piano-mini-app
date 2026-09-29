// Public-domain melodies, newly encoded short monophonic arrangements.
const joy = [
  ['E4',1],['E4',1],['F4',1],['G4',1],['G4',1],['F4',1],['E4',1],['D4',1],
  ['C4',1],['C4',1],['D4',1],['E4',1],['E4',1.5],['D4',.5],['D4',2],
  ['E4',1],['E4',1],['F4',1],['G4',1],['G4',1],['F4',1],['E4',1],['D4',1],
  ['C4',1],['C4',1],['D4',1],['E4',1],['D4',1.5],['C4',.5],['C4',2],
  ['D4',1],['D4',1],['E4',1],['C4',1],['D4',1],['E4',.5],['F4',.5],['E4',1],['C4',1],
  ['D4',1],['E4',.5],['F4',.5],['E4',1],['D4',1],['C4',1],['D4',1],['G3',2]
];
const star = [
  ['C4',1],['C4',1],['G4',1],['G4',1],['A4',1],['A4',1],['G4',2],
  ['F4',1],['F4',1],['E4',1],['E4',1],['D4',1],['D4',1],['C4',2],
  ['G4',1],['G4',1],['F4',1],['F4',1],['E4',1],['E4',1],['D4',2],
  ['G4',1],['G4',1],['F4',1],['F4',1],['E4',1],['E4',1],['D4',2],
  ['C4',1],['C4',1],['G4',1],['G4',1],['A4',1],['A4',1],['G4',2],
  ['F4',1],['F4',1],['E4',1],['E4',1],['D4',1],['D4',1],['C4',2]
];
const elise = [
  ['E5',.5],['D#5',.5],['E5',.5],['D#5',.5],['E5',.5],['B4',.5],['D5',.5],['C5',.5],['A4',1.5],
  ['C4',.5],['E4',.5],['A4',.5],['B4',1.5],['E4',.5],['G#4',.5],['B4',.5],['C5',1.5],
  ['E4',.5],['E5',.5],['D#5',.5],['E5',.5],['D#5',.5],['E5',.5],['B4',.5],['D5',.5],['C5',.5],['A4',1.5],
  ['C4',.5],['E4',.5],['A4',.5],['B4',1.5],['E4',.5],['C5',.5],['B4',.5],['A4',2],
  ['B4',.5],['C5',.5],['D5',.5],['E5',1.5],['G4',.5],['F5',.5],['E5',.5],['D5',1.5],
  ['F4',.5],['E5',.5],['D5',.5],['C5',1.5],['E4',.5],['D5',.5],['C5',.5],['B4',1.5],
  ['E4',.5],['E5',.5],['D#5',.5],['E5',.5],['D#5',.5],['E5',.5],['B4',.5],['D5',.5],['C5',.5],['A4',2]
];
export function midi(pitch) {
  const match = /^([A-G])(#?)(\d)$/.exec(pitch);
  if (!match) throw new Error('Invalid pitch');
  return (Number(match[3]) + 1) * 12 + {C:0,D:2,E:4,F:5,G:7,A:9,B:11}[match[1]] + (match[2] ? 1 : 0);
}
export function chart(sequence, bpm, lanes, offsetTime = 2.2, idOffset = 0, loop = 0) {
  let beat = 0;
  return sequence.map(([pitch, beats], index) => {
    const isHold = beats >= 1.2;
    const duration = beats * 60 / bpm;
    const note = {
      id: idOffset + index,
      lane: lanes[index % lanes.length],
      midi: midi(pitch),
      time: offsetTime + beat * 60 / bpm,
      duration,
      isHold,
      holdDuration: isHold ? duration : 0,
      loop
    };
    beat += beats;
    return note;
  });
}
const joyLanes = [0,1,2,3,3,2,1,0,0,1,2,3,2,1,0];
const starLanes = [0,0,2,2,3,3,2,1,1,2,2,1,1,0];
const eliseLanes = [3,2,3,2,3,1,2,1,0,0,1,2,3,0,1,3,2];

export function createLoopNotes(track, loop = 1) {
  const offsetTime = 2.2 + loop * track.loopDuration;
  const idOffset = loop * track.sequence.length;
  return chart(track.sequence, track.bpm, track.lanes, offsetTime, idOffset, loop);
}

export const tracks = [
  {id:'joy',title:'Ода к радости',composer:'Людвиг ван Бетховен',difficulty:'easy',bpm:86,cover:'',symbol:'♪',travel:2.1,sequence:joy,lanes:joyLanes,totalBeats:joy.reduce((s,[,b])=>s+b,0),notes:chart(joy,86,joyLanes)},
  {id:'star',title:'Маленькая звезда',composer:'Французская народная мелодия',difficulty:'easy',bpm:100,cover:'cover-lilac',symbol:'✧',travel:2.1,sequence:star,lanes:starLanes,totalBeats:star.reduce((s,[,b])=>s+b,0),notes:chart(star,100,starLanes)},
  {id:'elise',title:'К Элизе',composer:'Людвиг ван Бетховен',difficulty:'medium',bpm:112,cover:'cover-orange',symbol:'♫',travel:1.75,sequence:elise,lanes:eliseLanes,totalBeats:elise.reduce((s,[,b])=>s+b,0),notes:chart(elise,112,eliseLanes)}
].map(track => {
  const loopDuration = track.totalBeats * 60 / track.bpm;
  return {
    ...track,
    loopDuration,
    duration: track.notes.at(-1).time + track.notes.at(-1).duration + .7
  };
});

