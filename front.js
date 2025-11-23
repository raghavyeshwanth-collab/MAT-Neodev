/* front.js - full interactive behavior (updated)
   - decode MP3s using AudioContext (fixes decode errors for MP3 like commercial tracks)
   - avoid blocking alert() on analysis failures (use non-blocking temporary UI)
   - other robustness fixes around audio probing and validation
   - **Now uses mathematical formula-based scoring for environmental health assessment**
     based on audio features like RMS, frequency ratios, spectral centroid, and flatness.
*/

/* ------------------------------
   tiny inline favicon to stop favicon.ico 404 noise
   ------------------------------ */
(function ensureFavicon(){
  const DATA_ICON = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E';
  let link = document.querySelector('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  try { link.href = DATA_ICON; } catch(e){ /* ignore */ }
})();

/* ------------------------------
   Validate existing audio/source tags on DOMContentLoaded
   ------------------------------ */
async function headExists(url, timeout = 3000) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const resp = await fetch(url, { method: 'HEAD', signal: controller.signal, cache: 'no-store' });
    clearTimeout(id);
    return resp && resp.ok;
  } catch (e) {
    return false;
  }
}

async function validateAudioElements() {
  const audios = Array.from(document.querySelectorAll('audio, source'));
  if (!audios.length) return;
  for (const el of audios) {
    const src = el.getAttribute && (el.getAttribute('src') || el.src);
    if (!src) continue;
    if (src.startsWith('data:') || src.startsWith('blob:')) continue;
    const ok = await headExists(src, 2500).catch(()=>false);
    if (!ok) {
      console.warn('Removing unavailable audio/src to avoid 404:', src);
      try {
        if (el.tagName && el.tagName.toLowerCase() === 'audio') {
          el.pause && el.pause();
          if (el.currentTime) try { el.currentTime = 0; } catch {}
        }
        el.removeAttribute && el.removeAttribute('src');
        if (el.parentNode && el.tagName && el.tagName.toLowerCase() === 'source') {
          el.parentNode.removeChild(el);
        }
      } catch(e){ /* ignore */ }
    }
  }
}

document.addEventListener('DOMContentLoaded', ()=> {
  validateAudioElements().catch(()=>{});
});

/* ------------------------------
   Utility / UI helpers
   ------------------------------ */
function scrollToSection(id){
  const el = document.getElementById(id);
  if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}

function showTemporaryAlert(text, bg='rgba(0,0,0,0.85)'){
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position:'fixed',
    top:'20px',
    right:'20px',
    background:bg,
    color:'#fff',
    padding:'12px 16px',
    borderRadius:'8px',
    zIndex:9999,
    opacity:0,
    boxShadow:'0 6px 20px rgba(0,0,0,0.35)'
  });
  document.body.appendChild(el);
  requestAnimationFrame(()=> el.style.opacity = 1);
  setTimeout(()=>{ el.style.opacity = 0; setTimeout(()=> el.remove(), 350); }, 3500);
}

/* ------------------------------
   UI behaviors (scroll, ripple, header, hero animations)
   ------------------------------ */
const observer = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{
    if(e.isIntersecting) e.target.classList.add('visible');
  });
},{ threshold: 0.2 });

document.querySelectorAll('.info-box, .hero').forEach(el => observer.observe(el));

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.btn, .choice-btn');
  if(!btn) return;
  const rect = btn.getBoundingClientRect();
  const span = document.createElement('span');
  span.className = 'ripple';
  span.style.left = (e.clientX - rect.left - 70) + 'px';
  span.style.top = (e.clientY - rect.top - 70) + 'px';
  btn.appendChild(span);
  setTimeout(()=> span.remove(), 600);
});

window.addEventListener('scroll', ()=>{
  const header = document.querySelector('header');
  if(!header) return;
  if(window.scrollY > 40){
    header.style.padding = "12px 26px";
    header.style.background = "rgba(0,0,0,0.35)";
    header.style.boxShadow = "0 6px 22px rgba(0,0,0,0.35)";
  } else {
    header.style.padding = "22px 40px";
    header.style.background = "rgba(0,0,0,0.20)";
    header.style.boxShadow = "none";
  }
});

