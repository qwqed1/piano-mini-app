export class PianoAudio {
  constructor() {
    this.context = null;
    this.muted = false;
    this.voices = new Set();
    this.holdVoices = new Map();
  }
  async unlock() {
    try {
      if (!this.context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return false;
        const ctx = this.context = new AudioContextClass({latencyHint:'interactive'});
        this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : .5;
        const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.ratio.value = 8;
        this.master.connect(limiter); limiter.connect(ctx.destination);
        this.reverb = ctx.createConvolver();
        const impulse = ctx.createBuffer(2, ctx.sampleRate * .9, ctx.sampleRate);
        for (let ch=0;ch<2;ch++) { const d=impulse.getChannelData(ch); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3)*.13; }
        this.reverb.buffer=impulse; this.reverb.connect(this.master);
      }
      if (this.context.state !== 'running') await this.context.resume();
      return this.context.state === 'running';
    } catch { return false; }
  }
  setMuted(value) {
    this.muted=value;
    if(this.master) this.master.gain.setTargetAtTime(value?0:.5,this.context.currentTime,.02);
  }
  play(midi,duration=.6,velocity=.85) {
    const ctx=this.context;
    if(!ctx || ctx.state!=='running' || this.muted) return;
    const start=ctx.currentTime;
    const frequency=440*Math.pow(2,(midi-69)/12);
    const length=Math.min(2.6,Math.max(.8,duration*1.2));
    const group=ctx.createGain();group.gain.value=.2*velocity;group.connect(this.master);group.connect(this.reverb);
    let remaining=5;
    [1,.42,.2,.085,.035].forEach((amp,i)=>{
      const oscillator=ctx.createOscillator(), gain=ctx.createGain();
      oscillator.type='sine'; oscillator.frequency.value=frequency*(i+1)*(1+i*.0007);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(amp,start+.004);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002,amp*.24),start+.12);
      gain.gain.exponentialRampToValueAtTime(.0001,start+length/(1+i*.25));
      oscillator.connect(gain);gain.connect(group);oscillator.start(start);oscillator.stop(start+length+.04);
      this.voices.add(oscillator);
      oscillator.onended=()=>{this.voices.delete(oscillator);oscillator.disconnect();gain.disconnect();if(--remaining===0)group.disconnect();};
    });
  }
  startHold(lane,midi,velocity=.88) {
    this.stopHold(lane,true);
    const ctx=this.context;
    if(!ctx || ctx.state!=='running' || this.muted) return null;
    const start=ctx.currentTime;
    const frequency=440*Math.pow(2,(midi-69)/12);
    const group=ctx.createGain(); group.gain.value=.22*velocity;
    group.connect(this.master); group.connect(this.reverb);
    const gains=[], oscs=[];
    let stopped=false;
    [1,.48,.25,.12,.045].forEach((amp,i)=>{
      const osc=ctx.createOscillator(), gain=ctx.createGain();
      osc.type='sine'; osc.frequency.value=frequency*(i+1)*(1+i*.0006);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(amp,start+.004);
      gain.gain.exponentialRampToValueAtTime(Math.max(.001,amp*.38),start+.14);
      osc.connect(gain); gain.connect(group); osc.start(start);
      this.voices.add(osc); gains.push(gain); oscs.push(osc);
    });
    const voice={
      stop:(earlyRelease=false)=>{
        if(stopped)return;
        stopped=true;
        this.holdVoices.delete(lane);
        const now=ctx.currentTime;
        const fadeTime=earlyRelease?.05:.45;
        try{
          group.gain.setTargetAtTime(.0001,now,fadeTime);
          setTimeout(()=>{
            oscs.forEach(osc=>{try{osc.stop();osc.disconnect();}catch{} this.voices.delete(osc);});
            gains.forEach(g=>{try{g.disconnect();}catch{}});
            try{group.disconnect();}catch{}
          },Math.round((fadeTime*3+.1)*1000));
        }catch{}
      }
    };
    this.holdVoices.set(lane,voice);
    return voice;
  }
  stopHold(lane,earlyRelease=false) {
    const voice=this.holdVoices.get(lane);
    if(voice) voice.stop(earlyRelease);
  }
  silence() {
    for(const [,voice] of this.holdVoices) voice.stop(true);
    this.holdVoices.clear();
    for(const voice of this.voices) {try{voice.stop();}catch{ /* already stopped */ }}
    this.voices.clear();
  }
}

