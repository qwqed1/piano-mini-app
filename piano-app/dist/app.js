import { tracks } from './tracks.js';
import { RhythmGame } from './engine.js';
import { PianoAudio } from './audio.js';
import { readProgress,saveProgress,recordResult } from './storage.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const audio=new PianoAudio();
const progress=readProgress();
const canvas=$('#game-canvas'), ctx=canvas.getContext('2d');
const colors=['#d6f880','#cbb8ef','#eac49b','#d6f880'];
let selected=tracks[0], filter='all', game=null, phase='home', frame=0;
let startedAt=0, baseTime=0, countdownAt=0, countdownLength=3, lastCountdown=-1;
let width=0,height=0, flashes=[0,0,0,0], particles=[], feedbackUntil=0, storedResult=false;
let toastTimer, savedScroll=0, previousFocus=null;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const formatTime=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const soundSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 4 5 9H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
const mutedSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 4 5 9H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/></svg>';

function toast(message){ $('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3800); }
function persist(){ if(!saveProgress(progress))toast('Не удалось сохранить рекорд на этом устройстве.'); }
function renderSound(){ audio.setMuted(progress.muted);$('#sound-toggle').innerHTML=progress.muted?mutedSvg:soundSvg;$('#sound-toggle').setAttribute('aria-pressed',String(progress.muted));$('#sound-toggle').setAttribute('aria-label',progress.muted?'Включить звук':'Выключить звук'); }
function renderTracks(){
  $('#track-list').innerHTML=tracks.filter(t=>filter==='all'||t.difficulty===filter).map(t=>`<button class="track-row ${t.id===selected.id?'selected':''}" data-track="${t.id}" aria-pressed="${t.id===selected.id}" aria-label="Выбрать ${t.title}"><span class="track-cover ${t.cover}">${t.symbol}</span><span class="track-info"><strong>${t.title}</strong><small>${t.composer}</small></span><span class="track-side"><span class="difficulty ${t.difficulty}">${t.difficulty==='easy'?'Легко':'Сложнее'}</span><small>${progress.records[t.id]?.completed?'✓ Пройдено · ':''}${Math.ceil(t.duration)} сек</small></span><span class="track-play" aria-hidden="true"><span class="play-triangle"></span></span></button>`).join('');
}
function selectTrack(id){
  const track=tracks.find(t=>t.id===id);if(!track)throw new Error('Неизвестная мелодия');
  selected=track;$('#featured-title').textContent=track.title;$('#featured-composer').textContent=track.composer;
  $('#featured-difficulty').textContent=track.difficulty==='easy'?'Легко':'Сложнее';$('#featured-difficulty').className=`difficulty ${track.difficulty}`;
  $('#featured-meta').innerHTML=`${Math.ceil(track.duration)} сек <span>·</span> ${track.bpm} BPM <span>·</span> ${track.notes.length} нот`;
  renderTracks();
}
function renderProgress(){
  const records=Object.values(progress.records), completed=records.filter(r=>r.completed).length;
  $('#completed-count').textContent=completed;$('#best-combo').textContent=Math.max(0,...records.map(r=>r.maxCombo))||'—';$('#total-plays').textContent=progress.plays;
  $$('.progress-bars i').forEach((el,i)=>el.classList.toggle('complete',i<completed));
  $('#progress-message').textContent=completed===3?'Вся коллекция пройдена. Попробуй собрать идеальную серию!':completed>0?'Отличное начало. Следующая мелодия уже ждёт.':'Большая музыка начинается с первого тапа.';
}
function openDialog(content){previousFocus=document.activeElement;$('#dialog-content').innerHTML=content;$('#info-dialog').showModal();}
function showHelp(){openDialog('<div class="dialog-eyebrow">ОДИН ТАП — ОДНА НОТА</div><h2>Почувствуй ритм</h2><ol><li><b>Смотри на линию.</b> Нажми на дорожку, когда центр падающей клавиши окажется на светящейся линии.</li><li><b>Играй пальцами</b> или клавишами <b>D · F · J · K</b>. Нажимать можно в любом месте нужной дорожки.</li><li><b>Собирай комбо.</b> Каждые 10 попаданий увеличивают множитель, до ×4.</li><li><b>У тебя три жизни.</b> Пропущенная нота или нажатие мимо ритма забирает одну. Клавиша Esc ставит игру на паузу.</li></ol><p>Для начала попробуй «Оду к радости». Звук лучше слышен в наушниках.</p><button class="primary-button" data-action="close-dialog">Всё понятно</button>');}
function showRecords(){openDialog(`<div class="dialog-eyebrow">ТВОЯ КОЛЛЕКЦИЯ ПОБЕД</div><h2>Мои рекорды</h2><div class="records-list">${tracks.map(t=>{const r=progress.records[t.id];return `<div class="record-row"><div><strong>${t.title}</strong><small>${r?`${r.completed?'Пройдено':'Ещё в процессе'} · комбо ${r.maxCombo} · точность ${r.accuracy}%`:'Пока не сыграно'}</small></div><b>${r?r.score.toLocaleString('ru-RU'):'—'}</b></div>`;}).join('')}</div><p>Рекорды сохраняются в этом браузере на этом устройстве.</p>`);}

const tg=window.Telegram?.WebApp;
const inTelegram=Boolean(tg?.initData);
function safeTelegram(action){try{if(inTelegram)action(tg);}catch{/* Browser and older Telegram clients remain supported. */}}
function syncInsets(){safeTelegram(t=>{const top=(t.safeAreaInset?.top||0)+(t.contentSafeAreaInset?.top||0);const bottom=Math.max(t.safeAreaInset?.bottom||0,t.contentSafeAreaInset?.bottom||0);document.documentElement.style.setProperty('--tg-top',`${top}px`);document.documentElement.style.setProperty('--tg-bottom',`${bottom}px`);});}
safeTelegram(t=>{t.ready();t.expand();t.setHeaderColor?.('#121411');t.setBackgroundColor?.('#121411');t.onEvent?.('deactivated',()=>pauseGame());t.onEvent?.('safeAreaChanged',syncInsets);t.onEvent?.('contentSafeAreaChanged',syncInsets);t.BackButton?.onClick(()=>phase==='result'?goHome():pauseGame());const first=t.initDataUnsafe?.user?.first_name;if(first)$('#avatar').textContent=first[0].toUpperCase();});
syncInsets();
function haptic(type){safeTelegram(t=>{if(t.isVersionAtLeast?.('6.1')){if(type==='miss')t.HapticFeedback?.notificationOccurred('error');else t.HapticFeedback?.impactOccurred('light');}});}

function resize(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;width=rect.width;height=rect.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw(performance.now());}
new ResizeObserver(resize).observe($('#game-board'));
function startGame(track=selected){
  if(phase==='home')savedScroll=window.scrollY;
  cancelAnimationFrame(frame);audio.silence();selected=track;game=new RhythmGame(track);storedResult=false;flashes=[0,0,0,0];particles=[];
  $('#home').hidden=true;$('#game-view').hidden=false;document.body.classList.add('game-mode');window.scrollTo(0,0);
  $('#game-song-name').textContent=track.title;$('#game-song-author').textContent=track.composer;$('#game-duration').textContent=formatTime(track.duration);
  $('#hit-feedback').classList.remove('show');$('#pause-button').disabled=false;
  safeTelegram(t=>{t.BackButton?.show();if(t.isVersionAtLeast?.('7.7'))t.disableVerticalSwipes?.();t.enableClosingConfirmation?.();});
  void audio.unlock().then(ok=>{if(!ok)toast('Звук недоступен. Можно продолжить играть без звука.');});
  resize();updateHud();startCountdown(3);$('#pause-button').focus({preventScroll:true});
}
function startCountdown(seconds){
  phase='countdown';countdownLength=seconds;countdownAt=performance.now();lastCountdown=-1;
  $('#game-overlay').hidden=false;
  $('#game-overlay').innerHTML='<div class="countdown-number" id="countdown-number"></div><div class="countdown-hint">Нажимай, когда клавиша на линии</div>';
  $('#game-announcement').textContent='Приготовься. Нажимай D, F, J, K или касайся дорожек.';
  cancelAnimationFrame(frame);frame=requestAnimationFrame(tick);
}
function updateTime(now=performance.now()){if(phase==='playing')game.advance(baseTime+(now-startedAt)/1000);}
function tick(now){
  if(phase==='home')return;
  if(phase==='countdown'){
    const remaining=Math.ceil(countdownLength-(now-countdownAt)/1000);
    if(remaining>0 && remaining!==lastCountdown){lastCountdown=remaining;$('#countdown-number').textContent=remaining;}
    if(remaining<=0){$('#game-overlay').hidden=true;phase='playing';baseTime=game.time;startedAt=now;if(game.state==='ready')game.start();else game.resume();}
  }
  updateTime(now);processEvents(now);draw(now);updateHud();
  if(now>feedbackUntil)$('#hit-feedback').classList.remove('show');
  if(phase==='playing'||phase==='countdown')frame=requestAnimationFrame(tick);
}
function updateHud(){
  if(!game)return;
  $('#score').textContent=game.score.toLocaleString('ru-RU');$('#combo').innerHTML=`${game.combo}<span>×</span>`;
  $('#lives').textContent=Array.from({length:3},(_,i)=>i<game.lives?'♥':'♡').join(' ');$('#lives').setAttribute('aria-label',`${game.lives} жизни`);
  const percentage=Math.min(100,game.time/game.track.duration*100);$('#song-progress-fill').style.width=`${percentage}%`;$('.song-progress').setAttribute('aria-valuenow',String(Math.round(percentage)));$('#game-time').textContent=formatTime(Math.min(game.time,game.track.duration));
}
function feedback(message,miss,now){$('#hit-feedback').textContent=message;$('#hit-feedback').classList.toggle('miss',miss);$('#hit-feedback').classList.add('show');feedbackUntil=now+550;}
function processEvents(now){
  if(!game)return;
  for(const event of game.drainEvents()){
    if(event.type==='hit'){
      audio.play(event.note.midi,event.note.duration);flashes[event.lane]=now;
      feedback(event.grade==='perfect'?'PERFECT':event.grade==='good'?'ОТЛИЧНО':'ЕСТЬ!',false,now);
      if(!reduceMotion)for(let i=0;i<10;i++)particles.push({x:(event.lane+.5)*width/4,y:height-90,dx:(Math.random()-.5)*2.5,dy:-1.8-Math.random()*3,born:now,color:colors[event.lane]});
      haptic('hit');
    }else if(event.type==='miss'||event.type==='wrong'){feedback(event.type==='miss'?'ПРОПУСК':'МИМО',true,now);haptic('miss');}
    else if(event.type==='completed'||event.type==='failed'){finishGame();}
  }
}
function hit(lane){if(phase!=='playing')return;const now=performance.now();updateTime(now);game.hit(lane);processEvents(now);updateHud();draw(now);}
function pauseGame(){
  if(phase!=='playing'&&phase!=='countdown')return;
  updateTime();processEvents(performance.now());if(phase==='result')return;
  game.pause();phase='paused';cancelAnimationFrame(frame);audio.silence();
  $('#hit-feedback').classList.remove('show');$('#game-overlay').hidden=false;
  $('#game-overlay').innerHTML='<span class="result-icon">Ⅱ</span><h2>Музыка подождёт</h2><p>Выдохни. Продолжим с того же места.</p><button class="primary-button" data-action="resume">Продолжить</button><button class="secondary-button" data-action="restart">Начать заново</button><button class="text-button" data-action="home">К мелодиям</button>';
  $('#game-announcement').textContent='Игра на паузе';$('[data-action="resume"]').focus({preventScroll:true});
}
function finishGame(){
  if(storedResult)return;storedResult=true;phase='result';$('#pause-button').disabled=true;
  const result=game.result(),newBest=recordResult(progress,result);persist();renderProgress();renderTracks();
  const next=tracks[tracks.findIndex(t=>t.id===selected.id)+1];
  $('#game-overlay').hidden=false;
  $('#game-overlay').innerHTML=`<span class="result-icon">${result.completed?'✦':'♪'}</span><h2>${result.completed?'Мелодия твоя!':'Ещё один раз?'}</h2><div class="result-label">${result.completed?'МЕЛОДИЯ ПРОЙДЕНА':'ПОПЫТКА ЗАВЕРШЕНА'}</div><div class="result-score">${result.score.toLocaleString('ru-RU')}</div><div class="result-label">ОЧКОВ</div>${newBest?'<div class="record-badge">✦ Новый личный рекорд</div>':''}<div class="result-metrics"><div><b>${result.accuracy}%</b><span>точность</span></div><div><b>${result.maxCombo}</b><span>макс. комбо</span></div><div><b>${result.hits}/${result.totalNotes}</b><span>нот</span></div></div><button class="primary-button" data-action="${result.completed&&next?'next':'restart'}">${result.completed&&next?'Следующая мелодия':'Сыграть ещё'}</button>${result.completed&&next?'<button class="secondary-button" data-action="restart">Побить рекорд</button>':''}<button class="text-button" data-action="home">К мелодиям</button>`;
  $('#game-announcement').textContent=`${result.completed?'Мелодия пройдена':'Попытка завершена'}. ${result.score} очков. Точность ${result.accuracy} процентов.`;
  $('#game-overlay .primary-button').focus({preventScroll:true});
}
function goHome(){
  cancelAnimationFrame(frame);audio.silence();phase='home';$('#game-view').hidden=true;$('#home').hidden=false;document.body.classList.remove('game-mode');
  safeTelegram(t=>{t.BackButton?.hide();if(t.isVersionAtLeast?.('7.7'))t.enableVerticalSwipes?.();t.disableClosingConfirmation?.();});
  selectTrack(selected.id);renderProgress();$('#play-button').focus({preventScroll:true});window.scrollTo(0,savedScroll);
}
function draw(now){
  if(!width||!height)return;
  ctx.clearRect(0,0,width,height);const laneWidth=width/4,line=height-90;
  const background=ctx.createLinearGradient(0,0,0,height);background.addColorStop(0,'#131810');background.addColorStop(1,'#232e19');ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
  for(let lane=0;lane<4;lane++){
    ctx.fillStyle=lane%2===0?'#ffffff02':'#ffffff05';ctx.fillRect(lane*laneWidth,0,laneWidth,height);
    ctx.strokeStyle='#697c402f';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(lane*laneWidth,0);ctx.lineTo(lane*laneWidth,height);ctx.stroke();
    const flash=Math.max(0,1-(now-flashes[lane])/250);
    if(flash>0){const glow=ctx.createLinearGradient(0,line-160,0,height);glow.addColorStop(0,'#d6f88000');glow.addColorStop(1,`rgba(214,248,128,${flash*.22})`);ctx.fillStyle=glow;ctx.fillRect(lane*laneWidth,line-160,laneWidth,height-line+160);}
    ctx.fillStyle='#a9bd8418';ctx.fillRect(lane*laneWidth+12,line+16,laneWidth-24,height-line-28);
    ctx.strokeStyle='#a4bb7e50';ctx.beginPath();ctx.roundRect(lane*laneWidth+12,line-17,laneWidth-24,34,7);ctx.stroke();
  }
  ctx.fillStyle='#d6f880';ctx.shadowColor='#d6f880';ctx.shadowBlur=15;ctx.fillRect(0,line-1,width,2);ctx.shadowBlur=0;
  const time=game?.time||0;
  for(const note of game?.notes||[]){
    if(note.status!=='pending')continue;
    const center=line+(time-note.time)/game.track.travel*(line+80);
    const tileHeight=Math.min(76,Math.max(46,laneWidth*.66));
    if(center < -tileHeight || center > height+tileHeight)continue;
    const x=note.lane*laneWidth+11,y=center-tileHeight/2,w=laneWidth-22;
    ctx.fillStyle='#0003';ctx.beginPath();ctx.roundRect(x,y+5,w,tileHeight,9);ctx.fill();
    const grad=ctx.createLinearGradient(x,y,x,y+tileHeight);grad.addColorStop(0,colors[note.lane]);grad.addColorStop(1,['#aac665','#a18dc5','#c79e79','#bcd875'][note.lane]);ctx.fillStyle=grad;ctx.beginPath();ctx.roundRect(x,y,w,tileHeight,9);ctx.fill();
    ctx.fillStyle='#ffffff45';ctx.fillRect(x+10,y+7,w-20,1);
    ctx.fillStyle='#18230e44';ctx.beginPath();ctx.roundRect(x+w/2-9,y+tileHeight/2-2,18,4,2);ctx.fill();
  }
  particles=particles.filter(p=>now-p.born<450);
  for(const p of particles){const age=(now-p.born)/16.7;ctx.globalAlpha=Math.max(0,1-(now-p.born)/450);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x+p.dx*age,p.y+p.dy*age+age*age*.04,2.3,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  const fade=ctx.createLinearGradient(0,0,0,65);fade.addColorStop(0,'#131810');fade.addColorStop(1,'#13181000');ctx.fillStyle=fade;ctx.fillRect(0,0,width,65);
}

$('#play-button').addEventListener('click',()=>startGame());
$('#track-list').addEventListener('click',e=>{const row=e.target.closest('[data-track]');if(row)selectTrack(row.dataset.track);});
$$('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;$$('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});renderTracks();}));
$('#sound-toggle').addEventListener('click',()=>{progress.muted=!progress.muted;renderSound();persist();if(!progress.muted)void audio.unlock().then(ok=>{if(ok)audio.play(64);});});
$('#help-button').addEventListener('click',showHelp);$('#how-button').addEventListener('click',showHelp);$('#nav-records').addEventListener('click',showRecords);
$('#nav-play').addEventListener('click',()=>$('#play-button').focus());
$('#close-dialog').addEventListener('click',()=>$('#info-dialog').close());
$('#info-dialog').addEventListener('close',()=>previousFocus?.focus({preventScroll:true}));
$('#info-dialog').addEventListener('click',e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}});
$('#pause-button').addEventListener('click',pauseGame);$('#leave-button').addEventListener('click',()=>phase==='result'?goHome():pauseGame());
$$('[data-lane]').forEach(button=>button.addEventListener('pointerdown',e=>{e.preventDefault();if(e.pointerType==='mouse'&&e.button!==0)return;hit(Number(button.dataset.lane));}));
document.addEventListener('keydown',e=>{
  if($('#info-dialog').open)return;
  if(e.code==='Escape'){if(phase==='playing'||phase==='countdown'){e.preventDefault();pauseGame();}return;}
  const lane=['KeyD','KeyF','KeyJ','KeyK'].indexOf(e.code);
  if(lane>=0&&phase==='playing'&&!e.repeat){e.preventDefault();hit(lane);}
});
document.addEventListener('click',e=>{
  const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
  if(action==='close-dialog')$('#info-dialog').close();
  if(action==='resume'){void audio.unlock();startCountdown(2);}
  if(action==='restart')startGame();
  if(action==='home')goHome();
  if(action==='next'){const next=tracks[tracks.findIndex(t=>t.id===selected.id)+1];if(next)startGame(next);}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();});
window.addEventListener('blur',()=>pauseGame());
window.addEventListener('pagehide',()=>{pauseGame();audio.silence();});

// Optional browser agent interface; the ordinary UI works without WebMCP.
const modelContext=document.modelContext;
if(modelContext?.registerTool){
  const lifecycle=new AbortController();
  const register=tool=>{try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Unsupported registry version. */}};
  register({name:'piano_get_state',title:'Состояние Piano',description:'Read the current screen, selected melody, and local scores.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({phase,selectedTrack:selected.id,tracks:tracks.map(t=>({id:t.id,title:t.title,difficulty:t.difficulty})),records:progress.records})});
  register({name:'piano_select_track',title:'Выбрать мелодию',description:'Select a melody on the home screen. Does not start or complete a game.',inputSchema:{type:'object',properties:{trackId:{type:'string',enum:tracks.map(t=>t.id)}},required:['trackId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).length!==1||!tracks.some(t=>t.id===input.trackId))throw new Error('Invalid trackId');if(phase!=='home')throw new Error('Return to the melody selection first');selectTrack(input.trackId);return {selectedTrack:selected.id,title:selected.title};}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
renderSound();selectTrack(selected.id);renderProgress();