window.addEventListener('load', ()=>{
  const h = document.querySelector('.hero h2');
  const p = document.querySelector('.hero p');
  if(h){ h.style.opacity=0; h.style.transform='translateY(-18px)'; h.style.transition='all 850ms ease'; }
  if(p){ p.style.opacity=0; p.style.transform='translateY(18px)'; p.style.transition='all 850ms ease 200ms'; }
  setTimeout(()=>{ 
    if(h){h.style.opacity=1; h.style.transform='translateY(0)'} 
    if(p){p.style.opacity=1; p.style.transform='translateY(0)'} 
  },120);
});

/* ------------------------------
   Robust audio playback system
   ------------------------------ */
const soundPlayer = new Audio();
soundPlayer.preload = 'auto';
soundPlayer.crossOrigin = 'anonymous';
soundPlayer.volume = 1;
soundPlayer.addEventListener('error', (ev) => {
  console.error('soundPlayer error', ev, soundPlayer.error);
  showTemporaryAlert('Audio error: check console/network.', 'rgba(200,30,30,0.95)');
});

function stopSound(){
  if(!soundPlayer) return;
  try{
    soundPlayer.pause();
    soundPlayer.currentTime = 0;
    soundPlayer.removeAttribute('src');
    soundPlayer.load();
  } catch(err){
    console.warn('stopSound error', err);
  }
}

async function resourceExists(url, timeout = 3000) {
  if (!url) return false;
  try {
    if (url.startsWith('data:') || url.startsWith('blob:')) return true;
    const controller = new AbortController();
    const id = setTimeout(()=> controller.abort(), timeout);
    const resp = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
    clearTimeout(id);
    if (resp && resp.ok) return true;
  } catch (e) { /* ignore and fallback */ }

  return new Promise((resolve) => {
    try {
      const a = new Audio();
      let done = false;
      const timer = setTimeout(()=> { if(!done){ done = true; try{ a.src = ''; }catch{}; resolve(false); } }, timeout);
      a.addEventListener('canplaythrough', ()=>{ if(done) return; done = true; clearTimeout(timer); try{ a.src = ''; }catch{}; resolve(true); });
      a.addEventListener('error', ()=>{ if(done) return; done = true; clearTimeout(timer); try{ a.src = ''; }catch{}; resolve(false); });
      a.src = url;
    } catch (err) {
      resolve(false);
    }
  });
}

async function playMP3(file){
  const ok = await resourceExists(file, 3500);
  if (!ok) {
    console.warn('Audio file not available:', file);
    showTemporaryAlert('Audio file missing or blocked: ' + file, 'rgba(200,30,30,0.95)');
    return;
  }

  stopSound();
  soundPlayer.src = file;
  soundPlayer.currentTime = 0;
  const p = soundPlayer.play();
  if(p && typeof p.then === 'function'){
    p.then(()=> console.log('Playback started:', file))
     .catch((err)=> showTemporaryAlert('Playback blocked or file issue.', 'rgba(220,140,20,0.95)'));
  }
}

function playWhale(){ playMP3("sounds/humpback-whale-megaptera-novaeangliae.mp3"); }
function playDolphin(){ playMP3("sounds/killer-whale-orcinus-orca.mp3"); }
function playBoat(){ playMP3("sounds/boat_inside-77528.mp3"); }

document.addEventListener('click', (e)=>{
  const s = e.target.dataset && e.target.dataset.sound;
  if(s==='whale') playWhale();
  if(s==='dolphin') playDolphin();
  if(s==='boat') playBoat();
  if(s==='stop') stopSound();
});

const stopBtn = document.getElementById('stop-sound');
if(stopBtn) stopBtn.addEventListener('click', ()=> stopSound());

/* ------------------------------
   Uploaded audio playback elements
   ------------------------------ */
const uploadedAudio = document.getElementById('uploadedAudio');
const audioUploadEl = document.getElementById('audioUpload');

