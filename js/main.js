/* ============================================================
   HVL — MCK  |  main.js
   Vanilla JS — không phụ thuộc framework.
   ============================================================ */

(() => {
  'use strict';

  const QUALITY_STORAGE_KEY = 'hvl_quality_pref';
  const CROSSFADE_SEC = 1.5; // thời lượng fade out/in khi chuyển bài

  /* ---------------- State ---------------- */
  const state = {
    tracks: [],
    trackEls: new Map(), // track.id -> <li> element (giữ nguyên DOM để CSS transition popup chạy mượt)
    currentIndex: -1,    // index within state.tracks
    mode: null,          // 'audio' | 'video' | null
    isPlaying: false,
    isShuffle: false,
    isRepeat: false,
    shuffleBag: [],       // remaining shuffle order (indices)
    openTrackId: null,    // track nào đang mở popup chọn định dạng
    audioCtx: null,
    analyser: null,
    masterGain: null,     // gain tổng, dùng cho hẹn giờ ngủ (fade out toàn cục)
    players: [],           // 2 player {el, gain, sourceNode, gen} để crossfade — gán ngay sau khi lấy DOM refs
    activePlayer: 0,       // 0 hoặc 1 — player nào đang là "tiền cảnh" (đang phát chính)
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
    queue: [], // hàng đợi "phát tiếp theo" — mảng track.id, ưu tiên hơn thứ tự thường/shuffle
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

  const discEl       = $('#discEl');
  const discArt      = $('#discArt');
  const eqCanvas     = $('#eqCanvas');
  const eqCtx        = eqCanvas.getContext('2d');
  const qualityBtns  = document.querySelectorAll('.quality-btn');

  // Hai <audio> element luân phiên nhau — 1 cái đang là "tiền cảnh" (đang phát
  // chính), cái còn lại dùng để nạp + fade-in bài kế tiếp trong lúc bài hiện
  // tại fade-out, tạo hiệu ứng chuyển bài liền mạch (crossfade).
  const audioElA = $('#audioElA');
  const audioElB = $('#audioElB');
  state.players = [
    { el: audioElA, gain: null, sourceNode: null, gen: 0 },
    { el: audioElB, gain: null, sourceNode: null, gen: 0 },
  ];

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

  const sleepTimerEl     = $('#sleepTimer');
  const sleepTimerToggle = $('#sleepTimerToggle');
  const sleepTimerMenu   = $('#sleepTimerMenu');
  const sleepTimerLabel  = $('#sleepTimerLabel');
  const sleepTimerOpts   = document.querySelectorAll('.sleep-timer__opt');

  const ytEmbedWrap  = $('#ytEmbedWrap');
  const npTitleVideo  = $('#npTitleVideo');
  const npArtistVideo = $('#npArtistVideo');
  const backToAudioBtn = $('#backToAudioBtn');
  const prevBtnVideo = $('#prevBtnVideo');
  const nextBtnVideo = $('#nextBtnVideo');

  const mobileBar = $('#mobileBar');
  const mobileBarTitle = $('#mobileBarTitle');
  const toastEl = $('#toast');

  /* ---------------- Helpers ---------------- */
  const pad2 = (n) => String(n).padStart(2, '0');
  // Tên hiển thị đầy đủ: "01. Elegie" — dùng cho khu vực đang phát / mini-status / lock-screen.
  const displayTitle = (track) => `${pad2(track.id)}. ${track.title}`;
  // Player đang là "tiền cảnh" tại thời điểm gọi — luôn lấy động vì 2 audio
  // element hoán đổi vai trò liên tục qua mỗi lần crossfade.
  const activeEl = () => state.players[state.activePlayer].el;

  function fmtTime(sec){
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${pad2(s)}`;
  }

  function durationToSeconds(str){
    const parts = String(str).split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  function escapeHtml(str){
    return str.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function highlight(text, query){
    if (!query) return escapeHtml(text);
    const safe = escapeHtml(text);
    const q = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`(${q})`, 'ig'), '<mark>$1</mark>');
  }

  /* ---------------- Toast — thông báo ngắn ---------------- */
  let toastTimer = null;
  function showToast(message){
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
    }, 2400);
  }

  /* ============================================================
     HÀNG ĐỢI "PHÁT TIẾP THEO" — ưu tiên hơn thứ tự thường/shuffle
     ============================================================ */
  function addToQueue(track){
    if (state.queue.includes(track.id)){
      showToast(`"${displayTitle(track)}" đã có trong hàng đợi rồi`);
      return;
    }
    state.queue.push(track.id);
    updateQueueUI();
    showToast(`Đã thêm "${displayTitle(track)}" vào hàng đợi phát tiếp theo`);
  }

  function updateQueueUI(){
    const n = state.queue.length;
    const title = n > 0 ? `Bài tiếp theo (${n} bài đang chờ trong hàng đợi)` : 'Bài tiếp theo';
    nextBtn.title = title;
    nextBtnVideo.title = title;
  }

  /* ============================================================
     CHIA SẺ LINK BÀI HÁT
     ============================================================ */
  function buildShareUrl(track){
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.set('track', track.id);
    return url.toString();
  }

  async function shareTrack(track){
    const url = buildShareUrl(track);
    const shareData = {
      title: 'HVL — MCK',
      text: `Nghe "${track.title}" trong album HVL của MCK`,
      url,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (e) {
        // Người dùng bấm huỷ hộp thoại chia sẻ — không cần báo lỗi gì thêm.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      showToast('Đã sao chép liên kết bài hát vào clipboard');
    } catch (e) {
      showToast(`Không sao chép được tự động — liên kết: ${url}`);
    }
  }

  // Nếu trang được mở từ 1 link chia sẻ (?track=<id>), tự mở popup của đúng
  // bài đó và cuộn tới để người xem thấy ngay, không tự động phát (tránh bị
  // trình duyệt chặn autoplay).
  function openTrackFromUrl(){
    try {
      const params = new URLSearchParams(window.location.search);
      const id = Number(params.get('track'));
      if (!id) return;
      const track = state.tracks.find((t) => t.id === id);
      if (!track) return;
      toggleTrackPopup(track.id);
    } catch (e) {}
  }

  /* ============================================================
     AUDIO FORMAT / CHẤT LƯỢNG — Tự động / FLAC / MP3
     ============================================================ */

  const canPlayFlac = (() => {
    try {
      const probe = document.createElement('audio');
      const result = probe.canPlayType('audio/flac') || probe.canPlayType('audio/x-flac');
      return result === 'probably' || result === 'maybe';
    } catch (e) {
      return false;
    }
  })();

  function pickAudioUrl(track){
    if (state.qualityPref === 'flac') return track.flac_url || track.mp3_url;
    if (state.qualityPref === 'mp3')  return track.mp3_url || track.flac_url;
    return canPlayFlac ? (track.flac_url || track.mp3_url) : (track.mp3_url || track.flac_url);
  }

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

        // Đổi định dạng của bài ĐANG phát: giữ nguyên vị trí, không crossfade
        // (đây là đổi chất lượng, không phải chuyển bài).
        if (state.mode === 'audio' && state.currentIndex !== -1) {
          const track = state.tracks[state.currentIndex];
          if (!track) return;
          const el = activeEl();
          const resumeAt = el.currentTime;
          const wasPlaying = !el.paused;
          state.triedFallback = false;
          el.src = encodeURI(pickAudioUrl(track));
          el.addEventListener('loadedmetadata', function onceLoaded(){
            el.currentTime = resumeAt;
            el.removeEventListener('loadedmetadata', onceLoaded);
          });
          if (wasPlaying) el.play().catch(() => {});
        }
      });
    });
  }
  initQualityControls();

  /* ============================================================
     SLEEP TIMER — hẹn giờ tự tắt nhạc, tiện khi nghe lúc ngủ
     (fade qua masterGain — dùng chung điểm ra loa cuối cùng của cả 2 player,
     nên hoạt động đúng bất kể đang ở giữa 1 lần crossfade hay không)
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
    if (state.masterGain) state.masterGain.gain.value = 1;
  }

  function fadeOutThenPause(){
    const step = 0.05;
    const intervalMs = 300; // ~5.4s để giảm dần từ 1 -> 0
    const fadeId = setInterval(() => {
      if (!state.masterGain) { clearInterval(fadeId); return; }
      state.masterGain.gain.value = Math.max(0, state.masterGain.gain.value - step);
      if (state.masterGain.gain.value <= 0){
        clearInterval(fadeId);
        activeEl().pause();
        state.masterGain.gain.value = 1;
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
     MEDIA SESSION — điều khiển ở màn hình khóa / thông báo hệ thống
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
    navigator.mediaSession.setActionHandler('play', () => activeEl().play().catch(() => {}));
    navigator.mediaSession.setActionHandler('pause', () => activeEl().pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => goToPrev());
    navigator.mediaSession.setActionHandler('nexttrack', () => goToNext());
    try {
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const el = activeEl();
        el.currentTime = Math.max(0, el.currentTime - (details.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const el = activeEl();
        el.currentTime = Math.min(el.duration || Infinity, el.currentTime + (details.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) activeEl().currentTime = details.seekTime;
      });
    } catch (e) {
      // Một số trình duyệt cũ chưa hỗ trợ seekbackward/seekforward/seekto — bỏ qua an toàn.
    }
  }

  function updateMediaSessionPositionState(){
    if (!hasMediaSession || !navigator.mediaSession.setPositionState) return;
    const el = activeEl();
    if (!el.duration || isNaN(el.duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: el.duration,
        playbackRate: el.playbackRate || 1,
        position: el.currentTime,
      });
    } catch (e) {}
  }

  function resumeAudioGraphIfNeeded(){
    if (state.audioCtx && state.audioCtx.state === 'suspended' && state.isPlaying) {
      state.audioCtx.resume().catch(() => {});
    }
  }
  document.addEventListener('visibilitychange', resumeAudioGraphIfNeeded);
  window.addEventListener('pageshow', resumeAudioGraphIfNeeded);
  window.addEventListener('focus', resumeAudioGraphIfNeeded);

  /* ---------------- Load data ---------------- */
  async function loadTracks(){
    try {
      const res = await fetch('js/tracks.json');
      state.tracks = await res.json();
    } catch (err) {
      console.error('Không thể tải tracks.json:', err);
      state.tracks = [];
    }
    buildTracklist();
    updateHeroMeta();
    openTrackFromUrl();
  }

  function updateHeroMeta(){
    trackCountEl.textContent = state.tracks.length;
    const totalSec = state.tracks.reduce((sum, t) => sum + durationToSeconds(t.duration), 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.round((totalSec % 3600) / 60);
    totalDurationEl.textContent = h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
  }

  /* ---------------- Build tracklist (once) ---------------- */
  function buildTracklist(){
    tracklistEl.innerHTML = '';
    tracklistEmptyEl.hidden = state.tracks.length > 0;

    state.tracks.forEach((track) => {
      const li = document.createElement('li');
      li.className = 'track';
      li.dataset.id = track.id;

      li.innerHTML = `
        <button class="track-row" type="button" aria-expanded="false">
          <span class="track-row__num">${pad2(track.id)}</span>
          <span class="track-row__num-playing" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="track-row__info">
            <span class="track-row__title">${escapeHtml(track.title)}</span>
            <span class="track-row__artist">${escapeHtml(track.artist)}</span>
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
            <button class="format-btn" type="button" data-action="queue" data-id="${track.id}">
              <span class="format-btn__emoji">➕</span> Thêm vào hàng đợi
            </button>
            <button class="format-btn" type="button" data-action="share" data-id="${track.id}">
              <span class="format-btn__emoji">🔗</span> Chia sẻ link bài hát
            </button>
          </div>
        </div>
      `;

      li.querySelector('.track-row').addEventListener('click', () => toggleTrackPopup(track.id));
      li.querySelector('[data-action="mp3"]').addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllPopups();
        playAudio(track.id);
      });
      li.querySelector('[data-action="mp4"]').addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllPopups();
        playVideo(track.id);
      });
      li.querySelector('[data-action="queue"]').addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllPopups();
        addToQueue(track);
      });
      li.querySelector('[data-action="share"]').addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllPopups();
        shareTrack(track);
      });

      tracklistEl.appendChild(li);
      state.trackEls.set(track.id, li);
    });
  }

  /* ---------------- Open / close popup (đẩy lên / biến mất) ---------------- */
  function openPopup(id){
    const li = state.trackEls.get(id);
    if (!li) return;
    li.classList.add('is-open');
    li.querySelector('.track-row').setAttribute('aria-expanded', 'true');
    state.openTrackId = id;
    requestAnimationFrame(() => {
      li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function closePopup(id){
    const li = state.trackEls.get(id);
    if (!li) return;
    li.classList.remove('is-open');
    li.querySelector('.track-row').setAttribute('aria-expanded', 'false');
    if (state.openTrackId === id) state.openTrackId = null;
  }

  function closeAllPopups(){
    if (state.openTrackId !== null) closePopup(state.openTrackId);
  }

  function toggleTrackPopup(id){
    const wasOpen = state.openTrackId === id;
    if (state.openTrackId !== null) closePopup(state.openTrackId);
    if (!wasOpen) openPopup(id);
  }

  /* ---------------- Active track highlight ---------------- */
  function setActiveTrack(idx){
    if (state.currentIndex !== -1){
      const prevTrack = state.tracks[state.currentIndex];
      state.trackEls.get(prevTrack?.id)?.classList.remove('is-active');
    }
    state.currentIndex = idx;
    const track = state.tracks[idx];
    state.trackEls.get(track?.id)?.classList.add('is-active');
  }

  /* ---------------- Search / filter (ẩn/hiện, không rebuild DOM) ---------------- */
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    state.tracks.forEach((track) => {
      const li = state.trackEls.get(track.id);
      const match = !q || track.title.toLowerCase().includes(q) || track.artist.toLowerCase().includes(q);
      li.classList.toggle('is-hidden', !match);
      if (match) visibleCount++;
      li.querySelector('.track-row__title').innerHTML = highlight(track.title, q);
      li.querySelector('.track-row__artist').innerHTML = highlight(track.artist, q);
    });

    searchCount.textContent = q ? `${visibleCount}/${state.tracks.length}` : '';
    tracklistEmptyEl.hidden = visibleCount !== 0;
  });

  /* ============================================================
     AUDIO PLAYBACK + WEB AUDIO EQUALIZER + CROSSFADE
     ============================================================ */

  // Dựng đồ thị Web Audio 1 lần duy nhất:
  //   sourceA -> gainA ─┐
  //                      ├─> analyser -> masterGain -> destination
  //   sourceB -> gainB ─┘
  // gainA/gainB là 2 "vô lăng" âm lượng riêng cho từng player, dùng để
  // crossfade giữa 2 bài. masterGain là "vô lăng" chung, dùng cho hẹn giờ ngủ.
  function ensureAudioGraph(){
    if (state.audioCtx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AudioCtx();

    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 256;

    state.masterGain = state.audioCtx.createGain();
    state.masterGain.gain.value = 1;
    state.analyser.connect(state.masterGain);
    state.masterGain.connect(state.audioCtx.destination);

    state.players.forEach((p) => {
      p.sourceNode = state.audioCtx.createMediaElementSource(p.el);
      p.gain = state.audioCtx.createGain();
      p.gain.gain.value = 0;
      p.sourceNode.connect(p.gain);
      p.gain.connect(state.analyser);
    });
  }

  function findIndexById(id){
    return state.tracks.findIndex(t => t.id === id);
  }

  // Chuyển sang phát 1 track mới với hiệu ứng crossfade: bài đang phát (nếu
  // có) fade-out 1.5s trong khi bài mới nạp và fade-in song song 1.5s —
  // 2 audio element chồng lẫn âm thanh trong lúc chuyển tiếp, không bị ngắt
  // quãng đột ngột.
  function crossfadeToTrack(track){
    ensureAudioGraph();
    const now = state.audioCtx.currentTime;
    const fromIdx = state.activePlayer;
    const toIdx = 1 - fromIdx;
    const from = state.players[fromIdx];
    const to = state.players[toIdx];

    const fromWasPlaying = !from.el.paused && !from.el.ended;

    if (fromWasPlaying){
      // Fade-out bài cũ trong CROSSFADE_SEC giây, rồi mới pause hẳn.
      from.gain.gain.cancelScheduledValues(now);
      from.gain.gain.setValueAtTime(from.gain.gain.value, now);
      from.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_SEC);

      const elToStop = from.el;
      const genAtSchedule = from.gen; // "chữ ký" thời điểm lên lịch — để tránh
      setTimeout(() => {              // pause nhầm nếu player này đã được tái
        if (from.gen === genAtSchedule) elToStop.pause(); // sử dụng cho bài khác trong lúc chờ.
      }, CROSSFADE_SEC * 1000 + 60);
    } else {
      from.gain.gain.cancelScheduledValues(now);
      from.gain.gain.setValueAtTime(0, now);
      from.el.pause();
    }

    // Nạp bài mới vào player còn lại và fade-in từ 0 -> 1.
    to.gen = (to.gen || 0) + 1;
    to.el.src = encodeURI(pickAudioUrl(track));
    to.el.currentTime = 0;
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();

    to.gain.gain.cancelScheduledValues(now);
    to.gain.gain.setValueAtTime(0, now);
    to.gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_SEC);

    state.activePlayer = toIdx;
    state.triedFallback = false;

    to.el.play().catch(() => {
      // Autoplay might be blocked, or the placeholder audio file doesn't exist yet — that's expected before the user adds real files.
    });
  }

  function playAudio(id){
    const idx = findIndexById(id);
    if (idx === -1) return;

    state.mode = 'audio';
    closeAllPopups();
    setActiveTrack(idx);
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

    crossfadeToTrack(track);

    updateMiniStatus();
    scrollPlayerIntoViewMobile();
  }

  // Gắn listener cho CẢ 2 audio element — nhưng mỗi handler tự kiểm tra
  // "mình có đang là player tiền cảnh không" trước khi cập nhật UI, để
  // tránh sự kiện từ player nền (đang fade-out/vừa pause) ghi đè trạng thái
  // của bài đang thực sự phát.
  state.players.forEach((player, idx) => {
    const el = player.el;

    el.addEventListener('error', () => {
      if (idx !== state.activePlayer) return;
      if (state.triedFallback || state.mode !== 'audio' || state.currentIndex === -1) return;
      const track = state.tracks[state.currentIndex];
      if (!track) return;
      const current = el.getAttribute('src') || '';
      const fallbackUrl = (track.flac_url && current.includes(encodeURI(track.flac_url).split('/').pop()))
        ? track.mp3_url
        : track.flac_url;
      if (!fallbackUrl) return;
      state.triedFallback = true;
      el.src = encodeURI(fallbackUrl);
      el.play().catch(() => {});
    });

    el.addEventListener('play', () => {
      if (idx !== state.activePlayer) return;
      state.isPlaying = true;
      discEl.classList.add('is-spinning');
      playIcon.hidden = true; pauseIcon.hidden = false;
      startEqualizer();
      updateMiniStatus();
      if (hasMediaSession) navigator.mediaSession.playbackState = 'playing';
    });

    el.addEventListener('pause', () => {
      if (idx !== state.activePlayer) return;
      state.isPlaying = false;
      discEl.classList.remove('is-spinning');
      playIcon.hidden = false; pauseIcon.hidden = true;
      updateMiniStatus();
      if (hasMediaSession) navigator.mediaSession.playbackState = 'paused';
    });

    el.addEventListener('loadedmetadata', () => {
      if (idx !== state.activePlayer) return;
      durTimeEl.textContent = fmtTime(el.duration);
      seekBar.max = el.duration || 0;
      updateMediaSessionPositionState();
    });

    el.addEventListener('timeupdate', () => {
      if (idx !== state.activePlayer) return;
      curTimeEl.textContent = fmtTime(el.currentTime);
      seekBar.value = el.currentTime;
      const pct = el.duration ? (el.currentTime / el.duration) * 100 : 0;
      seekBar.style.setProperty('--pct', pct + '%');
      updateMediaSessionPositionState();
    });

    el.addEventListener('ended', () => {
      if (idx !== state.activePlayer) return;
      if (state.sleepTimer.mode === 'end'){
        // Hẹn giờ "hết bài đang phát" — dừng lại, không tự chuyển bài tiếp.
        clearSleepTimer();
        return;
      }
      if (state.isRepeat){
        el.currentTime = 0;
        el.play();
      } else {
        goToNext();
      }
    });
  });

  seekBar.addEventListener('input', () => {
    activeEl().currentTime = Number(seekBar.value);
  });

  playPauseBtn.addEventListener('click', () => {
    if (state.mode !== 'audio') return;
    const el = activeEl();
    if (el.paused) el.play(); else el.pause();
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

    // Ưu tiên hàng đợi "phát tiếp theo" nếu có.
    if (state.queue.length > 0){
      const queuedId = state.queue.shift();
      updateQueueUI();
      const queuedTrack = state.tracks.find((t) => t.id === queuedId);
      if (queuedTrack){
        if (state.mode === 'video') playVideo(queuedTrack.id); else playAudio(queuedTrack.id);
        return;
      }
    }

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
    closeAllPopups();
    setActiveTrack(idx);
    const track = state.tracks[idx];

    state.players.forEach((p) => p.el.pause());
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
