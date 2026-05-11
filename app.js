// ====================================================
//  Лента + Paint  —  Supabase backend
// ====================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- Supabase init ----------
const cfg = window.SUPABASE_CONFIG || {};
const supaReady = cfg && cfg.url && cfg.anonKey && !cfg.url.includes("YOUR_");
const supabase = supaReady ? createClient(cfg.url, cfg.anonKey) : null;
const TABLE = cfg.table || "posts";
const BUCKET = cfg.bucket || "post-images";

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const feedEl = $("feed");
const loadingEl = $("feed-loading");
const authorInput = $("author-name");
const textInput = $("post-text");
const submitBtn = $("submit-post");
const statusEl = $("composer-status");
const uploadBtn = $("upload-photo");
const photoInput = $("photo-input");
const openPaintBtn = $("open-paint");
const attachPreview = $("attachment-preview");
const attachImg = $("attachment-img");
const removeAttachmentBtn = $("remove-attachment");
const paintModal = $("paint-modal");
const lightbox = $("lightbox");
const lightboxImg = $("lightbox-img");

let currentAttachment = null; // { dataUrl, kind: 'drawing'|'photo' }

// ---------- Helpers ----------
function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = "composer-status " + type;
}

function timeAgo(date) {
  if (!date) return "только что";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "только что";
  if (s < 3600) return Math.floor(s / 60) + " мин назад";
  if (s < 86400) return Math.floor(s / 3600) + " ч назад";
  if (s < 604800) return Math.floor(s / 86400) + " дн назад";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

function initial(name) {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function renderPost(p) {
  const author = p.author || "Аноним";
  const created = p.created_at ? new Date(p.created_at) : null;
  const badge =
    p.kind === "drawing" ? '<span class="post-badge">🎨 Рисунок</span>' :
    p.kind === "photo"   ? '<span class="post-badge">📷 Фото</span>' : "";
  const img = p.image_url
    ? `<img class="post-image" src="${escapeHTML(p.image_url)}" alt="Вложение" loading="lazy" data-lightbox />`
    : "";
  const text = p.text
    ? `<p class="post-text">${escapeHTML(p.text)}</p>`
    : "";
  return `
    <article class="post">
      <header class="post-header">
        <div class="avatar">${escapeHTML(initial(author))}</div>
        <div class="post-meta">
          <span class="post-author">${escapeHTML(author)}</span>
          <span class="post-time">${timeAgo(created)}</span>
        </div>
      </header>
      ${text}
      ${img}
      ${badge}
    </article>
  `;
}

function renderFeed(posts) {
  if (!posts.length) {
    feedEl.innerHTML = '<div class="feed-empty">Постов пока нет. Будьте первым.</div>';
    return;
  }
  feedEl.innerHTML = posts.map(renderPost).join("");
  feedEl.querySelectorAll("[data-lightbox]").forEach((img) => {
    img.addEventListener("click", () => {
      lightboxImg.src = img.src;
      lightbox.classList.remove("hidden");
    });
  });
}

// ---------- Load + realtime ----------
async function loadFeed() {
  if (!supaReady) {
    loadingEl.innerHTML = "Supabase не подключён. Проверьте supabase-config.js.";
    return;
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    feedEl.innerHTML = `<div class="feed-empty">Ошибка загрузки: ${escapeHTML(error.message)}</div>`;
    return;
  }
  renderFeed(data || []);
}

function subscribeRealtime() {
  if (!supaReady) return;
  supabase
    .channel("posts-feed")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: TABLE },
      () => loadFeed()
    )
    .subscribe();
}

// ---------- Attachment ----------
function showAttachment(dataUrl, kind) {
  currentAttachment = { dataUrl, kind };
  attachImg.src = dataUrl;
  attachPreview.classList.remove("hidden");
}
function clearAttachment() {
  currentAttachment = null;
  attachImg.src = "";
  attachPreview.classList.add("hidden");
  photoInput.value = "";
}
removeAttachmentBtn.addEventListener("click", clearAttachment);

uploadBtn.addEventListener("click", () => photoInput.click());
photoInput.addEventListener("change", async () => {
  const file = photoInput.files && photoInput.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("Можно загружать только изображения.", "error");
    return;
  }
  try {
    const dataUrl = await resizeImage(file, 1600);
    showAttachment(dataUrl, "photo");
    setStatus("");
  } catch {
    setStatus("Не удалось обработать изображение.", "error");
  }
});

function resizeImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.88));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Publish ----------
async function publishPost() {
  const text = textInput.value.trim();
  if (!text && !currentAttachment) {
    setStatus("Напишите что-нибудь или прикрепите изображение.", "error");
    return;
  }
  if (!supaReady) {
    setStatus("Supabase не подключён.", "error");
    return;
  }

  submitBtn.disabled = true;
  setStatus("Публикуем...");

  try {
    let imageUrl = null;
    if (currentAttachment) {
      const blob = await (await fetch(currentAttachment.dataUrl)).blob();
      const ext = currentAttachment.kind === "drawing" ? "png" : "jpg";
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase
        .storage
        .from(BUCKET)
        .upload(filename, blob, { contentType: blob.type || `image/${ext}`, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filename);
      imageUrl = pub.publicUrl;
    }

    const author = (authorInput.value.trim() || "Аноним").slice(0, 60);
    const kind = currentAttachment ? currentAttachment.kind : "text";

    const { error } = await supabase
      .from(TABLE)
      .insert({ author, text, image_url: imageUrl, kind });
    if (error) throw error;

    textInput.value = "";
    clearAttachment();
    setStatus("Опубликовано", "success");
    setTimeout(() => setStatus(""), 2000);
    loadFeed();
  } catch (err) {
    console.error(err);
    setStatus("Ошибка: " + (err.message || err), "error");
  } finally {
    submitBtn.disabled = false;
  }
}
submitBtn.addEventListener("click", publishPost);

// ---------- Paint modal ----------
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const colorPicker = $("color-picker");
const swatchesEl = $("swatches");
const sizeSlider = $("size-slider");
const sizeValue = $("size-value");
const sizeDot = $("size-dot");
const clearBtn = $("clear-btn");
const attachDrawingBtn = $("attach-drawing");
const toolButtons = document.querySelectorAll(".tool");

const paintState = { tool: "brush", color: "#111111", size: 6, drawing: false, lastX: 0, lastY: 0 };

function resizeCanvas() {
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const rect = wrap.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));

  const prev = document.createElement("canvas");
  prev.width = canvas.width;
  prev.height = canvas.height;
  if (canvas.width > 0 && canvas.height > 0) prev.getContext("2d").drawImage(canvas, 0, 0);

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (prev.width > 0 && prev.height > 0) {
    ctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function clearCanvas() {
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches && e.touches[0]) {
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function startDraw(e) {
  e.preventDefault();
  paintState.drawing = true;
  const { x, y } = getPos(e);
  paintState.lastX = x; paintState.lastY = y;
  ctx.beginPath();
  ctx.fillStyle = paintState.tool === "eraser" ? "#ffffff" : paintState.color;
  ctx.arc(x, y, paintState.size / 2, 0, Math.PI * 2);
  ctx.fill();
}
function draw(e) {
  if (!paintState.drawing) return;
  e.preventDefault();
  const { x, y } = getPos(e);
  ctx.strokeStyle = paintState.tool === "eraser" ? "#ffffff" : paintState.color;
  ctx.lineWidth = paintState.size;
  ctx.beginPath();
  ctx.moveTo(paintState.lastX, paintState.lastY);
  ctx.lineTo(x, y);
  ctx.stroke();
  paintState.lastX = x; paintState.lastY = y;
}
function stopDraw() { paintState.drawing = false; }

canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", draw);
window.addEventListener("mouseup", stopDraw);
canvas.addEventListener("mouseleave", stopDraw);
canvas.addEventListener("touchstart", startDraw, { passive: false });
canvas.addEventListener("touchmove", draw, { passive: false });
canvas.addEventListener("touchend", stopDraw);
canvas.addEventListener("touchcancel", stopDraw);

toolButtons.forEach((b) => {
  b.addEventListener("click", () => {
    toolButtons.forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    paintState.tool = b.dataset.tool;
    canvas.style.cursor = paintState.tool === "eraser" ? "cell" : "crosshair";
  });
});

function setColor(c) {
  paintState.color = c;
  colorPicker.value = c;
  document.querySelectorAll(".swatch").forEach((s) => {
    s.classList.toggle("active", s.dataset.color.toLowerCase() === c.toLowerCase());
  });
  sizeDot.style.background = c;
  if (paintState.tool === "eraser") {
    document.querySelector('[data-tool="brush"]').click();
  }
}
colorPicker.addEventListener("input", (e) => setColor(e.target.value));
swatchesEl.addEventListener("click", (e) => {
  const s = e.target.closest(".swatch");
  if (s) setColor(s.dataset.color);
});

function setSize(v) {
  paintState.size = +v;
  sizeValue.textContent = v;
  const dot = Math.max(2, Math.min(40, +v));
  sizeDot.style.width = dot + "px";
  sizeDot.style.height = dot + "px";
}
sizeSlider.addEventListener("input", (e) => setSize(e.target.value));

clearBtn.addEventListener("click", () => { if (confirm("Очистить холст?")) clearCanvas(); });

function openPaint() {
  paintModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    resizeCanvas();
    setColor(paintState.color);
    setSize(paintState.size);
  });
}
function closePaint() {
  paintModal.classList.add("hidden");
  document.body.style.overflow = "";
}
openPaintBtn.addEventListener("click", openPaint);
paintModal.addEventListener("click", (e) => {
  if (e.target.dataset.close !== undefined) closePaint();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!paintModal.classList.contains("hidden")) closePaint();
    if (!lightbox.classList.contains("hidden")) lightbox.classList.add("hidden");
  }
});

attachDrawingBtn.addEventListener("click", () => {
  const dataUrl = canvas.toDataURL("image/png");
  showAttachment(dataUrl, "drawing");
  clearCanvas();
  closePaint();
});

lightbox.addEventListener("click", () => lightbox.classList.add("hidden"));

let resizeTimer = null;
window.addEventListener("resize", () => {
  if (paintModal.classList.contains("hidden")) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeCanvas, 100);
});

// ---------- Start ----------
loadFeed();
subscribeRealtime();
