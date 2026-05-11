(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const wrap = canvas.parentElement;

  const colorPicker = document.getElementById('color-picker');
  const swatchesEl = document.getElementById('swatches');
  const sizeSlider = document.getElementById('size-slider');
  const sizeValue = document.getElementById('size-value');
  const sizeDot = document.getElementById('size-dot');
  const clearBtn = document.getElementById('clear-btn');
  const saveBtn = document.getElementById('save-btn');
  const toolButtons = document.querySelectorAll('.tool');

  const state = {
    tool: 'brush',
    color: '#111111',
    size: 6,
    drawing: false,
    lastX: 0,
    lastY: 0,
  };

  // ---------- Canvas sizing (preserve content on resize) ----------
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));

    // Preserve existing content
    const prev = document.createElement('canvas');
    prev.width = canvas.width;
    prev.height = canvas.height;
    if (canvas.width > 0 && canvas.height > 0) {
      prev.getContext('2d').drawImage(canvas, 0, 0);
    }

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Restore previous drawing scaled to new size
    if (prev.width > 0 && prev.height > 0) {
      ctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, canvas.width, canvas.height);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  // ---------- Drawing ----------
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    state.drawing = true;
    const { x, y } = getPos(e);
    state.lastX = x;
    state.lastY = y;
    // Dot on click
    ctx.beginPath();
    ctx.fillStyle = state.tool === 'eraser' ? '#ffffff' : state.color;
    ctx.arc(x, y, state.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(e) {
    if (!state.drawing) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    ctx.strokeStyle = state.tool === 'eraser' ? '#ffffff' : state.color;
    ctx.lineWidth = state.size;
    ctx.beginPath();
    ctx.moveTo(state.lastX, state.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    state.lastX = x;
    state.lastY = y;
  }

  function stopDraw() {
    state.drawing = false;
  }

  // Mouse
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDraw);
  canvas.addEventListener('mouseleave', stopDraw);

  // Touch
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDraw);
  canvas.addEventListener('touchcancel', stopDraw);

  // ---------- Tool selection ----------
  toolButtons.forEach((b) => {
    b.addEventListener('click', () => {
      toolButtons.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.tool = b.dataset.tool;
      canvas.style.cursor = state.tool === 'eraser' ? 'cell' : 'crosshair';
    });
  });

  // ---------- Color ----------
  function setColor(c) {
    state.color = c;
    colorPicker.value = c;
    document.querySelectorAll('.swatch').forEach((s) => {
      s.classList.toggle('active', s.dataset.color.toLowerCase() === c.toLowerCase());
    });
    sizeDot.style.background = c;
    // Switching color implies brush
    if (state.tool === 'eraser') {
      document.querySelector('[data-tool="brush"]').click();
    }
  }

  colorPicker.addEventListener('input', (e) => setColor(e.target.value));
  swatchesEl.addEventListener('click', (e) => {
    const s = e.target.closest('.swatch');
    if (s) setColor(s.dataset.color);
  });

  // ---------- Size ----------
  function setSize(v) {
    state.size = +v;
    sizeValue.textContent = v;
    const dot = Math.max(2, Math.min(40, +v));
    sizeDot.style.width = dot + 'px';
    sizeDot.style.height = dot + 'px';
  }
  sizeSlider.addEventListener('input', (e) => setSize(e.target.value));

  // ---------- Clear ----------
  clearBtn.addEventListener('click', () => {
    if (!confirm('Очистить весь холст?')) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  });

  // ---------- Save ----------
  saveBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `paint-${ts}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // ---------- Init ----------
  setColor('#111111');
  setSize(6);
  resizeCanvas();

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 100);
  });
})();
