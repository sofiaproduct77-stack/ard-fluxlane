# Синхронизация папок ARD

## Эталон (оригинал из Telegram)
`C:\Users\dtro2\Downloads\Telegram Desktop\ARD\ARD`

Содержит полный проект FluxLane v2.0.0, **database.sqlite (~5.2 МБ)** с данными, `node_modules`, Docker, презентацию и Excel-выборки.

## Рабочая копия (Cursor / README)
`C:\Users\dtro2\Desktop\ARD`

Синхронизирована с эталоном (robocopy). **Запуск:** Docker `docker compose up` или `npm start` из этой папки.

## Конфликт с восстановлением Cursor (ночь 04.11.2026)
Ранее была собрана урезанная версия из транскрипта чата. Её файлы **не должны** смешиваться с эталоном:
- `backend/bootstrap/seed.js` — только из восстановления, **не используется** `server.js` эталона (можно удалить)
- `scripts/init-db.js`, `scripts/clear-traffic.js` — дубликаты; в эталоне: `init-database.js`, `clear-traffic-data.js`

**Правило:** правки вносите в Desktop\ARD, периодически копируйте обратно в Telegram-папку как бэкап.

## Два сервера одновременно
Не запускайте **Docker на :3000** и **`node server.js` на :3000** вместе — один порт.
