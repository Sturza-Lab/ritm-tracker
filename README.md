# Ритм

Личный offline-first трекер состояния

## Локальный запуск

```bash
cd app
python3 -m http.server 4173
```

Открыть `http://127.0.0.1:4173`

## Проверка

```bash
cd app
npm test
npm run check
```

## Хранение

Записи хранятся в `localStorage` конкретного браузера. Для переноса на другое устройство используется backup JSON
