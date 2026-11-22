// Camera play for Silly Guy Land: his raised hand becomes the pointer.
// Hold the hand still on a spot and it taps there. Keep holding and he keeps flying that way.
(function(){
const game = document.getElementById('c');
const vid = document.createElement('video'); vid.playsInline = true; vid.muted = true; vid.style.display = 'none';
document.body.appendChild(vid);

const ov = document.createElement('canvas');
ov.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998';
document.body.appendChild(ov);
const octx = ov.getContext('2d');

const pv = document.createElement('canvas'); pv.width = 240; pv.height = 180;
pv.style.cssText = 'position:fixed;left:12px;bottom:64px;width:200px;height:150px;border-radius:12px;border:3px solid #fff;box-shadow:0 3px 14px rgba(0,0,0,.3);background:#000;z-index:9999;display:none;pointer-events:none';
document.body.appendChild(pv);
const pctx = pv.getContext('2d');

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);display:flex;gap:6px;z-index:9999;font:800 14px "Baloo 2",system-ui,sans-serif;opacity:.55';
panel.onmouseenter = ()=>panel.style.opacity = 1; panel.onmouseleave = ()=>panel.style.opacity = .55;
const mk = (txt)=>{ const b = document.createElement('button'); b.textContent = txt;
  b.style.cssText = 'font:inherit;border:0;border-radius:999px;padding:8px 14px;background:#fff;color:#24203a;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer';
  panel.appendChild(b); return b; };
const bCam = mk('📷 Camera play'), bMode = mk(''), bView = mk('Hide view');
document.body.appendChild(panel);

let mode = 'front'; try { mode = localStorage.getItem('sgl-cam-mode') || 'front'; } catch(e){}
let on = false, landmarker = null, lastVT = -1, vw = 640, vh = 480, sm = null, lastSeen = 0, showView = true;
const setModeLabel = ()=>{ bMode.textContent = mode === 'front' ? 'Camera: in front' : 'Camera: behind'; };
setModeLabel();
bMode.onclick = ()=>{ mode = mode === 'front' ? 'back' : 'front'; try { localStorage.setItem('sgl-cam-mode', mode); } catch(e){} setModeLabel(); };
bView.onclick = ()=>{ showView = !showView; bView.textContent = showView ? 'Hide view' : 'Show view'; pv.style.display = on && showView ? 'block' : 'none'; };
addEventListener('keydown', e=>{ if(e.key === 'f' || e.key === 'F') bMode.onclick(); if(e.key === 'p' || e.key === 'P') bView.onclick(); });

bCam.onclick = async ()=>{
  if(on){ on = false; bCam.textContent = '📷 Camera play'; pv.style.display = 'none'; release(); return; }
  bCam.textContent = 'Starting camera...';
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ video:{ width:{ideal:640}, height:{ideal:480} }, audio:false });
    vid.srcObject = stream; await vid.play();
    vw = vid.videoWidth || 640; vh = vid.videoHeight || 480;
    if(!landmarker){
      const { PoseLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      const fs = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      const opts = d=>({ baseOptions:{ modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate:d },
        runningMode:'VIDEO', numPoses:1, minPoseDetectionConfidence:.4, minPosePresenceConfidence:.4, minTrackingConfidence:.4 });
      try { landmarker = await PoseLandmarker.createFromOptions(fs, opts('GPU')); } catch(e){ landmarker = await PoseLandmarker.createFromOptions(fs, opts('CPU')); }
    }
    on = true; bCam.textContent = '📷 Camera on (tap to stop)';
    pv.style.display = showView ? 'block' : 'none';
    // start the game if it's still on the title screen
    const title = document.getElementById('title'), play = document.getElementById('play');
    if(title && !title.hidden && play) play.click();
  }catch(e){
    console.error(e); bCam.textContent = '📷 Camera failed, tap to retry';
  }
};

// ---- pointer state ----
const cur = { x:-999, y:-999, active:false, side:1 };
let dwellT = 0, anchor = null, pressed = false, lastTap = 0, hoverEl = null;
const DWELL = 0.6, REPEAT = 0.9, BTN_DWELL = 0.9, MOVE_TOL = 60;

