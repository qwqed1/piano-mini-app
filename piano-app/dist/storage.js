const KEY='piano.progress.v1';
const number=(v,max=100000000)=>Number.isFinite(v)&&v>=0&&v<=max?v:0;
export function readProgress(storage) {
  try {
    storage ??= globalThis.localStorage;
    const raw=JSON.parse(storage.getItem(KEY)||'{}');
    const records={};
    for(const id of ['joy','star','elise']) {
      const r=raw?.records?.[id];
      if(r && typeof r==='object') records[id]={score:number(r.score),maxCombo:number(r.maxCombo,1000),accuracy:number(r.accuracy,100),completed:r.completed===true};
    }
    return {version:1,plays:number(raw?.plays),muted:raw?.muted===true,records};
  } catch { return {version:1,plays:0,muted:false,records:{}}; }
}
export function saveProgress(progress,storage) {
  try { (storage ?? globalThis.localStorage).setItem(KEY,JSON.stringify(progress));return true; } catch { return false; }
}
export function recordResult(progress,result) {
  const previous=progress.records[result.trackId];
  const newBest=result.score>0 && (!previous || result.score>previous.score);
  progress.plays++;
  progress.records[result.trackId]={score:Math.max(previous?.score||0,result.score),maxCombo:Math.max(previous?.maxCombo||0,result.maxCombo),accuracy:Math.max(previous?.accuracy||0,result.accuracy),completed:!!previous?.completed||result.completed};
  return newBest;
}