const playUploadBtn = document.getElementById('play-upload');
if(playUploadBtn) {
  playUploadBtn.addEventListener('click', ()=>{
    if(audioUploadEl && audioUploadEl.files && audioUploadEl.files[0]){
      const file = audioUploadEl.files[0];
      const url = URL.createObjectURL(file);
      if(uploadedAudio){
        uploadedAudio.src = url; 
        uploadedAudio.style.display='block';
        uploadedAudio.play().catch(()=>{});
      } else {
        window.open(url, '_blank');
      }
      setTimeout(()=> URL.revokeObjectURL(url), 60000);
    } else {
      showTemporaryAlert('No audio uploaded. Please choose a file first.', 'rgba(200,30,30,0.95)');
    }
  });
}

const pauseUploadBtn = document.getElementById('pause-upload');
if(pauseUploadBtn) {
  pauseUploadBtn.addEventListener('click', ()=> {
    if(uploadedAudio && !uploadedAudio.paused) uploadedAudio.pause();
  });
}

/* ------------------------------
   Audio analysis — client-side decoder + analyzer
   - IMPORTANT: use AudioContext.decodeAudioData to handle mp3 files reliably
   ------------------------------ */

let _sharedAudioContext = null;
function getSharedAudioContext() {
  if (!_sharedAudioContext) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _sharedAudioContext = new AC();
  }
  return _sharedAudioContext;
}

function decodeAudioDataPromise(ac, arrayBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const p = ac.decodeAudioData(arrayBuffer, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve).catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function decodeFileToAudioBuffer(fileOrUrl) {
  const ac = getSharedAudioContext();
  if (!ac) throw new Error('AudioContext not available in this browser');
  let arr;
  if (typeof fileOrUrl === 'string') {
    const resp = await fetch(fileOrUrl);
    arr = await resp.arrayBuffer();
  } else {
    arr = await fileOrUrl.arrayBuffer();
  }
  return decodeAudioDataPromise(ac, arr);
}

/* FFT + analyzer */
function fftRealtoMag(buffer) {
  const n = buffer.length;
  const cos = new Float32Array(n/2);
  const sin = new Float32Array(n/2);
  const rev = new Uint32Array(n);
  for (let i = 0, j = 0; i < n; i++) {
    rev[i] = j;
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
  }
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = buffer[rev[i]] || 0.0;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const theta = -2 * Math.PI / len;
    for (let k = 0; k < half; k++) {
      cos[k] = Math.cos(theta * k);
      sin[k] = Math.sin(theta * k);
    }
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const uR = re[i + k];
        const uI = im[i + k];
        const vR = re[i + k + half] * cos[k] - im[i + k + half] * sin[k];
        const vI = re[i + k + half] * sin[k] + im[i + k + half] * cos[k];
        re[i + k] = uR + vR;
        im[i + k] = uI + vI;
        re[i + k + half] = uR - vR;
        im[i + k + half] = uI - vI;
      }
    }
  }
  const mags = new Float32Array(n/2);
  for (let i = 0; i < n/2; i++) {
    mags[i] = Math.hypot(re[i], im[i]);
  }
  return mags;
}

function nextPowerOfTwo(v){
  let p = 1;
  while(p < v) p <<= 1;
  return p;
}

function computeRMSFromBuffer(audioBuffer) {
  let sum = 0, cnt = 0;
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      sum += v * v;
      cnt++;
    }
  }
  return Math.sqrt(sum / Math.max(1, cnt));
}

function mixDownToMono(audioBuffer, targetLength) {
  const src = audioBuffer.getChannelData(0);
  const len = Math.min(src.length, targetLength);
  const out = new Float32Array(len);
  if (audioBuffer.numberOfChannels > 1) {
    const ch1 = audioBuffer.getChannelData(0);
    const ch2 = audioBuffer.getChannelData(1);
    for (let i = 0; i < len; i++) out[i] = (ch1[i] + ch2[i]) * 0.5;
  } else {
    for (let i = 0; i < len; i++) out[i] = src[i];
  }
  return out;
}