function release(){
  if(pressed){ dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerId:7, pointerType:'touch' })); pressed = false; }
  dwellT = 0; anchor = null;
}
function tapCanvas(x, y){
  game.dispatchEvent(new PointerEvent('pointerdown', { clientX:x, clientY:y, bubbles:true, cancelable:true, pointerId:7, pointerType:'touch', isPrimary:true }));
  pressed = true;
}
function clickEl(el, x, y){
  const btn = el.closest('button,a,[role=button]');
  if(btn){ btn.click(); return; }
  const o = { clientX:x, clientY:y, bubbles:true, cancelable:true, pointerId:7, pointerType:'touch', isPrimary:true };
  el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); el.dispatchEvent(new MouseEvent('click', o));
}

function readPose(now){
  if(!on || !landmarker || vid.readyState < 2 || vid.currentTime === lastVT) return;
  lastVT = vid.currentTime;
  let r; try { r = landmarker.detectForVideo(vid, now); } catch(e){ return; }
  const lm = r && r.landmarks && r.landmarks[0]; if(!lm) return;
  if(!sm) sm = lm.map(p=>({ x:p.x, y:p.y, v:p.visibility ?? 1 }));
  else lm.forEach((p,i)=>{ const s = sm[i]; s.x += (p.x-s.x)*.5; s.y += (p.y-s.y)*.5; s.v = p.visibility ?? 1; });
  lastSeen = now;
}
const P = i=>({ x:(mode === 'front' ? 1-sm[i].x : sm[i].x)*vw, y:sm[i].y*vh });

function step(now, dt){
  cur.active = false;
  if(!on || !sm || now - lastSeen > 700){ release(); return; }
  const a = P(11), b = P(12), [L, R] = a.x < b.x ? [a,b] : [b,a];
  const wa = P(15), wb = P(16);
  const sw = Math.max(20, Math.hypot(R.x-L.x, R.y-L.y));
  const mid = { x:(L.x+R.x)/2, y:(L.y+R.y)/2 };
  // the higher hand is the pointer, and only while it's raised
  const w = wa.y < wb.y ? wa : wb;
  if(w.y > mid.y + 0.9*sw){ release(); return; }
  cur.side = w.x < mid.x ? -1 : 1;
  // map hand position around his body to the whole screen, so it works wherever he stands
  const nx = 0.5 + (w.x - mid.x)/(3.2*sw), ny = (w.y - (mid.y - 1.9*sw))/(2.7*sw);
  const tx = Math.min(1, Math.max(0, nx))*innerWidth, ty = Math.min(1, Math.max(0, ny))*innerHeight;
  if(cur.x < -100){ cur.x = tx; cur.y = ty; }
  cur.x += (tx - cur.x)*Math.min(1, dt*10); cur.y += (ty - cur.y)*Math.min(1, dt*10);
  cur.active = true;

  const el = document.elementFromPoint(cur.x, cur.y);
  if(el && panel.contains(el)){ release(); hoverEl = null; return; }
  if(el && el !== game){
    // over a button or card: hold to press it
    if(pressed) release();
    if(el !== hoverEl){ hoverEl = el; dwellT = 0; }
    dwellT += dt;
    if(dwellT >= BTN_DWELL){ clickEl(el, cur.x, cur.y); dwellT = -0.8; }
    return;
  }
  hoverEl = null;
  if(pressed){
    // while pressed, follow the hand (keeps scrubbing teeth and steering)
    game.dispatchEvent(new PointerEvent('pointermove', { clientX:cur.x, clientY:cur.y, bubbles:true, pointerId:7, pointerType:'touch' }));
    const moved = Math.hypot(cur.x - anchor.x, cur.y - anchor.y) > MOVE_TOL;
    if((moved && now/1000 - lastTap > REPEAT) || now/1000 - lastTap > 2.5){
      anchor = { x:cur.x, y:cur.y };
      dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerId:7, pointerType:'touch' }));
      tapCanvas(cur.x, cur.y); lastTap = now/1000;
    }
    return;
  }
  if(!anchor || Math.hypot(cur.x - anchor.x, cur.y - anchor.y) > MOVE_TOL){ anchor = { x:cur.x, y:cur.y }; dwellT = 0; }
  dwellT += dt;
  if(dwellT >= DWELL){ tapCanvas(cur.x, cur.y); lastTap = now/1000; dwellT = 0; anchor = { x:cur.x, y:cur.y }; }
}

