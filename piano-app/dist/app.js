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
let lastFrameTime=0, countdownAt=0, countdownLength=3, lastCountdown=-1;
let width=0,height=0, flashes=[0,0,0,0], particles=[], feedbackUntil=0, storedResult=false;
let toastTimer, savedScroll=0, previousFocus=null;
const pressedKeys=new Set();
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const formatTime=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const soundSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 4 5 9H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
const mutedSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 4 5 9H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/></svg>';

function toast(message){ $('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3800); }
function persist(){ if(!saveProgress(progress))toast('Не удалось сохранить рекорд на этом устройстве.'); }
function renderSound(){ audio.setMuted(progress.muted);$('#sound-toggle').innerHTML=progress.muted?mutedSvg:soundSvg;$('#sound-toggle').setAttribute('aria-pressed',String(progress.muted));$('#sound-toggle').setAttribute('aria-label',progress.muted?'Включить звук':'Выключить звук'); }
function renderTracks(){
  $('#track-list').innerHTML=tracks.filter(t=>filter==='all'||t.difficulty===filter).map(t=>`<button class="track-row ${t.id===selected.id?'selected':''}" data-track="${t.id}" aria-pressed="${t.id===selected.id}" aria-label="Выбрать ${t.title}"><span class="track-cover ${t.cover}">${t.symbol}</span><span class="track-info"><strong>${t.title}</strong><small>${t.composer}</small></span><span class="track-side"><span class="difficulty ${t.difficulty}">${t.difficulty==='easy'?'Легко':'Сложнее'}</span><small>${progress.records[t.id]?.completed?'✓ Рекорд: ':''}${progress.records[t.id]?.score ? progress.records[t.id].score.toLocaleString('ru-RU') + ' очков' : Math.ceil(t.duration) + ' сек'}</small></span><span class="track-play" aria-hidden="true"><span class="play-triangle"></span></span></button>`).join('');
}
function selectTrack(id){
  const track=tracks.find(t=>t.id===id);if(!track)throw new Error('Неизвестная мелодия');
  selected=track;$('#featured-title').textContent=track.title;$('#featured-composer').textContent=track.composer;
  $('#featured-difficulty').textContent=track.difficulty==='easy'?'Легко':'Сложнее';$('#featured-difficulty').className=`difficulty ${track.difficulty}`;
  $('#featured-meta').innerHTML=`Бесконечный режим <span>·</span> ${track.bpm} BPM <span>·</span> Длинные ноты ♪`;
  renderTracks();
}
function renderProgress(){
  const records=Object.values(progress.records), completed=records.filter(r=>r.completed).length;
  $('#completed-count').textContent=completed;$('#best-combo').textContent=Math.max(0,...records.map(r=>r.maxCombo))||'—';$('#total-plays').textContent=progress.plays;
  $$('.progress-bars i').forEach((el,i)=>el.classList.toggle('complete',i<completed));
  $('#progress-message').textContent=completed===3?'Вся коллекция освоена. Набирай комбо и ставь рекорды!':completed>0?'Отличный темп. Новые рекорды впереди.':'Большая музыка начинается с первого тапа.';
}
function openDialog(content){previousFocus=document.activeElement;$('#dialog-content').innerHTML=content;$('#info-dialog').showModal();}
function showHelp(){openDialog('<div class="dialog-eyebrow">БЕСКОНЕЧНЫЙ РИТМ И БАЛЛЫ</div><h2>Как играть</h2><ol><li><b>Обычные плиты.</b> Нажимай на дорожку точно на светящейся линии попадания.</li><li><b>Длинные плиты (HOLD).</b> Зажимай и удерживай клавишу или палец до конца шлейфа — это даёт протяжный звук фортепиано и много бонусных очков!</li><li><b>Ускорение от комбо.</b> Чем выше серия попаданий без ошибок, тем быстрее несутся плиты, растёт темп музыки и множитель очков (до ×8).</li><li><b>Игра на рекорд.</b> Мелодия играет бесконечными кругами, пока не кончатся 3 жизни.</li></ol><p>Управление: касание экрана или клавиши <b>D · F · J · K</b>. Пауза — Esc.</p><button class="primary-button" data-action="close-dialog">Всё понятно</button>');}
function showRecords(){openDialog(`<div class="dialog-eyebrow">ТВОЯ КОЛЛЕКЦИЯ ПОБЕД</div><h2>Мои рекорды</h2><div class="records-list">${tracks.map(t=>{const r=progress.records[t.id];return `<div class="record-row"><div><strong>${t.title}</strong><small>${r?`Рекорд · комбо ${r.maxCombo} · точность ${r.accuracy}%`:'Пока не сыграно'}</small></div><b>${r?r.score.toLocaleString('ru-RU'):'—'}</b></div>`;}).join('')}</div><p>Рекорды сохраняются в этом браузере на этом устройстве.</p>`);}

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
  cancelAnimationFrame(frame);audio.silence();releaseAllInputs();selected=track;
  game=new RhythmGame(track, { endless: true });
  storedResult=false;flashes=[0,0,0,0];particles=[];
  $('#home').hidden=true;$('#game-view').hidden=false;document.body.classList.add('game-mode');window.scrollTo(0,0);
  $('#game-song-name').textContent=track.title;$('#game-song-author').textContent=`${track.composer} · Бесконечно`;$('#game-duration').textContent='Круг 1';
  $('#hit-feedback').classList.remove('show');$('#pause-button').disabled=false;
  safeTelegram(t=>{t.BackButton?.show();if(t.isVersionAtLeast?.('7.7'))t.disableVerticalSwipes?.();t.enableClosingConfirmation?.();});
  void audio.unlock().then(ok=>{if(!ok)toast('Звук недоступен. Можно продолжить играть без звука.');});
  resize();updateHud();startCountdown(3);$('#pause-button').focus({preventScroll:true});
}
function startCountdown(seconds){
  phase='countdown';countdownLength=seconds;countdownAt=performance.now();lastCountdown=-1;
  $('#game-overlay').hidden=false;
  $('#game-overlay').innerHTML='<div class="countdown-number" id="countdown-number"></div><div class="countdown-hint">Нажимай и зажимай на светящейся линии</div>';
  $('#game-announcement').textContent='Приготовься. Нажимай D, F, J, K или касайся дорожек.';
  cancelAnimationFrame(frame);frame=requestAnimationFrame(tick);
}
function updateTime(now=performance.now()){
  if(phase==='playing'&&game){
    const dt=Math.min(.1,Math.max(0,(now-lastFrameTime)/1000));
    game.advance(game.time+dt*game.speed);
  }
  lastFrameTime=now;
}
function tick(now){
  if(phase==='home')return;
  if(phase==='countdown'){
    const remaining=Math.ceil(countdownLength-(now-countdownAt)/1000);
    if(remaining>0 && remaining!==lastCountdown){lastCountdown=remaining;$('#countdown-number').textContent=remaining;}
    if(remaining<=0){$('#game-overlay').hidden=true;phase='playing';lastFrameTime=performance.now();if(game.state==='ready')game.start();else game.resume();}
  }
  updateTime(now);processEvents(now);draw(now);updateHud();
  if(now>feedbackUntil)$('#hit-feedback').classList.remove('show');
  if(phase==='playing'||phase==='countdown')frame=requestAnimationFrame(tick);
}
function updateHud(){
  if(!game)return;
  $('#score').textContent=game.score.toLocaleString('ru-RU');
  $('#combo').innerHTML=`${game.combo}<span>×${game.multiplier}</span>`;
  if($('#speed')) $('#speed').textContent=`${game.speed.toFixed(1)}×`;
  $('#lives').textContent=Array.from({length:3},(_,i)=>i<game.lives?'♥':'♡').join(' ');
  $('#lives').setAttribute('aria-label',`${game.lives} жизни`);
  const loopDuration=game.track.loopDuration||game.track.duration;
  const loopTime=Math.max(0,game.time-2.2);
  const percentage=Math.min(100,(loopTime%loopDuration)/loopDuration*100);
  $('#song-progress-fill').style.width=`${percentage}%`;
  $('.song-progress').setAttribute('aria-valuenow',String(Math.round(percentage)));
  $('#game-time').textContent=formatTime(game.time);
  if($('#game-duration')) $('#game-duration').textContent=`Круг ${game.loop+1}`;
}
function feedback(message,miss,now){$('#hit-feedback').textContent=message;$('#hit-feedback').classList.toggle('miss',miss);$('#hit-feedback').classList.add('show');feedbackUntil=now+550;}
function processEvents(now){
  if(!game)return;
  for(const event of game.drainEvents()){
    if(event.type==='hit'){
      audio.play(event.note.midi,event.note.duration/game.speed);
      flashes[event.lane]=now;
      feedback(event.grade==='perfect'?'PERFECT':event.grade==='good'?'ОТЛИЧНО':'ЕСТЬ!',false,now);
      if(!reduceMotion)for(let i=0;i<10;i++)particles.push({x:(event.lane+.5)*width/4,y:height-90,dx:(Math.random()-.5)*2.5,dy:-1.8-Math.random()*3,born:now,color:colors[event.lane]});
      haptic('hit');
    }else if(event.type==='hold_start'){
      audio.startHold(event.lane,event.note.midi);
      flashes[event.lane]=now;
      feedback(event.grade==='perfect'?'HOLD!':'ЗАЖАТИЕ',false,now);
      if(!reduceMotion)for(let i=0;i<8;i++)particles.push({x:(event.lane+.5)*width/4,y:height-90,dx:(Math.random()-.5)*2,dy:-2-Math.random()*2,born:now,color:colors[event.lane]});
      haptic('hit');
    }else if(event.type==='hold_tick'){
      flashes[event.lane]=now;
      if(!reduceMotion)for(let i=0;i<2;i++)particles.push({x:(event.lane+.5)*width/4+(Math.random()-.5)*20,y:height-90,dx:(Math.random()-.5)*1.5,dy:-1.5-Math.random()*2,born:now,color:colors[event.lane]});
    }else if(event.type==='hold_complete'){
      audio.stopHold(event.lane,false);
      flashes[event.lane]=now;
      feedback('БРАВО! +150',false,now);
      if(!reduceMotion)for(let i=0;i<16;i++)particles.push({x:(event.lane+.5)*width/4,y:height-90,dx:(Math.random()-.5)*3.5,dy:-2.5-Math.random()*3.5,born:now,color:colors[event.lane]});
      haptic('hit');
    }else if(event.type==='hold_break'){
      audio.stopHold(event.lane,true);
      feedback('РАНО!',true,now);
      haptic('miss');
    }else if(event.type==='loop'){
      toast(`Круг ${event.loop+1}! Скорость растёт.`);
    }else if(event.type==='miss'||event.type==='wrong'){
      audio.stopHold(event.lane,true);
      feedback(event.type==='miss'?'ПРОПУСК':'МИМО',true,now);
      haptic('miss');
    }else if(event.type==='completed'||event.type==='failed'){
      finishGame();
    }
  }
}
function pressLane(lane){if(phase!=='playing'||!game)return;const now=performance.now();updateTime(now);game.press(lane);processEvents(now);updateHud();draw(now);}
function releaseLane(lane){if(phase!=='playing'||!game)return;const now=performance.now();updateTime(now);game.release(lane);processEvents(now);updateHud();draw(now);}
function releaseAllInputs(){
  pressedKeys.clear();
  if(game){
    for(let l=0;l<4;l++) if(game.holdingNotes?.has(l)) game.release(l);
  }
  audio.silence();
}
function pauseGame(){
  if(phase!=='playing'&&phase!=='countdown')return;
  updateTime();processEvents(performance.now());if(phase==='result')return;
  game.pause();phase='paused';cancelAnimationFrame(frame);releaseAllInputs();
  $('#hit-feedback').classList.remove('show');$('#game-overlay').hidden=false;
  $('#game-overlay').innerHTML='<span class="result-icon">Ⅱ</span><h2>Музыка подождёт</h2><p>Выдохни. Продолжим с того же места.</p><button class="primary-button" data-action="resume">Продолжить</button><button class="secondary-button" data-action="restart">Начать заново</button><button class="text-button" data-action="home">К мелодиям</button>';
  $('#game-announcement').textContent='Игра на паузе';$('[data-action="resume"]').focus({preventScroll:true});
}
function finishGame(){
  if(storedResult)return;storedResult=true;phase='result';$('#pause-button').disabled=true;
  releaseAllInputs();
  const result=game.result(),newBest=recordResult(progress,result);persist();renderProgress();renderTracks();
  $('#game-overlay').hidden=false;
  $('#game-overlay').innerHTML=`<span class="result-icon">${result.score>5000?'✦':'♪'}</span><h2>${result.score>12000?'Виртуозная игра!':result.score>4000?'Отличный забег!':'Партия завершена'}</h2><div class="result-label">РЕКОРД ОЧКОВ</div><div class="result-score">${result.score.toLocaleString('ru-RU')}</div><div class="result-label">ОЧКОВ</div>${newBest?'<div class="record-badge">✦ Новый личный рекорд</div>':''}<div class="result-metrics"><div><b>${result.accuracy}%</b><span>точность</span></div><div><b>${result.maxCombo}</b><span>макс. комбо</span></div><div><b>${result.loop+1}</b><span>кругов</span></div></div><button class="primary-button" data-action="restart">Сыграть ещё</button><button class="secondary-button" data-action="home">К мелодиям</button>`;
  $('#game-announcement').textContent=`Игра завершена. ${result.score} очков. Максимальное комбо ${result.maxCombo}.`;
  $('#game-overlay .primary-button').focus({preventScroll:true});
}
function goHome(){
  cancelAnimationFrame(frame);releaseAllInputs();phase='home';$('#game-view').hidden=true;$('#home').hidden=false;document.body.classList.remove('game-mode');
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
  const travel=game?.track?.travel||2.1;
  const pxPerSec=(line+80)/travel;

  for(const note of game?.notes||[]){
    if(note.status!=='pending'&&note.status!=='holding')continue;
    const x=note.lane*laneWidth+11, w=laneWidth-22;

    if(note.isHold){
      let headY, tailY;
      if(note.status==='holding'){
        headY=line;
        const remaining=Math.max(0,(note.time+note.holdDuration)-time);
        tailY=line-remaining*pxPerSec;
        flashes[note.lane]=now;
        if(!reduceMotion&&Math.random()<.55){
          particles.push({x:(note.lane+.5)*laneWidth+(Math.random()-.5)*(w-10),y:line,dx:(Math.random()-.5)*3,dy:-2-Math.random()*3,born:now,color:colors[note.lane]});
        }
      }else{
        headY=line+(time-note.time)*pxPerSec;
        tailY=headY-note.holdDuration*pxPerSec;
      }
      if(headY<-90||tailY>height+90)continue;
      const tailTop=Math.min(headY,tailY), tailBottom=headY;
      const bodyH=Math.max(12,tailBottom-tailTop), bodyX=x+4, bodyW=w-8;

      ctx.save();
      const isHolding=note.status==='holding';
      const tailGrad=ctx.createLinearGradient(bodyX,tailTop,bodyX,tailBottom);
      tailGrad.addColorStop(0,isHolding?colors[note.lane]:colors[note.lane]+'bb');
      tailGrad.addColorStop(1,isHolding?'#ffffffdd':colors[note.lane]+'55');
      ctx.fillStyle=tailGrad;ctx.beginPath();ctx.roundRect(bodyX,tailTop,bodyW,bodyH,8);ctx.fill();

      ctx.strokeStyle='#ffffffaa';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(bodyX+bodyW/2,tailTop+6);ctx.lineTo(bodyX+bodyW/2,tailBottom-6);ctx.stroke();
      ctx.strokeStyle=colors[note.lane];ctx.lineWidth=1.5;ctx.stroke();

      ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(bodyX+bodyW/2,tailTop+5,4,0,Math.PI*2);ctx.fill();

      const headH=Math.min(52,Math.max(38,laneWidth*.5));
      const headTop=headY-headH/2;
      ctx.fillStyle='#0004';ctx.beginPath();ctx.roundRect(x,headTop+4,w,headH,9);ctx.fill();
      const headGrad=ctx.createLinearGradient(x,headTop,x,headTop+headH);
      headGrad.addColorStop(0,'#ffffff');headGrad.addColorStop(1,colors[note.lane]);
      ctx.fillStyle=isHolding?'#ffffff':headGrad;ctx.beginPath();ctx.roundRect(x,headTop,w,headH,9);ctx.fill();
      ctx.fillStyle='#18230e';ctx.font='bold 11px Manrope, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(isHolding?'HOLD':'ЗАЖМИ',x+w/2,headTop+headH/2);
      ctx.restore();
    }else{
      const center=line+(time-note.time)*pxPerSec;
      const tileHeight=Math.min(76,Math.max(46,laneWidth*.66));
      if(center<-tileHeight||center>height+tileHeight)continue;
      const y=center-tileHeight/2;
      ctx.fillStyle='#0003';ctx.beginPath();ctx.roundRect(x,y+5,w,tileHeight,9);ctx.fill();
      const grad=ctx.createLinearGradient(x,y,x,y+tileHeight);grad.addColorStop(0,colors[note.lane]);grad.addColorStop(1,['#aac665','#a18dc5','#c79e79','#bcd875'][note.lane]);ctx.fillStyle=grad;ctx.beginPath();ctx.roundRect(x,y,w,tileHeight,9);ctx.fill();
      ctx.fillStyle='#ffffff45';ctx.fillRect(x+10,y+7,w-20,1);
      ctx.fillStyle='#18230e44';ctx.beginPath();ctx.roundRect(x+w/2-9,y+tileHeight/2-2,18,4,2);ctx.fill();
    }
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

$$('[data-lane]').forEach(button=>{
  const lane=Number(button.dataset.lane);
  button.addEventListener('pointerdown',e=>{
    e.preventDefault();
    if(e.pointerType==='mouse'&&e.button!==0)return;
    try{button.setPointerCapture(e.pointerId);}catch{}
    pressLane(lane);
  });
  button.addEventListener('pointerup',e=>{
    e.preventDefault();
    try{button.releasePointerCapture(e.pointerId);}catch{}
    releaseLane(lane);
  });
  button.addEventListener('pointercancel',e=>{
    e.preventDefault();
    releaseLane(lane);
  });
});

document.addEventListener('keydown',e=>{
  if($('#info-dialog').open)return;
  if(e.code==='Escape'){if(phase==='playing'||phase==='countdown'){e.preventDefault();pauseGame();}return;}
  const lane=['KeyD','KeyF','KeyJ','KeyK'].indexOf(e.code);
  if(lane>=0&&phase==='playing'&&!e.repeat&&!pressedKeys.has(e.code)){
    e.preventDefault();
    pressedKeys.add(e.code);
    pressLane(lane);
  }
});

document.addEventListener('keyup',e=>{
  const lane=['KeyD','KeyF','KeyJ','KeyK'].indexOf(e.code);
  if(lane>=0){
    pressedKeys.delete(e.code);
    if(phase==='playing') releaseLane(lane);
  }
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
window.addEventListener('pagehide',()=>{pauseGame();releaseAllInputs();});

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