function computeSpectralFlatness(mags) {
  const eps = 1e-12;
  let sum = 0;
  let logSum = 0;
  const n = mags.length;
  for (let i = 0; i < n; i++) {
    const v = Math.max(mags[i], eps);
    sum += v;
    logSum += Math.log(v);
  }
  const arithmetic = sum / Math.max(1, n);
  const geometric = Math.exp(logSum / Math.max(1, n));
  const flatness = geometric / (arithmetic + eps);
  return Math.max(0, Math.min(1, flatness));
}

/* ------------------------------
   Mathematical Formula-based Scoring
   ------------------------------ */

function computeEnvironmentalScore(features) {
  const { rms, lowRatio, midRatio, highRatio, centroid, flatness, lowPeakiness } = features;
  
  // Debug logging to see actual values
  console.log('=== AUDIO FEATURES ===');
  console.log('RMS:', rms);
  console.log('Low Ratio (<300Hz):', lowRatio);
  console.log('Mid Ratio (300-3kHz):', midRatio);
  console.log('High Ratio (>3kHz):', highRatio);
  console.log('Centroid:', centroid, 'Hz');
  console.log('Flatness:', flatness);
  console.log('Low Peakiness:', lowPeakiness);
  console.log('=====================');
  
  let score = 50; // Start at neutral
  
  // === PATTERN MATCHING FOR SPECIFIC SOUNDS ===
  
  // HUMPBACK WHALE SIGNATURE (max ~35 points)
  let humpbackScore = 0;
  if (lowRatio > 0.6) humpbackScore += 10;
  if (lowRatio > 0.5) humpbackScore += 6;
  if (flatness < 0.2) humpbackScore += 12;
  else if (flatness < 0.3) humpbackScore += 8;
  if (lowPeakiness > 3.5) humpbackScore += 10;
  else if (lowPeakiness > 2.5) humpbackScore += 6;
  if (centroid < 1000) humpbackScore += 8;
  else if (centroid < 1500) humpbackScore += 5;
  if (midRatio < 0.3) humpbackScore += 5;
  
  // ORCA/KILLER WHALE SIGNATURE (max ~35 points)
  let orcaScore = 0;
  if (highRatio > 0.15 && highRatio < 0.4) orcaScore += 10;
  if (flatness > 0.25 && flatness < 0.55) orcaScore += 8;
  if (midRatio > 0.25 && midRatio < 0.5) orcaScore += 8;
  if (lowRatio > 0.2 && lowRatio < 0.6) orcaScore += 7;
  if (centroid > 1000 && centroid < 3000) orcaScore += 8;
  if (lowPeakiness > 1.5 && lowPeakiness < 4) orcaScore += 5;
  if (rms > 0.01 && rms < 0.08) orcaScore += 5;
  
  // BOAT/ENGINE SIGNATURE (HEAVY PENALTIES)
  let boatScore = 0;
  
  // Critical boat indicators - if ANY of these match strongly, force low score
  const isBoat = (
    (flatness > 0.5) ||  // Noise-like
    (centroid > 2000 && lowPeakiness < 2.5) ||  // High centroid + low peaks
    (midRatio > 0.4 && flatness > 0.45) ||  // Broadband mid
    (rms > 0.08)  // Very loud
  );
  
  if (isBoat) {
    // If it's clearly a boat, heavily penalize
    if (flatness > 0.7) boatScore -= 60;
    else if (flatness > 0.6) boatScore -= 50;
    else if (flatness > 0.5) boatScore -= 40;
    else if (flatness > 0.4) boatScore -= 30;
    
    if (centroid > 4000) boatScore -= 40;
    else if (centroid > 3000) boatScore -= 35;
    else if (centroid > 2500) boatScore -= 30;
    else if (centroid > 2000) boatScore -= 20;
    
    if (lowPeakiness < 1.5) boatScore -= 30;
    else if (lowPeakiness < 2.0) boatScore -= 25;
    else if (lowPeakiness < 2.5) boatScore -= 15;
    
    if (midRatio > 0.5) boatScore -= 30;
    else if (midRatio > 0.4) boatScore -= 20;
    
    if (highRatio > 0.35) boatScore -= 25;
    
    if (rms > 0.15) boatScore -= 30;
    else if (rms > 0.1) boatScore -= 20;
    else if (rms > 0.08) boatScore -= 10;
  }
  
  // Combine scores
  const animalScore = Math.max(humpbackScore, orcaScore);
  score += animalScore + boatScore;
  
  // If boat indicators are strong, cap the max score at 30
  if (isBoat && score > 30) {
    score = Math.min(30, score);
  }
  
  // Cap marine animal scores to keep them in 80-95 range (not 100)
  if (!isBoat && score > 95) {
    score = 95;
  }
  
  console.log('Humpback signature score:', humpbackScore);
  console.log('Orca signature score:', orcaScore);
  console.log('Boat penalty score:', boatScore);
  console.log('Is Boat detected:', isBoat);
  console.log('Total adjustment:', animalScore + boatScore);
  
  // Clamp to 0-100
  score = Math.max(0, Math.min(100, Math.round(score)));
  
  console.log('Final score:', score);
  
  let note;
  if (score >= 80) {
    note = "High: Strong marine mammal vocalizations detected (healthy environment).";
  } else if (score >= 40) {
    note = "Medium: Moderate marine activity or mixed signals with some noise.";
  } else {
    note = "Low: Significant pollution (boat/engine noise) or minimal biological activity.";
  }
  
  return { score, note };
}

