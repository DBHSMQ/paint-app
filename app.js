// ====================================================
//  Лента + Paint + Auth + Профили  —  Supabase backend
// ====================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- Supabase init ----------
const cfg = window.SUPABASE_CONFIG || {};
const supaReady = cfg && cfg.url && cfg.anonKey;
const supabase = supaReady ? createClient(cfg.url, cfg.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
}) : null;
const TABLE = cfg.table || "posts";
const BUCKET = cfg.bucket || "post-images";
const AVATAR_BUCKET = "avatars";

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const feedEl = $("feed");
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
const authArea = $("auth-area");
const authModal = $("auth-modal");
const authForm = $("auth-form");
const authEmail = $("auth-email");
const authPassword = $("auth-password");
const authName = $("auth-name");
const authSubmit = $("auth-submit");
const authStatus = $("auth-status");
const authTitle = $("auth-title");
const signupNameField = $("signup-name-field");
const profileModal = $("profile-modal");
const profileAvatar = $("profile-avatar");
const profileNameInput = $("profile-name");
const profileEmailInput = $("profile-email");
const profileStatus = $("profile-status");
const uploadAvatarBtn = $("upload-avatar");
const removeAvatarBtn = $("remove-avatar");
const avatarInput = $("avatar-input");
const saveProfileBtn = $("save-profile");
const signoutBtn = $("signout-btn");
const composerAvatar = $("composer-avatar");
const composerAuthorDisplay = $("composer-author-display");
const anonNameRow = $("anon-name-row");
const authNameRow = $("auth-name-row");

let currentUser = null;          // auth user
let currentProfile = null;       // row from profiles
let currentAttachment = null;    // { dataUrl, kind }
let authMode = "signin";         // 'signin' | 'signup'
let pendingAvatarDataUrl = null; // for profile modal
let pendingAvatarRemoval = false;

