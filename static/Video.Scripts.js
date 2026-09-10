(function(){


   const app = document.getElementById('app');
   const video = document.getElementById('video');
   const stage = document.getElementById('stage');
   const fileInput = document.getElementById('fileInput');
   const openBtn = document.getElementById('openBtn');
   const fnameEl = document.getElementById('fname');
   const fmetaEl = document.getElementById('fmeta');
   const scrubFill = document.getElementById('scrubFill');

   const settingsBox = document.getElementById('settingsBox');
   const settingsGear = document.getElementById('settingsGear');
   const settingsPanel = document.getElementById('settingsPanel');

   const playBtn = document.getElementById('playBtn');
   const playIcon = document.getElementById('playIcon');
   const muteBtn = document.getElementById('muteBtn');
   const muteIcon = document.getElementById('muteIcon');
   const speedBtn = document.getElementById('speedBtn');
   const speedIcon = document.getElementById('speedIcon');
   const browserBtn = document.getElementById('browserBtn');

   let currentFile = null; let currentUrl = null; const speeds = [1,2,3]; let speedIndex = 0; // 0 -> 1x, 1 -> 2x, 2 -> 3x


   /* ---------- utils ---------- */

   function fmtTime(sec){
      if (!isFinite(sec) || sec<0) sec = 0;
      const h = Math.floor(sec/3600); const m = Math.floor((sec%3600)/60); const s = Math.floor(sec%60);
      const pad = n => String(n).padStart(2,'0'); return h>0 ? `${h}:${pad(m)}:${pad(s)}`:`${pad(m)}:${pad(s)}`;
   }

   function updateMeta(){
      if (!currentFile) { fmetaEl.textContent = '—'; return; }
      const sizeMB = (currentFile.size / (1024*1024)).toFixed(2); const cur = fmtTime(video.currentTime);
      const dur = fmtTime(video.duration || 0); fmetaEl.textContent = `${sizeMB} MB  •  ${cur} / ${dur}`;
   }

   /* mouse-follow glow for any glass/ctl button */
   function attachGlow(el){
      el.addEventListener('mousemove', e=>{
         const r = el.getBoundingClientRect(); const x = ((e.clientX - r.left)/r.width)*100; const y = ((e.clientY - r.top)/r.height)*100;
         el.style.setProperty('--mx', x+'%'); el.style.setProperty('--my', y+'%');
      });
   }

   attachGlow(openBtn);
   document.querySelectorAll('.ctl-btn').forEach(attachGlow);


   /* ---------- open file ---------- */

   openBtn.addEventListener('click', ()=> fileInput.click());

   fileInput.addEventListener('change', ()=>{
      const f = fileInput.files[0]; if (!f) return;

      // آزادسازی URL قبلی برای جلوگیری از memory leak
      if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }

      currentFile = f; currentUrl = URL.createObjectURL(f); video.src = currentUrl;

      // ریست حالت‌های قبلی
      video.muted = false; muteIcon.textContent = '🔊'; muteBtn.classList.remove('active');

      fnameEl.textContent = f.name; app.classList.add('has-file');

      // تلاش برای پخش بعد از آماده شدن metadata
      const tryPlay = () => {
         const p = video.play(); if (p && typeof p.catch === 'function') {
            p.catch((err) => {
               // اگر مرورگر autoplay با صدا را رد کرد، بی‌صدا پلی کن
               if (err && err.name === 'NotAllowedError') {
                  video.muted = true; muteIcon.textContent = '🔇'; muteBtn.classList.add('active'); video.play().catch(()=>{});
               }
            });
         }
      };

      if (video.readyState >= 1) { tryPlay(); } else { video.addEventListener('loadedmetadata', tryPlay, { once: true }); }

   });

   video.addEventListener('loadedmetadata', updateMeta);
   video.addEventListener('timeupdate', ()=>{
      updateMeta(); if (video.duration){ scrubFill.style.width = (video.currentTime/video.duration*100) + '%'; }
   });



   /* ---------- play / pause ---------- */

   function togglePlay(){
      if (!video.src) return; if (video.paused) { video.play().catch(()=>{}); } else { video.pause(); }
   }
   video.addEventListener('play', ()=> playIcon.textContent = '⏸');
   video.addEventListener('pause', ()=> playIcon.textContent = '▶');



   /* ---------- mute (video keeps playing) ---------- */

   function toggleMute(){
      video.muted = !video.muted; muteIcon.textContent = video.muted ? '🔇' : '🔊'; muteBtn.classList.toggle('active', video.muted);
   }



   /* ---------- speed cycle 1x -> 2x -> 3x -> 1x ---------- */

   function cycleSpeed(){
      speedIndex = (speedIndex + 1) % speeds.length; const s = speeds[speedIndex];
      video.playbackRate = s; speedIcon.textContent = s + '×'; speedBtn.classList.toggle('active', s !== 1);
   }



   /* ---------- native browser controls toggle ---------- */

   function toggleBrowserControls(){ video.controls = !video.controls; browserBtn.classList.toggle('active', video.controls); }



   /* ---------- settings box morph ---------- */

   function setSettingsOpen(state){ settingsBox.classList.toggle('open', state); }
   function toggleSettings(){ setSettingsOpen(!settingsBox.classList.contains('open')); }
   settingsGear.addEventListener('click', toggleSettings);



   /* ---------- seek: 10s, 15s if pressed back-to-back ---------- */

   const RAPID_MS = 550; let lastRightPress = 0; let lastLeftPress = 0;

   function seekBy(delta){
      if (!video.src) return; video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration || Infinity);
   }
   function seekNext(){
      const now = Date.now(); const rapid = (now - lastRightPress) < RAPID_MS; seekBy( rapid?15:10 ); lastRightPress = now;
   }
   function seekPrev(){
      const now = Date.now(); const rapid = (now - lastLeftPress) < RAPID_MS; seekBy(-(rapid ? 15 : 10)); lastLeftPress = now;
   }



   /* ---------- control-box button clicks ---------- */
   
   settingsPanel.addEventListener('click', (e)=>{
      const btn = e.target.closest('.ctl-btn');
      if (!btn) return;
      switch(btn.dataset.action){
         case 'play': togglePlay(); break;
         case 'mute': toggleMute(); break;
         case 'speed': cycleSpeed(); break;
         case 'browser': toggleBrowserControls(); break;
         case 'next': seekNext(); break;
         case 'prev': seekPrev(); break;
      }
   });



   /* ---------- keyboard shortcuts ---------- */

   let ctrlComboUsed = false;
   window.addEventListener('keydown', (e)=>{
      // track ctrl combos so a lone Ctrl press can be detected on keyup
      if (e.key === 'Control'){
         // fresh press, don't reset comboUsed here (keyup handles it)
      } else if (e.ctrlKey){ ctrlComboUsed = true; }

      if (e.code === 'Space'){ e.preventDefault(); togglePlay(); return; }
      if (e.altKey && (e.key === 'u' || e.key === 'U')){ e.preventDefault(); toggleMute(); return; }
      if (e.altKey && (e.key === 'm' || e.key === 'M')){ e.preventDefault(); cycleSpeed(); return; }
      if (e.ctrlKey && (e.key === 'b' || e.key === 'B')){ e.preventDefault(); toggleBrowserControls(); return; }
      if (e.key === 'ArrowRight'){ e.preventDefault(); seekNext(); return; }
      if (e.key === 'ArrowLeft'){ e.preventDefault(); seekPrev(); return; }

   });

   window.addEventListener('keyup', (e)=>{
      if (e.key === 'Control'){ if (!ctrlComboUsed){ toggleSettings(); } ctrlComboUsed = false; }
   });

})();