/* ------------------------------
   Audio feature analyzer
   ------------------------------ */

function analyzeAudioBufferFeatures(audioBuffer) {
  const SAMPLE_COUNT = 16384;
  const sr = audioBuffer.sampleRate || 44100;
  const take = Math.min(audioBuffer.length, SAMPLE_COUNT);
  const mono = (audioBuffer.numberOfChannels > 1) ? mixDownToMono(audioBuffer, take) : audioBuffer.getChannelData(0).slice(0, take);

  let sum = 0, cnt = 0;
  for (let c = 0; c < audioBuffer.numberOfChannels; c++){
    const data = audioBuffer.getChannelData(c);
    for (let i=0;i<Math.min(data.length, SAMPLE_COUNT); i++){
      sum += data[i]*data[i];
      cnt++;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, cnt));

  const fftSize = nextPowerOfTwo(mono.length);
  const padded = new Float32Array(fftSize);
  padded.set(mono);
  for (let i = 0; i < mono.length; i++) {
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (mono.length - 1)));
    padded[i] *= w;
  }

  const mags = fftRealtoMag(padded);
  const binSize = sr / fftSize;

  let totalEnergy = 0, low = 0, mid = 0, high = 0;
  let lowBins = 0, lowSum = 0, lowMax = 0;
  for (let i = 0; i < mags.length; i++) {
    const f = i * binSize;
    const e = mags[i] * mags[i];
    totalEnergy += e;
    if (f < 300) {
      low += e;
      lowBins++;
      lowSum += mags[i];
      if (mags[i]> lowMax) lowMax = mags[i];
    } else if (f < 3000) mid += e;
    else high += e;
  }
  totalEnergy = Math.max(totalEnergy, 1e-12);
  const lowRatio = low / totalEnergy;
  const midRatio = mid / totalEnergy;
  const highRatio = high / totalEnergy;

  let centroidNum = 0;
  let magSum = 0;
  for (let i = 0; i < mags.length; i++) {
    centroidNum += (i * binSize) * mags[i];
    magSum += mags[i];
  }
  const centroid = centroidNum / (magSum + 1e-12);

  const flatness = computeSpectralFlatness(mags);
  const eps = 1e-12;
  const lowMeanMag = (lowSum / Math.max(1, lowBins)) || eps;
  const lowPeakiness = lowMax / (lowMeanMag + eps);

  return {
    rms: Number(rms.toFixed(4)),
    lowRatio: Number(lowRatio.toFixed(3)),
    midRatio: Number(midRatio.toFixed(3)),
    highRatio: Number(highRatio.toFixed(3)),
    centroid: Math.round(centroid),
    flatness: Number(flatness.toFixed(3)),
    lowPeakiness: Number(lowPeakiness.toFixed(2))
  };
}

