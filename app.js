// ====================================================
//  Лента + Paint  —  основной модуль
// ====================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy, limit,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ---------- Firebase init ----------
const cfg = window.FIREBASE_CONFIG || {};
const firebaseReady = cfg && cfg.apiKey && !cfg.apiKey.startsWith("YOUR_");

let db = null, storage = null;
if (firebaseReady) {
  const app = initializeApp(cfg);
  db = getFirestore(app);
  storage = getStorage(app);
}

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

// State
let currentAttachment = null; // { dataUrl, kind: 'drawing'|'photo' }

// Restore name from previous session (in-memory only, no storage available cross-session)

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
  const created = p.createdAt && p.createdAt.toDate ? p.createdAt.toDate() : null;
  const badge =
    p.kind === "drawing" ? '<span class="post-badge">🎨 Рисунок</span>' :
    p.kind === "photo"   ? '<span class="post-badge">📷 Фото</span>' : "";

  const img = p.imageUrl
    ? `<img class="post-image" src="${escapeHTML(p.imageUrl)}" alt="Вложение" loading="lazy" data-lightbox />`
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

// ---------- Firestore subscription ----------
function subscribeFeed() {
  if (!firebaseReady) {
    loadingEl.innerHTML =
      'Firebase ещё не подключён.<br>' +
      'Откройте <code>firebase-config.js</code> и вставьте ваш конфиг.<br>' +
      'Инструкция в <a href="https://github.com/DBHSMQ/paint-app#подключение-firebase" target="_blank">README</a>.';
    return;
  }
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(100));
  onSnapshot(q, (snap) => {
    const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderFeed(posts);
  }, (err) => {
    console.error(err);
    feedEl.innerHTML = `<div class="feed-empty">Ошибка загрузки: ${escapeHTML(err.message)}</div>`;
  });
}

// ---------- Attachment handling ----------
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

// Photo upload
uploadBtn.addEventListener("click", () => photoInput.click());
photoInput.addEventListener("change", async () => {
  const file = photoInput.files && photoInput.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("Можно загружать только изображения.", "error");
    return;
  }
  // Resize to max 1600px wide to keep upload fast
  try {
    const dataUrl = await resizeImage(file, 1600);
    showAttachment(dataUrl, "photo");
    setStatus("");
  } catch (e) {
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

// ---------- Publish post ----------
async function publishPost() {
  const text = textInput.value.trim();
  if (!text && !currentAttachment) {
    setStatus("Напишите что-нибудь или прикрепите изображение.", "error");
    return;
  }
  if (!firebaseReady) {
    setStatus("Firebase не подключён — невозможно опубликовать.", "error");
    return;
  }

  submitBtn.disabled = true;
  setStatus("Публикуем...");

  try {
    let imageUrl = null;
    if (currentAttachment) {
      // Upload to Storage
      const blob = await (await fetch(currentAttachment.dataUrl)).blob();
      const ext = currentAttachment.kind === "drawing" ? "png" : "jpg";
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const storageRef = ref(storage, `posts/${filename}`);
      await uploadBytes(storageRef, blob);
      imageUrl = await getDownloadURL(storageRef);
    }

    const author = authorInput.value.trim() || "Аноним";
    const kind = currentAttachment ? currentAttachment.kind : "text";

    await addDoc(collection(db, "posts"), {
      author,
      text,
      imageUrl,
      kind,
      createdAt: serverTimestamp()
    });

    textInput.value = "";
    clearAttachment();
    setStatus("Опубликовано", "success");
    setTimeout(() => setStatus(""), 2000);
  } catch (err) {
    console.error(err);
    setStatus("Ошибка: " + err.message, "error");
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

const paintState = {
  tool: "brush",
  color: "#111111",
  size: 6,
  drawing: false,
  lastX: 0, lastY: 0,
};

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

clearBtn.addEventListener("click", () => {
  if (confirm("Очистить холст?")) clearCanvas();
});

// Open / close modal
function openPaint() {
  paintModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  // Initialize canvas after the modal becomes visible
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

// Attach drawing to post
attachDrawingBtn.addEventListener("click", () => {
  const dataUrl = canvas.toDataURL("image/png");
  showAttachment(dataUrl, "drawing");
  clearCanvas();
  closePaint();
});

// Lightbox close
lightbox.addEventListener("click", () => lightbox.classList.add("hidden"));

// Resize handler
let resizeTimer = null;
window.addEventListener("resize", () => {
  if (paintModal.classList.contains("hidden")) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeCanvas, 100);
});

// ---------- Start ----------
subscribeFeed();