function drawOverlay(){
  const d = Math.min(2, devicePixelRatio || 1);
  if(ov.width !== innerWidth*d){ ov.width = innerWidth*d; ov.height = innerHeight*d; }
  octx.setTransform(d,0,0,d,0,0); octx.clearRect(0,0,innerWidth,innerHeight);
  if(!cur.active) return;
  const x = cur.x, y = cur.y, col = cur.side < 0 ? '#4dd2ff' : '#ff6b9a';
  octx.save(); octx.translate(x, y);
  octx.fillStyle = col; octx.strokeStyle = '#fff'; octx.lineWidth = 4;
  for(let i=0;i<4;i++){ const a = -Math.PI/2 + (i-1.5)*.38; octx.beginPath(); octx.ellipse(Math.cos(a)*28, Math.sin(a)*28, 8, 14, a+Math.PI/2, 0, 7); octx.fill(); octx.stroke(); }
  const ta = -Math.PI/2 + cur.side*1.4; octx.beginPath(); octx.ellipse(Math.cos(ta)*25, Math.sin(ta)*25, 8, 13, ta+Math.PI/2, 0, 7); octx.fill(); octx.stroke();
  octx.beginPath(); octx.arc(0,0,25,0,7); octx.fill(); octx.stroke();
  const need = hoverEl ? BTN_DWELL : DWELL;
  const prog = pressed ? 1 : Math.max(0, Math.min(1, dwellT/need));
  if(prog > 0){ octx.strokeStyle = pressed ? '#7dff9a' : '#ffd23f'; octx.lineWidth = 8; octx.beginPath(); octx.arc(0,0,44,-Math.PI/2,-Math.PI/2+prog*Math.PI*2); octx.stroke(); }
  octx.restore();
}
function drawPreview(now){
  if(pv.style.display === 'none') return;
  pctx.save(); if(mode === 'front'){ pctx.translate(240,0); pctx.scale(-1,1); }
  if(vid.readyState >= 2) pctx.drawImage(vid, 0, 0, 240, 180);
  pctx.restore();
  const seen = now - lastSeen < 600;
  if(seen && sm){
    const k = 240/vw, line = (i,j)=>{ const a = P(i), b = P(j); pctx.beginPath(); pctx.moveTo(a.x*k, a.y*k); pctx.lineTo(b.x*k, b.y*k); pctx.stroke(); };
    pctx.lineWidth = 3; pctx.strokeStyle = '#ffd23f'; line(11,12);
    pctx.strokeStyle = '#4dd2ff'; line(11,13); line(13,15);
    pctx.strokeStyle = '#ff6b9a'; line(12,14); line(14,16);
  }
  pctx.fillStyle = 'rgba(0,0,0,.55)'; pctx.fillRect(0,156,240,24);
  pctx.font = '800 14px sans-serif'; pctx.fillStyle = seen ? '#7dff9a' : '#ff8080';
  pctx.fillText(seen ? 'I see him' : 'Can\'t see him', 8, 173);
  pctx.fillStyle = '#fff'; pctx.textAlign = 'right'; pctx.fillText(mode === 'front' ? 'FRONT' : 'BEHIND', 232, 173); pctx.textAlign = 'left';
}

let last = performance.now();
function loop(now){
  const dt = Math.min(.05, (now - last)/1000); last = now;
  readPose(now); step(now, dt); drawOverlay(); drawPreview(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// live refresh: reload when a new version is published, but only from the title screen
let ver = null;
async function check(){
  try{
    const r = await fetch('../version.json?ts=' + Date.now(), { cache:'no-store' }); if(!r.ok) return;
    const v = (await r.json()).v;
    if(ver === null) ver = v;
    else if(v !== ver){ const t = document.getElementById('title'); if(t && !t.hidden) location.reload(); }
  }catch(e){}
}
if(location.protocol.startsWith('http')){ check(); setInterval(check, 20000); }
})();