/* ------------------------------
   Analyze uploaded audio and display
   ------------------------------ */
async function analyzeUploadedAudioAndShow() {
  try {
    let audioBuffer = null;
    if (audioUploadEl && audioUploadEl.files && audioUploadEl.files[0]) {
      audioBuffer = await decodeFileToAudioBuffer(audioUploadEl.files[0]);
    } else if (uploadedAudio && uploadedAudio.src) {
      audioBuffer = await decodeFileToAudioBuffer(uploadedAudio.src);
    } else {
      showTemporaryAlert('No uploaded audio found. Please upload or play a clip first.', 'rgba(200,30,30,0.95)');
      return;
    }

    showTemporaryAlert('Analyzing audio features...', 'rgba(0,120,200,0.95)');

    const features = analyzeAudioBufferFeatures(audioBuffer);
    const scoring = computeEnvironmentalScore(features);

    const result = {
      score: scoring.score,
      rms: features.rms,
      lowRatio: features.lowRatio,
      midRatio: features.midRatio,
      highRatio: features.highRatio,
      centroid: features.centroid,
      flatness: features.flatness,
      lowPeakiness: features.lowPeakiness,
      note: scoring.note
    };

    let resultEl = document.getElementById('analysis-result');
    if (!resultEl) {
      resultEl = document.createElement('div');
      resultEl.id = 'analysis-result';
      Object.assign(resultEl.style, {
        marginTop: '12px',
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.95)',
        color: '#111',
        borderRadius: '8px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
        maxWidth: '520px'
      });
      const parent = audioUploadEl ? audioUploadEl.parentNode : document.body;
      parent && parent.appendChild(resultEl);
    }

    resultEl.innerHTML = `<strong>Environmental score: ${result.score}/100</strong>
      <div style="font-size:13px;margin-top:6px;">
        <div>RMS (loudness): ${result.rms}</div>
        <div>Low energy ratio (&lt;300Hz): ${result.lowRatio}</div>
        <div>Mid energy ratio (300-3kHz): ${result.midRatio}</div>
        <div>High energy ratio (&gt;3kHz): ${result.highRatio}</div>
        <div>Spectral centroid: ${result.centroid} Hz</div>
        <div>Spectral flatness: ${result.flatness}</div>
        <div>Low peakiness: ${result.lowPeakiness}</div>
        <div style="margin-top:6px;"><em>${result.note}</em></div>
      </div>`;

    showTemporaryAlert(`Analysis complete — score ${result.score}/100`, 'rgba(0,0,0,0.85)');
    console.log('Audio analysis result:', result);
  } catch (err) {
    console.error('analyze error', err);
    showTemporaryAlert('Analysis failed — check console for details.', 'rgba(220,140,20,0.95)');
  }
}

/* ------------------------------
   Analyze button
   ------------------------------ */
const ANALYZE_SERVER_URL = "http://localhost:5000/analyze";

