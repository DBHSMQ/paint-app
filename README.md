# 💬 Лента — общая стена с постами

Минималистичный сайт-лента, куда любой посетитель может оставить:
- 📝 Текстовое сообщение
- 🎨 Рисунок (встроенный Paint — кнопка «Нарисовать»)
- 📷 Загруженное фото

Все посты сохраняются в PostgreSQL (Supabase) и появляются у всех в реальном времени.

**🌐 Сайт:** [dbhsmq.github.io/paint-app](https://dbhsmq.github.io/paint-app/)

---

## Технологии

- **Frontend:** чистый HTML + CSS + JavaScript, без сборки
- **База данных:** PostgreSQL на Supabase (Free-план)
- **Хранилище картинок:** Supabase Storage
- **Realtime:** Supabase Realtime — новые посты появляются у всех мгновенно
- **Хостинг:** GitHub Pages

## Структура

```
├── index.html           # разметка ленты и модального окна Paint
├── styles.css           # стили
├── app.js               # логика ленты + Paint + Supabase
└── supabase-config.js   # публичный URL и anon-ключ Supabase
```

## Схема базы данных

Таблица `posts`:
- `id` (uuid) — первичный ключ
- `author` (text, 1–60 символов)
- `text` (text, до 1000 символов)
- `image_url` (text, nullable)
- `kind` (text: `text` / `drawing` / `photo`)
- `created_at` (timestamptz)

Защита через Row Level Security:
- Чтение постов — всем
- Создание постов — всем, с валидацией длины
- Изменение/удаление — запрещено через клиент

Bucket `post-images` (публичный, до 5 МБ, только изображения).

## Локальный запуск

```bash
python3 -m http.server 8000
```

Открой `http://localhost:8000`. Через `file://` не заработает — Supabase-модули требуют HTTP(S).

## Возможности Paint

Встроенный редактор по кнопке «Нарисовать»:
- Кисть и ластик
- 12 цветов + произвольный
- Толщина 1–60 px
- Очистка холста
- Прикрепление рисунка к посту
- Сенсорные экраны