// ---------- Utils ----------
function setStatus(el, msg, type = "") {
  el.textContent = msg;
  el.className = "composer-status " + type;
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
function avatarPlaceholder(name) {
  const letter = escapeHTML(initial(name));
  return `<div class="avatar">${letter}</div>`;
}
function avatarFor(name, avatarUrl) {
  if (avatarUrl) {
    return `<img class="avatar-img" src="${escapeHTML(avatarUrl)}" alt="" />`;
  }
  return avatarPlaceholder(name);
}

// ---------- Feed rendering ----------
function renderPost(p) {
  const author = p.author || "Аноним";
  const created = p.created_at ? new Date(p.created_at) : null;
  const profile = p.profiles; // joined
  const displayName = profile?.name || author;
  const avatarUrl = profile?.avatar_url || null;
  const isRegistered = !!p.user_id;

  const badge =
    p.kind === "drawing" ? '<span class="post-badge">🎨 Рисунок</span>' :
    p.kind === "photo"   ? '<span class="post-badge">📷 Фото</span>' : "";

  const img = p.image_url
    ? `<img class="post-image" src="${escapeHTML(p.image_url)}" alt="Вложение" loading="lazy" data-lightbox />`
    : "";
  const text = p.text
    ? `<p class="post-text">${escapeHTML(p.text)}</p>`
    : "";

  const verifiedDot = isRegistered ? '<span class="verified-dot" title="Зарегистрированный автор"></span>' : "";

  return `
    <article class="post">
      <header class="post-header">
        ${avatarFor(displayName, avatarUrl)}
        <div class="post-meta">
          <span class="post-author">${escapeHTML(displayName)}${verifiedDot}</span>
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

async function loadFeed() {
  if (!supaReady) {
    feedEl.innerHTML = '<div class="feed-empty">Supabase не подключён.</div>';
    return;
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select("*, profiles!posts_profile_fk(name, avatar_url)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    feedEl.innerHTML = `<div class="feed-empty">Ошибка: ${escapeHTML(error.message)}</div>`;
    return;
  }
  renderFeed(data || []);
}

function subscribeRealtime() {
  if (!supaReady) return;
  supabase.channel("posts-feed")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE }, () => loadFeed())
    .subscribe();
}

// ---------- Auth UI rendering ----------
function renderAuthArea() {
  if (currentUser && currentProfile) {
    const av = avatarFor(currentProfile.name, currentProfile.avatar_url);
    authArea.innerHTML = `
      <button type="button" class="user-chip" id="open-profile">
        ${av.replace('class="avatar-img"', 'class="avatar-img small"').replace('class="avatar"', 'class="avatar" style="width:32px;height:32px;font-size:13px"')}
        <span class="user-chip-name">${escapeHTML(currentProfile.name)}</span>
      </button>
    `;
    $("open-profile").addEventListener("click", openProfile);
    anonNameRow.classList.add("hidden");
    authNameRow.classList.remove("hidden");
    composerAvatar.src = currentProfile.avatar_url || "";
    if (!currentProfile.avatar_url) {
      // Replace img with placeholder
      const ph = avatarPlaceholder(currentProfile.name).replace('class="avatar"', 'class="avatar" style="width:32px;height:32px;font-size:13px"');
      composerAvatar.outerHTML = ph.replace('<div', '<div id="composer-avatar"');
    }
    composerAuthorDisplay.textContent = currentProfile.name;
  } else {
    authArea.innerHTML = `
      <button type="button" class="btn btn-ghost" id="open-signin">Войти</button>
      <button type="button" class="btn btn-primary" id="open-signup">Регистрация</button>
    `;
    $("open-signin").addEventListener("click", () => openAuth("signin"));
    $("open-signup").addEventListener("click", () => openAuth("signup"));
    anonNameRow.classList.remove("hidden");
    authNameRow.classList.add("hidden");
  }
}

function openAuth(mode) {
  authMode = mode;
  setAuthMode(mode);
  authForm.reset();
  setStatus(authStatus, "");
  authModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => authEmail.focus(), 50);
}
function closeAuth() {
  authModal.classList.add("hidden");
  document.body.style.overflow = "";
}
function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll(".auth-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.mode === mode);
  });
  if (mode === "signup") {
    authTitle.textContent = "Регистрация";
    signupNameField.classList.remove("hidden");
    authSubmit.textContent = "Создать аккаунт";
    authPassword.setAttribute("autocomplete", "new-password");
  } else {
    authTitle.textContent = "Вход";
    signupNameField.classList.add("hidden");
    authSubmit.textContent = "Войти";
    authPassword.setAttribute("autocomplete", "current-password");
  }
}
document.querySelectorAll(".auth-tab").forEach((t) => {
  t.addEventListener("click", () => setAuthMode(t.dataset.mode));
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value;
  const name = authName.value.trim();

  authSubmit.disabled = true;
  setStatus(authStatus, authMode === "signup" ? "Создаём аккаунт..." : "Входим...");

  try {
    if (authMode === "signup") {
      if (!name) {
        setStatus(authStatus, "Укажите имя.", "error");
        authSubmit.disabled = false;
        return;
      }
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      // Если включено подтверждение email, sign-in нужно делать после подтверждения.
      // На свежем Supabase email confirmation включён по умолчанию — попробуем сразу войти.
      let userId = data.user?.id;
      if (!data.session) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          setStatus(authStatus, "Аккаунт создан. Подтвердите email и войдите снова.", "success");
          authSubmit.disabled = false;
          return;
        }
        userId = signInData.user.id;
      }
      // Создаём профиль
      const { error: profErr } = await supabase.from("profiles").upsert({
        id: userId,
        name: name.slice(0, 60),
      });
      if (profErr) throw profErr;
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    closeAuth();
  } catch (err) {
    console.error(err);
    setStatus(authStatus, friendlyAuthError(err), "error");
  } finally {
    authSubmit.disabled = false;
  }
});

function friendlyAuthError(err) {
  const m = (err.message || "").toLowerCase();
  if (m.includes("invalid login")) return "Неверный email или пароль.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Этот email уже зарегистрирован — войдите.";
  if (m.includes("password should be")) return "Пароль должен быть не короче 6 символов.";
  if (m.includes("rate limit")) return "Слишком много попыток. Подождите минуту.";
  return "Ошибка: " + err.message;
}

// ---------- Profile modal ----------
async function openProfile() {
  if (!currentUser || !currentProfile) return;
  profileNameInput.value = currentProfile.name || "";
  profileEmailInput.value = currentUser.email || "";
  pendingAvatarDataUrl = null;
  pendingAvatarRemoval = false;
  updateProfileAvatar(currentProfile.avatar_url);
  setStatus(profileStatus, "");
  profileModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeProfile() {
  profileModal.classList.add("hidden");
  document.body.style.overflow = "";
}
function updateProfileAvatar(url) {
  if (url) {
    profileAvatar.src = url;
    profileAvatar.style.display = "block";
    removeAvatarBtn.classList.remove("hidden");
  } else {
    profileAvatar.removeAttribute("src");
    profileAvatar.style.display = "block";
    // Show placeholder via background
    profileAvatar.style.background = "#e5e7eb";
    removeAvatarBtn.classList.add("hidden");
  }
}

uploadAvatarBtn.addEventListener("click", () => avatarInput.click());
avatarInput.addEventListener("change", async () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { setStatus(profileStatus, "Только изображения.", "error"); return; }
  if (file.size > 2 * 1024 * 1024) { setStatus(profileStatus, "Размер до 2 МБ.", "error"); return; }
  try {
    const dataUrl = await resizeImage(file, 512, "image/jpeg", 0.9);
    pendingAvatarDataUrl = dataUrl;
    pendingAvatarRemoval = false;
    profileAvatar.src = dataUrl;
    removeAvatarBtn.classList.remove("hidden");
    setStatus(profileStatus, "");
  } catch {
    setStatus(profileStatus, "Не удалось обработать изображение.", "error");
  }
});
removeAvatarBtn.addEventListener("click", () => {
  pendingAvatarDataUrl = null;
  pendingAvatarRemoval = true;
  updateProfileAvatar(null);
});

saveProfileBtn.addEventListener("click", async () => {
  const newName = profileNameInput.value.trim();
  if (!newName) { setStatus(profileStatus, "Имя не может быть пустым.", "error"); return; }
  saveProfileBtn.disabled = true;
  setStatus(profileStatus, "Сохраняем...");

  try {
    let newAvatarUrl = currentProfile.avatar_url || null;

    if (pendingAvatarDataUrl) {
      const blob = await (await fetch(pendingAvatarDataUrl)).blob();
      const path = `${currentUser.id}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      newAvatarUrl = pub.publicUrl;
    } else if (pendingAvatarRemoval) {
      newAvatarUrl = null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({ name: newName.slice(0, 60), avatar_url: newAvatarUrl, updated_at: new Date().toISOString() })
      .eq("id", currentUser.id)
      .select()
      .single();
    if (error) throw error;

    currentProfile = data;
    renderAuthArea();
    loadFeed();
    setStatus(profileStatus, "Сохранено", "success");
    setTimeout(closeProfile, 700);
  } catch (err) {
    console.error(err);
    setStatus(profileStatus, "Ошибка: " + err.message, "error");
  } finally {
    saveProfileBtn.disabled = false;
  }
});

signoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  closeProfile();
});

// ---------- Session bootstrap ----------
async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) console.error(error);
  return data || null;
}

async function handleSession(session) {
  if (session?.user) {
    currentUser = session.user;
    currentProfile = await fetchProfile(currentUser.id);
    if (!currentProfile) {
      // Профиль не найден (например, пользователь создан без шага профиля) — создаём с email-логином как имя
      const fallback = (currentUser.email || "Пользователь").split("@")[0].slice(0, 60);
      const { data } = await supabase.from("profiles").upsert({ id: currentUser.id, name: fallback }).select().single();
      currentProfile = data;
    }
  } else {
    currentUser = null;
    currentProfile = null;
  }
  renderAuthArea();
  loadFeed();
}

if (supaReady) {
  supabase.auth.getSession().then(({ data }) => handleSession(data.session));
  supabase.auth.onAuthStateChange((_event, session) => handleSession(session));
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
  const file = photoInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { setStatus(statusEl, "Только изображения.", "error"); return; }
  try {
    const dataUrl = await resizeImage(file, 1600, "image/jpeg", 0.88);
    showAttachment(dataUrl, "photo");
    setStatus(statusEl, "");
  } catch {
    setStatus(statusEl, "Не удалось обработать изображение.", "error");
  }
});

function resizeImage(file, maxSize, type = "image/jpeg", quality = 0.88) {
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
        resolve(c.toDataURL(type, quality));
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
    setStatus(statusEl, "Напишите что-нибудь или прикрепите изображение.", "error");
    return;
  }
  if (!supaReady) { setStatus(statusEl, "Supabase не подключён.", "error"); return; }

  submitBtn.disabled = true;
  setStatus(statusEl, "Публикуем...");

  try {
    let imageUrl = null;
    if (currentAttachment) {
      const blob = await (await fetch(currentAttachment.dataUrl)).blob();
      const ext = currentAttachment.kind === "drawing" ? "png" : "jpg";
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(filename, blob, { contentType: blob.type || `image/${ext}`, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filename);
      imageUrl = pub.publicUrl;
    }

    let author, userId;
    if (currentUser && currentProfile) {
      author = currentProfile.name;
      userId = currentUser.id;
    } else {
      author = (authorInput.value.trim() || "Аноним").slice(0, 60);
      userId = null;
    }
    const kind = currentAttachment ? currentAttachment.kind : "text";

    const { error } = await supabase
      .from(TABLE)
      .insert({ author, text, image_url: imageUrl, kind, user_id: userId });
    if (error) throw error;

    textInput.value = "";
    clearAttachment();
    setStatus(statusEl, "Опубликовано", "success");
    setTimeout(() => setStatus(statusEl, ""), 2000);
    loadFeed();
  } catch (err) {
    console.error(err);
    setStatus(statusEl, "Ошибка: " + (err.message || err), "error");
  } finally {
    submitBtn.disabled = false;
  }
}
submitBtn.addEventListener("click", publishPost);

// ---------- Paint ----------
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
  prev.width = canvas.width; prev.height = canvas.height;
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

// Global modal close handlers
document.addEventListener("click", (e) => {
  if (e.target.dataset.close !== undefined) {
    const modal = e.target.closest(".modal");
    if (modal) {
      modal.classList.add("hidden");
      document.body.style.overflow = "";
    } else if (e.target === lightbox) {
      lightbox.classList.add("hidden");
    }
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal:not(.hidden)").forEach((m) => m.classList.add("hidden"));
    lightbox.classList.add("hidden");
    document.body.style.overflow = "";
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
renderAuthArea();
loadFeed();
subscribeRealtime();
