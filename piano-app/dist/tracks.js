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
function chart(sequence, bpm, lanes) {
  let beat = 0;
  return sequence.map(([pitch, beats], index) => {
    const note = { id: index, lane: lanes[index % lanes.length], midi: midi(pitch), time: 2.2 + beat * 60 / bpm, duration: beats * 60 / bpm };
    beat += beats;
    return note;
  });
}
export const tracks = [
  {id:'joy',title:'Ода к радости',composer:'Людвиг ван Бетховен',difficulty:'easy',bpm:86,cover:'',symbol:'♪',travel:2.1,notes:chart(joy,86,[0,1,2,3,3,2,1,0,0,1,2,3,2,1,0])},
  {id:'star',title:'Маленькая звезда',composer:'Французская народная мелодия',difficulty:'easy',bpm:100,cover:'cover-lilac',symbol:'✧',travel:2.1,notes:chart(star,100,[0,0,2,2,3,3,2,1,1,2,2,1,1,0])},
  {id:'elise',title:'К Элизе',composer:'Людвиг ван Бетховен',difficulty:'medium',bpm:112,cover:'cover-orange',symbol:'♫',travel:1.75,notes:chart(elise,112,[3,2,3,2,3,1,2,1,0,0,1,2,3,0,1,3,2])}
].map(track => ({...track, duration:track.notes.at(-1).time + track.notes.at(-1).duration + .7}));
