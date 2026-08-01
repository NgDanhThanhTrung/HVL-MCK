/* ============================================================
   HVL — MCK  |  main.js
   Vanilla JS — không phụ thuộc framework.
   ============================================================ */

(() => {
  'use strict';

  /* ---------------- State ---------------- */
  const QUALITY_STORAGE_KEY = 'hvl_quality_pref';
  const state = {
    tracks: [],
    filtered: [],
    currentIndex: -1,   // index within state.tracks
    mode: null,         // 'audio' | 'video' | null
    isPlaying: false,
    isShuffle: false,
    isRepeat: false,
    shuffleBag: [],      // remaining shuffle order (indices)
    openTrackId: null,   // which track row has its popup open
    audioCtx: null,
    analyser: null,
    sourceNode: null,
    rafId: null,
    // 'auto' | 'flac' | 'mp3' — lựa chọn chất lượng của người dùng, nhớ qua localStorage
    qualityPref: (() => {
      try {
        const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
        return (saved === 'flac' || saved === 'mp3' || saved === 'auto') ? saved : 'auto';
      } catch (e) {
        return 'auto';
      }
    })(),
    triedFallback: false,
    sleepTimer: { mode: null, endsAt: null, intervalId: null }, // mode: null | 'end' | minutes(number)
  };

  /* ---------------- DOM refs ---------------- */
  const $ = (sel) => document.querySelector(sel);
  const tracklistEl      = $('#tracklist');
  const tracklistEmptyEl = $('#tracklistEmpty');
  const searchInput      = $('#searchInput');
  const searchCount      = $('#searchCount');
  const trackCountEl     = $('#trackCount');
  const totalDurationEl  = $('#totalDuration');
  const playAllBtn       = $('#playAllBtn');
  const shuffleBtn       = $('#shuffleBtn');
  const miniStatus       = $('#miniStatus');
  const miniStatusText   = $('#miniStatusText');

  const playerCol   = $('#playerCol');
  const playerEmpty = $('#playerEmpty');
  const audioMode    = $('#audioMode');
  const videoMode    = $('#videoMode');

  const audioEl      = $('#audioEl');
  const qualityBtns  = document.querySelectorAll('.quality-btn');

  const sleepTimerEl     = $('#sleepTimer');
  const sleepTimerToggle = $('#sleepTimerToggle');
  const sleepTimerMenu   = $('#sleepTimerMenu');
  const sleepTimerLabel  = $('#sleepTimerLabel');
  const sleepTimerOpts   = document.querySelectorAll('.sleep-timer__opt');

  /* ---------------- Audio format capability ---------------- */
  // Kiểm tra trình duyệt/thiết bị có phát được FLAC không.
  // canPlayType trả về '' (không hỗ trợ), 'maybe', hoặc 'probably'.
  const canPlayFlac = (() => {
    try {
      const probe = document.createElement('audio');
      const result = probe.canPlayType('audio/flac') || probe.canPlayType('audio/x-flac');
      return result === 'probably' || result === 'maybe';
    } catch (e) {
      return false;
    }
  })();

  // Trả về URL audio theo lựa chọn của người dùng:
  // - 'flac' / 'mp3': dùng đúng định dạng đó nếu track có, không thì rơi về định dạng còn lại.
  // - 'auto': FLAC nếu thiết bị hỗ trợ, ngược lại MP3.
  function pickAudioUrl(track){
    if (state.qualityPref === 'flac') return track.flac_url || track.mp3_url;
    if (state.qualityPref === 'mp3')  return track.mp3_url || track.flac_url;
    return canPlayFlac ? (track.flac_url || track.mp3_url) : (track.mp3_url || track.flac_url);
  }

  // Nếu thiết bị không hỗ trợ FLAC, disable nút "FLAC" để tránh người dùng chọn nhầm.
  function initQualityControls(){
    qualityBtns.forEach((btn) => {
      const q = btn.dataset.quality;
      if (q === 'flac' && !canPlayFlac) {
        btn.disabled = true;
        btn.title = 'Thiết bị/trình duyệt này không hỗ trợ phát FLAC';
      }
      btn.classList.toggle('is-active', q === state.qualityPref);
      btn.setAttribute('aria-checked', q === state.qualityPref ? 'true' : 'false');

      btn.addEventListener('click', () => {
        if (btn.disabled || q === state.qualityPref) return;
        state.qualityPref = q;
        try { localStorage.setItem(QUALITY_STORAGE_KEY, q); } catch (e) {}

        qualityBtns.forEach((b) => {
          b.classList.toggle('is-active', b.dataset.quality === q);
          b.setAttribute('aria-checked', b.dataset.quality === q ? 'true' : 'false');
        });

        // Nếu đang phát nhạc, đổi nguồn ngay tại vị trí hiện tại, không phát lại từ đầu.
        if (state.mode === 'audio' && state.currentIndex !== -1) {
          const track = state.tracks[state.currentIndex];
          if (!track) return;
          const resumeAt = audioEl.currentTime;
          const wasPlaying = !audioEl.paused;
          state.triedFallback = false;
          audioEl.src = encodeURI(pickAudioUrl(track));
          audioEl.addEventListener('loadedmetadata', function onceLoaded(){
            audioEl.currentTime = resumeAt;
            audioEl.removeEventListener('loadedmetadata', onceLoaded);
          });
          if (wasPlaying) audioEl.play().catch(() => {});
        }
      });
    });
  }
  initQualityControls();

  /* ============================================================
     SLEEP TIMER — hẹn giờ tự tắt nhạc, tiện khi nghe lúc ngủ
     ============================================================ */
  function formatCountdown(ms){
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function clearSleepTimer(){
    if (state.sleepTimer.intervalId) clearInterval(state.sleepTimer.intervalId);
    state.sleepTimer = { mode: null, endsAt: null, intervalId: null };
    sleepTimerEl.classList.remove('is-active');
    sleepTimerLabel.textContent = 'Hẹn giờ ngủ';
    audioEl.volume = 1;
  }

  function fadeOutThenPause(){
    const step = 0.05;
    const intervalMs = 300; // ~5.4s để giảm dần từ 1 -> 0
    const fadeId = setInterval(() => {
      audioEl.volume = Math.max(0, audioEl.volume - step);
      if (audioEl.volume <= 0){
        clearInterval(fadeId);
        audioEl.pause();
        audioEl.volume = 1;
      }
    }, intervalMs);
  }

  function startSleepTimer(minutes){
    if (state.sleepTimer.intervalId) clearInterval(state.sleepTimer.intervalId);
    const endsAt = Date.now() + minutes * 60 * 1000;
    state.sleepTimer.mode = minutes;
    state.sleepTimer.endsAt = endsAt;
    sleepTimerEl.classList.add('is-active');

    state.sleepTimer.intervalId = setInterval(() => {
      const remaining = endsAt - Date.now();
      if (remaining <= 0){
        fadeOutThenPause();
        clearSleepTimer();
        return;
      }
      sleepTimerLabel.textContent = formatCountdown(remaining);
    }, 1000);
    sleepTimerLabel.textContent = formatCountdown(endsAt - Date.now());
  }

  function startSleepTimerEndOfTrack(){
    if (state.sleepTimer.intervalId) clearInterval(state.sleepTimer.intervalId);
    state.sleepTimer.mode = 'end';
    state.sleepTimer.endsAt = null;
    sleepTimerEl.classList.add('is-active');
    sleepTimerLabel.textContent = 'Hết bài này';
  }

  sleepTimerToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !sleepTimerMenu.hidden;
    sleepTimerMenu.hidden = isOpen;
    sleepTimerToggle.setAttribute('aria-expanded', String(!isOpen));
  });

  document.addEventListener('click', (e) => {
    if (!sleepTimerEl.contains(e.target)) {
      sleepTimerMenu.hidden = true;
      sleepTimerToggle.setAttribute('aria-expanded', 'false');
    }
  });

  sleepTimerOpts.forEach((opt) => {
    opt.addEventListener('click', () => {
      const val = opt.dataset.minutes;
      sleepTimerMenu.hidden = true;
      sleepTimerToggle.setAttribute('aria-expanded', 'false');

      if (val === 'off') { clearSleepTimer(); return; }
      if (val === 'end') { startSleepTimerEndOfTrack(); return; }
      startSleepTimer(Number(val));
    });
  });

  /* ============================================================
     MEDIA SESSION — điều khiển ở màn hình khóa / thông báo hệ thống,
     giúp phát nhạc mượt khi tắt màn hình hoặc chuyển app khác.
     ============================================================ */
  const hasMediaSession = 'mediaSession' in navigator;

  function updateMediaSessionMetadata(track){
    if (!hasMediaSession) return;
    const artUrl = encodeURI(track.cover_art);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: displayTitle(track),
      artist: track.artist,
      album: 'HVL — MCK',
      artwork: [
        { src: artUrl, sizes: '96x96',   type: 'image/jpeg' },
        { src: artUrl, sizes: '192x192', type: 'image/jpeg' },
        { src: artUrl, sizes: '256x256', type: 'image/jpeg' },
        { src: artUrl, sizes: '384x384', type: 'image/jpeg' },
        { src: artUrl, sizes: '512x512', type: 'image/jpeg' },
      ],
    });
  }

  if (hasMediaSession) {
    navigator.mediaSession.setActionHandler('play', () => audioEl.play().catch(() => {}));
    navigator.mediaSession.setActionHandler('pause', () => audioEl.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => goToPrev());
    navigator.mediaSession.setActionHandler('nexttrack', () => goToNext());
    try {
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        audioEl.currentTime = Math.max(0, audioEl.currentTime - (details.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        audioEl.currentTime = Math.min(audioEl.duration || Infinity, audioEl.currentTime + (details.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) audioEl.currentTime = details.seekTime;
      });
    } catch (e) {
      // Một số trình duyệt cũ chưa hỗ trợ seekbackward/seekforward/seekto — bỏ qua an toàn.
    }
  }

  function updateMediaSessionPositionState(){
    if (!hasMediaSession || !navigator.mediaSession.setPositionState) return;
    if (!audioEl.duration || isNaN(audioEl.duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audioEl.duration,
        playbackRate: audioEl.playbackRate || 1,
        position: audioEl.currentTime,
      });
    } catch (e) {}
  }

  // Trên một số trình duyệt (đặc biệt Safari/iOS), AudioContext dùng cho
  // Equalizer có thể bị "suspended" khi khóa màn hình hoặc chuyển app,
  // khiến nhạc bị câm dù audio element vẫn "playing". Tự resume lại khi
  // quay lại tab để đảm bảo tiếp tục nghe được xuyên suốt.
  function resumeAudioGraphIfNeeded(){
    if (state.audioCtx && state.audioCtx.state === 'suspended' && state.isPlaying) {
      state.audioCtx.resume().catch(() => {});
    }
  }
  document.addEventListener('visibilitychange', resumeAudioGraphIfNeeded);
  window.addEventListener('pageshow', resumeAudioGraphIfNeeded);
  window.addEventListener('focus', resumeAudioGraphIfNeeded);
  const discEl       = $('#discEl');
  const discArt      = $('#discArt');
  const eqCanvas     = $('#eqCanvas');
  const eqCtx        = eqCanvas.getContext('2d');

  const npTitle  = $('#npTitle');
  const npArtist = $('#npArtist');
  const curTimeEl = $('#curTime');
  const durTimeEl = $('#durTime');
  const seekBar   = $('#seekBar');

  const playPauseBtn = $('#playPauseBtn');
  const playIcon = $('#playIcon');
  const pauseIcon = $('#pauseIcon');
  const prevBtn = $('#prevBtn');
  const nextBtn = $('#nextBtn');
  const shuffleToggle = $('#shuffleToggle');
  const repeatToggle  = $('#repeatToggle');

  const ytEmbedWrap  = $('#ytEmbedWrap');
  const npTitleVideo  = $('#npTitleVideo');
  const npArtistVideo = $('#npArtistVideo');
  const backToAudioBtn = $('#backToAudioBtn');
  const prevBtnVideo = $('#prevBtnVideo');
  const nextBtnVideo = $('#nextBtnVideo');

  const mobileBar = $('#mobileBar');
  const mobileBarTitle = $('#mobileBarTitle');

  /* ---------------- Helpers ---------------- */
  const pad2 = (n) => String(n).padStart(2, '0');
  // Tên hiển thị đầy đủ: "01. Elegie" — số thứ tự lấy từ track.id (thứ tự sắp xếp).
  const displayTitle = (track) => `${pad2(track.id)}. ${track.title}`;

  function fmtTime(sec){
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${pad2(s)}`;
  }

  // duration string "3:24" -> seconds (used for the total album runtime estimate)
  function durationToSeconds(str){
    const parts = String(str).split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  function escapeHtml(str){
    return str.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // wraps matches of `query` inside `text` with <mark>
  function highlight(text, query){
    if (!query) return escapeHtml(text);
    const safe = escapeHtml(text);
    const q = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`(${q})`, 'ig'), '<mark>$1</mark>');
  }

  /* ---------------- Load data ---------------- */
  async function loadTracks(){
    try {
      const res = await fetch('js/tracks.json');
      state.tracks = await res.json();
    } catch (err) {
      console.error('Không thể tải tracks.json:', err);
      state.tracks = [];
    }
    state.filtered = state.tracks.slice();
    renderTracklist();
    updateHeroMeta();
  }

  function updateHeroMeta(){
    trackCountEl.textContent = state.tracks.length;
    const totalSec = state.tracks.reduce((sum, t) => sum + durationToSeconds(t.duration), 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.round((totalSec % 3600) / 60);
    totalDurationEl.textContent = h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
  }

  /* ---------------- Render tracklist ---------------- */
  function renderTracklist(){
    const query = searchInput.value.trim();
    tracklistEl.innerHTML = '';

    if (state.filtered.length === 0){
      tracklistEmptyEl.hidden = false;
    } else {
      tracklistEmptyEl.hidden = true;
    }

    state.filtered.forEach((track) => {
      const realIndex = state.tracks.indexOf(track);
      const li = document.createElement('li');
      li.className = 'track';
      li.dataset.id = track.id;
      if (state.currentIndex === realIndex) li.classList.add('is-active');
      if (state.openTrackId === track.id) li.classList.add('is-open');

      li.innerHTML = `
        <button class="track-row" type="button" aria-expanded="${state.openTrackId === track.id}">
          <span class="track-row__num">${pad2(track.id)}</span>
          <span class="track-row__num-playing" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="track-row__info">
            <span class="track-row__title">${highlight(track.title, query)}</span>
            <span class="track-row__artist">${highlight(track.artist, query)}</span>
          </span>
          <span class="track-row__duration">${track.duration}</span>
          <svg class="track-row__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="format-popup">
          <div class="format-popup__inner">
            <button class="format-btn" type="button" data-action="mp3" data-id="${track.id}">
              <span class="format-btn__emoji">🎵</span> Nghe Audio + Visualizer
            </button>
            <button class="format-btn" type="button" data-action="mp4" data-id="${track.id}">
              <span class="format-btn__emoji">🎥</span> Xem MP4 Video
            </button>
          </div>
        </div>
      `;

      li.querySelector('.track-row').addEventListener('click', () => toggleTrackPopup(track.id));
      li.querySelector('[data-action="mp3"]').addEventListener('click', (e) => {
        e.stopPropagation();
        playAudio(track.id);
      });
      li.querySelector('[data-action="mp4"]').addEventListener('click', (e) => {
        e.stopPropagation();
        playVideo(track.id);
      });

      tracklistEl.appendChild(li);
    });
  }

  function toggleTrackPopup(id){
    state.openTrackId = (state.openTrackId === id) ? null : id;
    renderTracklist();
    if (state.openTrackId !== null){
      // scroll the opened row into a comfortable view
      requestAnimationFrame(() => {
        const row = tracklistEl.querySelector(`.track[data-id="${id}"]`);
        row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }

  /* ---------------- Search / filter ---------------- */
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    state.filtered = state.tracks.filter(t =>
      t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    );
    searchCount.textContent = q ? `${state.filtered.length}/${state.tracks.length}` : '';
    renderTracklist();
  });

  /* ============================================================
     AUDIO PLAYBACK + WEB AUDIO EQUALIZER
     ============================================================ */

  function ensureAudioGraph(){
    if (state.audioCtx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AudioCtx();
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 256;
    state.sourceNode = state.audioCtx.createMediaElementSource(audioEl);
    state.sourceNode.connect(state.analyser);
    state.analyser.connect(state.audioCtx.destination);
  }

  function findIndexById(id){
    return state.tracks.findIndex(t => t.id === id);
  }

  function playAudio(id){
    const idx = findIndexById(id);
    if (idx === -1) return;

    state.mode = 'audio';
    state.currentIndex = idx;
    state.openTrackId = null;
    const track = state.tracks[idx];

    playerEmpty.hidden = true;
    videoMode.hidden = true;
    stopVideoEmbed();
    audioMode.hidden = false;

    npTitle.textContent = displayTitle(track);
    npArtist.textContent = track.artist;
    discArt.innerHTML = `<img src="${encodeURI(track.cover_art)}" alt="Ảnh bìa ${escapeHtml(track.title)}" onerror="this.parentElement.querySelector('.placeholder-art')?.remove(); this.style.display='none';">
      <svg viewBox="0 0 400 400" class="placeholder-art" aria-hidden="true"><rect width="400" height="400" fill="#0c0d10"/><text x="200" y="215" text-anchor="middle" font-family="Cinzel" font-size="40" fill="#C5CBCE" letter-spacing="4">HVL</text></svg>`;
    updateMediaSessionMetadata(track);

    // Ưu tiên FLAC nếu thiết bị/trình duyệt hỗ trợ, không thì dùng MP3.
    state.triedFallback = false;
    audioEl.src = encodeURI(pickAudioUrl(track));
    ensureAudioGraph();
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();

    audioEl.play().catch(() => {
      // Autoplay might be blocked, or the placeholder audio file doesn't exist yet — that's expected before the user adds real files.
    });

    renderTracklist();
    updateMiniStatus();
    scrollPlayerIntoViewMobile();
  }

  audioEl.addEventListener('error', () => {
    // Nếu nguồn đang phát bị lỗi (vd trình duyệt báo hỗ trợ FLAC nhưng thực
    // tế không phát nổi, hoặc thiếu file), thử đổi sang định dạng còn lại
    // một lần duy nhất trước khi bỏ cuộc.
    if (state.triedFallback || state.mode !== 'audio' || state.currentIndex === -1) return;
    const track = state.tracks[state.currentIndex];
    if (!track) return;
    const current = audioEl.getAttribute('src') || '';
    const fallbackUrl = current.includes(encodeURI(track.flac_url).split('/').pop())
      ? track.mp3_url
      : track.flac_url;
    if (!fallbackUrl) return;
    state.triedFallback = true;
    audioEl.src = encodeURI(fallbackUrl);
    audioEl.play().catch(() => {});
  });

  audioEl.addEventListener('play', () => {
    state.isPlaying = true;
    discEl.classList.add('is-spinning');
    playIcon.hidden = true; pauseIcon.hidden = false;
    startEqualizer();
    updateMiniStatus();
    if (hasMediaSession) navigator.mediaSession.playbackState = 'playing';
  });
  audioEl.addEventListener('pause', () => {
    state.isPlaying = false;
    discEl.classList.remove('is-spinning');
    playIcon.hidden = false; pauseIcon.hidden = true;
    updateMiniStatus();
    if (hasMediaSession) navigator.mediaSession.playbackState = 'paused';
  });
  audioEl.addEventListener('loadedmetadata', () => {
    durTimeEl.textContent = fmtTime(audioEl.duration);
    seekBar.max = audioEl.duration || 0;
    updateMediaSessionPositionState();
  });
  audioEl.addEventListener('timeupdate', () => {
    curTimeEl.textContent = fmtTime(audioEl.currentTime);
    seekBar.value = audioEl.currentTime;
    const pct = audioEl.duration ? (audioEl.currentTime / audioEl.duration) * 100 : 0;
    seekBar.style.setProperty('--pct', pct + '%');
    updateMediaSessionPositionState();
  });
  audioEl.addEventListener('ended', () => {
    if (state.sleepTimer.mode === 'end'){
      // Hẹn giờ "hết bài đang phát" — dừng lại, không tự chuyển bài tiếp.
      clearSleepTimer();
      return;
    }
    if (state.isRepeat){
      audioEl.currentTime = 0;
      audioEl.play();
    } else {
      goToNext();
    }
  });

  seekBar.addEventListener('input', () => {
    audioEl.currentTime = Number(seekBar.value);
  });

  playPauseBtn.addEventListener('click', () => {
    if (state.mode !== 'audio') return;
    if (audioEl.paused) audioEl.play(); else audioEl.pause();
  });

  shuffleToggle.addEventListener('click', () => toggleShuffle(shuffleToggle));
  repeatToggle.addEventListener('click', () => {
    state.isRepeat = !state.isRepeat;
    repeatToggle.setAttribute('aria-pressed', String(state.isRepeat));
  });

  prevBtn.addEventListener('click', goToPrev);
  nextBtn.addEventListener('click', goToNext);
  prevBtnVideo.addEventListener('click', goToPrev);
  nextBtnVideo.addEventListener('click', goToNext);

  backToAudioBtn.addEventListener('click', () => {
    const track = state.tracks[state.currentIndex];
    if (track) playAudio(track.id);
  });

  function toggleShuffle(btnEl){
    state.isShuffle = !state.isShuffle;
    btnEl.setAttribute('aria-pressed', String(state.isShuffle));
    shuffleBtn.classList.toggle('is-active', state.isShuffle);
    if (state.isShuffle) rebuildShuffleBag();
  }

  function rebuildShuffleBag(){
    state.shuffleBag = state.tracks.map((_, i) => i).filter(i => i !== state.currentIndex);
    for (let i = state.shuffleBag.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [state.shuffleBag[i], state.shuffleBag[j]] = [state.shuffleBag[j], state.shuffleBag[i]];
    }
  }

  function nextIndex(){
    if (state.isShuffle){
      if (state.shuffleBag.length === 0) rebuildShuffleBag();
      return state.shuffleBag.pop() ?? 0;
    }
    return (state.currentIndex + 1) % state.tracks.length;
  }
  function prevIndex(){
    if (state.isShuffle){
      return state.shuffleBag.pop() ?? state.currentIndex;
    }
    return (state.currentIndex - 1 + state.tracks.length) % state.tracks.length;
  }

  function goToNext(){
    if (!state.tracks.length) return;
    const idx = nextIndex();
    const track = state.tracks[idx];
    if (state.mode === 'video') playVideo(track.id); else playAudio(track.id);
  }
  function goToPrev(){
    if (!state.tracks.length) return;
    const idx = prevIndex();
    const track = state.tracks[idx];
    if (state.mode === 'video') playVideo(track.id); else playAudio(track.id);
  }

  /* ---------------- Circular canvas equalizer (Web Audio API) ---------------- */
  function startEqualizer(){
    if (state.rafId) cancelAnimationFrame(state.rafId);
    const bufferLength = state.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      state.rafId = requestAnimationFrame(draw);
      state.analyser.getByteFrequencyData(dataArray);

      const w = eqCanvas.width, h = eqCanvas.height;
      eqCtx.clearRect(0, 0, w, h);

      const cx = w / 2, cy = h / 2;
      const baseRadius = w * 0.34;
      const bars = 64;
      const step = Math.floor(bufferLength / bars);

      eqCtx.save();
      eqCtx.translate(cx, cy);

      for (let i = 0; i < bars; i++){
        const value = dataArray[i * step] || 0;
        const amp = (value / 255) * (w * 0.14);
        const angle = (i / bars) * Math.PI * 2;

        const x1 = Math.cos(angle) * baseRadius;
        const y1 = Math.sin(angle) * baseRadius;
        const x2 = Math.cos(angle) * (baseRadius + 6 + amp);
        const y2 = Math.sin(angle) * (baseRadius + 6 + amp);

        const intensity = value / 255;
        eqCtx.strokeStyle = intensity > 0.72
          ? 'rgba(179,42,47,0.95)'
          : 'rgba(31,45,39,0.9)';
        eqCtx.lineWidth = 2.6;
        eqCtx.lineCap = 'round';
        eqCtx.beginPath();
        eqCtx.moveTo(x1, y1);
        eqCtx.lineTo(x2, y2);
        eqCtx.stroke();
      }
      eqCtx.restore();
    };
    draw();
  }

  /* ============================================================
     VIDEO PLAYBACK (YouTube embed + CRT frame)
     ============================================================ */

  function playVideo(id){
    const idx = findIndexById(id);
    if (idx === -1) return;

    state.mode = 'video';
    state.currentIndex = idx;
    state.openTrackId = null;
    const track = state.tracks[idx];

    audioEl.pause();
    playerEmpty.hidden = true;
    audioMode.hidden = true;
    videoMode.hidden = false;

    npTitleVideo.textContent = displayTitle(track);
    npArtistVideo.textContent = track.artist;

    const validId = track.youtube_id && track.youtube_id !== 'REPLACE_WITH_YOUTUBE_ID';
    ytEmbedWrap.innerHTML = validId
      ? `<iframe src="https://www.youtube.com/embed/${encodeURIComponent(track.youtube_id)}?autoplay=1&rel=0" title="${escapeHtml(track.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
      : `<div class="crt-frame__placeholder" style="display:flex;align-items:center;justify-content:center;height:100%;color:#7d858a;font-family:'Rajdhani',sans-serif;text-align:center;padding:20px;">
           Chưa gắn Youtube ID cho bài này.<br>Điền <code>youtube_id</code> trong tracks.json để xem MV tại đây.
         </div>`;

    renderTracklist();
    updateMiniStatus();
    scrollPlayerIntoViewMobile();
  }

  function stopVideoEmbed(){
    ytEmbedWrap.innerHTML = '';
  }

  /* ============================================================
     PLAY ALL / SHUFFLE FROM HERO
     ============================================================ */

  playAllBtn.addEventListener('click', () => {
    if (!state.tracks.length) return;
    playAudio(state.tracks[0].id);
  });

  shuffleBtn.addEventListener('click', () => {
    if (!state.tracks.length) return;
    state.isShuffle = true;
    shuffleToggle.setAttribute('aria-pressed', 'true');
    shuffleBtn.classList.add('is-active');
    rebuildShuffleBag();
    const randomTrack = state.tracks[Math.floor(Math.random() * state.tracks.length)];
    playAudio(randomTrack.id);
  });

  /* ---------------- Mini status (header) ---------------- */
  function updateMiniStatus(){
    const track = state.tracks[state.currentIndex];
    if (!track){
      miniStatusText.textContent = 'Chưa phát bài nào';
      miniStatus.classList.remove('is-playing');
      mobileBar.hidden = true;
      return;
    }
    miniStatusText.textContent = displayTitle(track);
    miniStatus.classList.toggle('is-playing', state.isPlaying);

    mobileBar.hidden = false;
    mobileBarTitle.textContent = displayTitle(track);
    mobileBar.classList.toggle('is-playing', state.isPlaying);
  }

  miniStatus.addEventListener('click', () => {
    playerCol.classList.add('is-expanded');
  });
  mobileBar.addEventListener('click', () => {
    playerCol.classList.toggle('is-expanded');
  });

  function scrollPlayerIntoViewMobile(){
    if (window.matchMedia('(max-width:1080px)').matches){
      playerCol.classList.add('is-expanded');
    }
  }

  /* ---------------- Init ---------------- */
  loadTracks();

})();
