# 💬 Лента — общая стена с постами

Минималистичный сайт-лента, куда любой посетитель может оставить:
- 📝 Текстовое сообщение
- 🎨 Рисунок (встроенный Paint — кнопка «Нарисовать»)
- 📷 Загруженное фото

Все посты сохраняются в общей базе Firebase и появляются у всех в реальном времени.

**Демо:** [dbhsmq.github.io/paint-app](https://dbhsmq.github.io/paint-app/)

---

## Подключение Firebase

Без подключения Firebase лента работать не будет — это нужно сделать один раз (около 5 минут).

### Шаг 1. Создайте проект Firebase

1. Зайдите на [console.firebase.google.com](https://console.firebase.google.com/) — нужен Google-аккаунт.
2. Нажмите **Add project** → введите название (например, `paint-feed`) → продолжите без Google Analytics.
3. Когда проект создан, на главной странице нажмите иконку `</>` («Web»), чтобы добавить веб-приложение.
4. Введите любое название → **Register app**. Скопируйте объект `firebaseConfig` — он понадобится дальше.

### Шаг 2. Включите Firestore (база данных постов)

1. В левом меню → **Build → Firestore Database** → **Create database**.
2. Выберите **Start in production mode** → регион (любой, например `eur3`) → **Enable**.
3. Перейдите на вкладку **Rules** и вставьте:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /posts/{postId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasAll(['author','text','kind','createdAt'])
                    && request.resource.data.text.size() < 1000
                    && request.resource.data.author.size() < 60;
      allow update, delete: if false;
    }
  }
}
```

Нажмите **Publish**.

### Шаг 3. Включите Storage (для рисунков и фото)

1. В левом меню → **Build → Storage** → **Get started**.
2. Оставьте **Start in production mode** → тот же регион → **Done**.
3. Вкладка **Rules** → вставьте:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /posts/{file} {
      allow read: if true;
      allow write: if request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

Нажмите **Publish**.

### Шаг 4. Разрешите домен GitHub Pages

1. В Firebase → **Project settings** (шестерёнка вверху слева) → вкладка **General**.
2. Прокрутите вниз до **Your apps** — там уже есть ваше веб-приложение, конфиг готов.
3. Никаких CORS-настроек обычно не требуется — Firestore и Storage работают с GitHub Pages из коробки.

### Шаг 5. Вставьте конфиг в сайт

Откройте файл [`firebase-config.js`](firebase-config.js) и замените значения на ваши:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "paint-feed.firebaseapp.com",
  projectId: "paint-feed",
  storageBucket: "paint-feed.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc..."
};
```

Закоммитьте и запушьте — через минуту GitHub Pages обновится, и лента заработает.

> ⚠️ Эти ключи — не секрет. По умолчанию Firebase разрешает их публикацию на клиенте. Безопасность обеспечивается правилами Firestore/Storage (см. шаги 2–3).

---

## Возможности Paint

Встроенный редактор открывается по кнопке «Нарисовать»:

- Кисть и ластик
- 12 цветов в палитре + произвольный цвет
- Толщина линии 1–60 px
- Очистка холста
- Прикрепление рисунка к посту одной кнопкой
- Работа на сенсорных экранах

---

## Структура

```
├── index.html         # разметка ленты и модального окна Paint
├── styles.css         # стили
├── app.js             # логика ленты + Paint + Firebase
└── firebase-config.js # сюда вставить свой конфиг Firebase
```

## Локальный запуск

```bash
# любой статический сервер, например:
python3 -m http.server 8000
```

Откройте `http://localhost:8000` в браузере. Firebase-модули загружаются через `https://`, поэтому через `file://` лента не заработает — нужен HTTP-сервер.
