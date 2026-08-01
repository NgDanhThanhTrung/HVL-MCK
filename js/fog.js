/* ============================================================
   HVL — MCK  |  fog.js
   Màn sương tĩnh lặng (Interactive Fog):
   - Một lớp sương mờ mỏng phủ trên nền web.
   - Di chuyển chuột sẽ "rẽ sóng" sương, lộ ra hoạ tiết Gothic ẩn bên dưới.
   - Sương tự khép lại vài giây sau khi con trỏ rời khỏi khu vực đó.
   Vanilla JS — không phụ thuộc thư viện ngoài.
   ============================================================ */

(() => {
  'use strict';

  const canvas = document.getElementById('fogCanvas');
  const hiddenLayer = document.getElementById('fogHiddenLayer');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 0, h = 0, dpr = 1;

  function resizeCanvas(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();

  /* ============================================================
     LỚP HOẠ TIẾT ẨN — rune/sigil Gothic nhỏ, bị sương che gần kín,
     chỉ lộ rõ hơn khi lớp sương phía trên bị "rẽ" ra.
     ============================================================ */
  function buildHiddenGlyphs(){
    if (!hiddenLayer) return;
    hiddenLayer.innerHTML = '';

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    // Pseudo-random có seed cố định (LCG đơn giản) — bố cục ổn định qua các lần tải trang,
    // không thay đổi lộn xộn mỗi lần resize nhỏ.
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const area = window.innerWidth * window.innerHeight;
    const count = Math.max(14, Math.min(46, Math.round(area / 42000)));

    for (let i = 0; i < count; i++){
      const x = rand() * window.innerWidth;
      const y = rand() * window.innerHeight;
      const size = 14 + rand() * 20;
      const rot = rand() * 360;
      const kind = rand();

      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('transform', `translate(${x.toFixed(1)}, ${y.toFixed(1)}) rotate(${rot.toFixed(1)})`);
      g.setAttribute('opacity', (0.10 + rand() * 0.12).toFixed(2));
      g.setAttribute('stroke', '#8B1E22');
      g.setAttribute('fill', 'none');
      g.setAttribute('stroke-width', '1');

      let inner;
      if (kind < 0.34){
        // hình thoi nhỏ
        inner = `<path d="M0,${(-size/2).toFixed(1)} L${(size/2).toFixed(1)},0 L0,${(size/2).toFixed(1)} L${(-size/2).toFixed(1)},0 Z"/>`;
      } else if (kind < 0.67){
        // dấu rune chữ thập
        inner = `<path d="M0,${(-size/2).toFixed(1)} L0,${(size/2).toFixed(1)} M${(-size/2).toFixed(1)},0 L${(size/2).toFixed(1)},0"/>`;
      } else {
        // vòng tròn + chấm tâm
        inner = `<circle r="${(size/2).toFixed(1)}"/><circle r="1.3" fill="#8B1E22" stroke="none"/>`;
      }
      g.innerHTML = inner;
      svg.appendChild(g);
    }

    hiddenLayer.appendChild(svg);
  }
  buildHiddenGlyphs();

  let resizeT = null;
  window.addEventListener('resize', () => {
    resizeCanvas();
    clearTimeout(resizeT);
    resizeT = setTimeout(buildHiddenGlyphs, 250);
  });

  /* ============================================================
     VỆT DI CHUYỂN CHUỘT — nơi sương sẽ "rẽ" ra, tự khép lại theo thời gian
     ============================================================ */
  const trail = [];
  const TRAIL_MAX_AGE = 1300; // ms — sương khép lại hoàn toàn sau khoảng thời gian này

  function addTrailPoint(x, y){
    trail.push({ x, y, born: performance.now() });
    if (trail.length > 60) trail.shift();
  }

  window.addEventListener('pointermove', (e) => {
    addTrailPoint(e.clientX, e.clientY);
  }, { passive: true });

  // Trên thiết bị cảm ứng: vệt chạm cũng "rẽ" sương tương tự con trỏ chuột.
  window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) addTrailPoint(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  /* ============================================================
     VẼ SƯƠNG — tính lại toàn bộ mỗi khung hình (không tích luỹ pixel),
     nên không bao giờ bị "quá đặc" theo thời gian.
     ============================================================ */
  const FOG_COLOR = '74,83,90';  // rgb của --surface
  const FOG_DARK  = '8,9,11';    // rgb của --bg

  function drawBaseFog(t){
    ctx.clearRect(0, 0, w, h);
    const blobCount = 6;
    for (let i = 0; i < blobCount; i++){
      const speed = 0.00007 + (i % 3) * 0.00003;
      const px = (Math.sin(t * speed + i * 12.9) * 0.5 + 0.5) * w;
      const py = (Math.cos(t * speed * 1.3 + i * 7.3) * 0.5 + 0.5) * h;
      const r = Math.min(w, h) * (0.30 + 0.08 * Math.sin(t * 0.00004 + i));

      const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0,   `rgba(${FOG_COLOR}, 0.22)`);
      grad.addColorStop(0.6, `rgba(${FOG_COLOR}, 0.09)`);
      grad.addColorStop(1,   `rgba(${FOG_DARK}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function punchTrail(now){
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = trail.length - 1; i >= 0; i--){
      const p = trail[i];
      const age = now - p.born;
      if (age > TRAIL_MAX_AGE){ trail.splice(i, 1); continue; }

      const strength = 1 - age / TRAIL_MAX_AGE; // 1 = vừa rẽ ra, 0 = sắp khép lại
      const radius = 70 + strength * 90;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      grad.addColorStop(0, `rgba(0,0,0,${(0.85 * strength).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  let rafId = null;
  function frame(t){
    drawBaseFog(t);
    punchTrail(performance.now());
    rafId = requestAnimationFrame(frame);
  }

  // Tôn trọng prefers-reduced-motion: vẽ 1 lớp sương tĩnh, không animate,
  // không phản ứng theo chuột.
  if (prefersReducedMotion){
    drawBaseFog(0);
  } else {
    rafId = requestAnimationFrame(frame);
  }

  // Tạm dừng vòng lặp khi tab không hiển thị để tiết kiệm CPU/pin.
  document.addEventListener('visibilitychange', () => {
    if (prefersReducedMotion) return;
    if (document.hidden){
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    } else if (!rafId){
      rafId = requestAnimationFrame(frame);
    }
  });

})();