const analyzeBtn = document.getElementById('analyzeBtn');
if (analyzeBtn) {
  analyzeBtn.addEventListener('click', async () => {
    const fileInput = document.getElementById('audioUpload');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      return showTemporaryAlert('Please choose an audio file to upload first.', 'rgba(200,30,30,0.95)');
    }
    const file = fileInput.files[0];

    // Try server first
    showTemporaryAlert('Uploading to server for YAMNet analysis...', 'rgba(0,120,200,0.95)');

    try {
      const fd = new FormData();
      fd.append('file', file);

      const controller = new AbortController();
      const timeoutMs = 15000; // 15 second timeout
      const to = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(ANALYZE_SERVER_URL, { 
        method: 'POST', 
        body: fd, 
        signal: controller.signal, 
        mode: 'cors' 
      });
      clearTimeout(to);

      if (!resp.ok) {
        console.warn('Server returned non-ok for analysis:', resp.status);
        showTemporaryAlert('Server analysis failed — falling back to local analysis.', 'rgba(220,140,20,0.95)');
        return analyzeUploadedAudioAndShow();
      }

      const json = await resp.json();
      
      // Check if server returned an error
      if (json.error) {
        console.warn('Server error:', json.error, json.detail || '');
        showTemporaryAlert('Server error — falling back to local analysis.', 'rgba(220,140,20,0.95)');
        return analyzeUploadedAudioAndShow();
      }

      // Display server results
      let resultEl = document.getElementById('analysis-result');
      if (!resultEl) {
        resultEl = document.createElement('div');
        resultEl.id = 'analysis-result';
        Object.assign(resultEl.style, {
          marginTop: '12px',
          padding: '12px 16px',
          background: 'rgba(255,255,255,0.95)',
          color: '#111',
          borderRadius: '8px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
          maxWidth: '520px'
        });
        const parent = fileInput.parentNode || document.body;
        parent.appendChild(resultEl);
      }
      
      resultEl.innerHTML = `<strong style="color: #0066cc;">🔬 YAMNet Analysis (Server)</strong>
        <div style="font-size:16px;margin:10px 0;padding:8px;background:#f0f8ff;border-radius:4px;">
          <strong>Environmental Score: ${json.score}/100</strong>
        </div>
        <div style="font-size:13px;margin-top:6px;">
          <div><strong>Animal Score:</strong> ${json.animalScore?.toFixed(4) || 'N/A'}</div>
          <div><strong>Noise Score:</strong> ${json.noiseScore?.toFixed(4) || 'N/A'}</div>
          <div style="margin-top:8px;padding:8px;background:#f9f9f9;border-left:3px solid #0066cc;">
            <em>${json.note || ''}</em>
          </div>
        </div>
        <div style="font-size:11px;color:#666;margin-top:8px;">
          ✓ Analyzed using YAMNet deep learning model
        </div>`;
      
      showTemporaryAlert(`Server analysis complete — score ${json.score}/100`, 'rgba(0,180,0,0.95)');
      console.log('Server YAMNet analysis result:', json);
      
    } catch (err) {
      console.warn('Server connection error:', err && (err.message || err));
      showTemporaryAlert('Cannot reach server — running local pattern-matching analysis.', 'rgba(220,140,20,0.95)');
      analyzeUploadedAudioAndShow();
    }
  });
}

/* ------------------------------
   Guess the Sound game
   ------------------------------ */

const gsChoices = Array.from(document.querySelectorAll('.gs-choice'));
let gsRound = 0, gsScore = 0, gsCorrect = null;
const gsRoundEl = document.getElementById('gs-round');
const gsScoreEl = document.getElementById('gs-score');
const gsFeedback = document.getElementById('gs-feedback');

function gsNext(){
  gsRound++;
  if(gsRoundEl) gsRoundEl.textContent = gsRound;
  if(gsFeedback) gsFeedback.textContent = '';
  const pool = ['whale','dolphin','boat'];
  gsCorrect = pool[Math.floor(Math.random()*pool.length)];
  if(gsCorrect==='whale') playWhale();
  if(gsCorrect==='dolphin') playDolphin();
  if(gsCorrect==='boat') playBoat();
}

const gsPlayBtn = document.getElementById('gs-play');
if(gsPlayBtn) {
  gsPlayBtn.addEventListener('click', ()=> {
    if(!gsCorrect) gsNext();
    else {
      if(gsCorrect==='whale') playWhale();
      if(gsCorrect==='dolphin') playDolphin();
      if(gsCorrect==='boat') playBoat();
    }
  });
}

const gsNextBtn = document.getElementById('gs-next');
if(gsNextBtn) gsNextBtn.addEventListener('click', ()=> gsNext());

const gsResetBtn = document.getElementById('gs-reset');
if(gsResetBtn) gsResetBtn.addEventListener('click', ()=>{
  gsRound=0; gsScore=0; gsCorrect=null;
  if(gsRoundEl) gsRoundEl.textContent='0';
  if(gsScoreEl) gsScoreEl.textContent='0';

});