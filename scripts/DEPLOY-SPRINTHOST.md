# Развёртывание FluxLane на SprintHost (viperxds.ru)

## На сервере уже сделано

- Файлы проекта в `~/domains/viperxds.ru/public_html`
- `.htaccess` для Phusion Passenger (`server.js`)
- `npm14 install`, зависимости установлены
- `.env` с `DB_DIALECT=mysql` (SQLite на shared-хостинге не поднимается из‑за нативного `sqlite3`)

## Обязательный шаг в панели

**Сайты → Веб‑серверы → viperxds.ru → Node.js 14** (не PHP).

Без этого Apache отдаёт **500** на директивах Passenger.

После смены: `touch ~/domains/viperxds.ru/public_html/tmp/restart.txt`

## Локальное обновление

```powershell
.\scripts\create-deploy-zip.ps1
$env:SPRINTHOST_FTP_USER = 'a1327438'
$env:SPRINTHOST_FTP_PASS = '***'
.\scripts\ftp-upload-viperxds.ps1
```

На SSH: `cd ~/domains/viperxds.ru/public_html && npm14 install --omit=dev && touch tmp/restart.txt`

## База данных

На аккаунте используется MySQL (`a1327438_viperxds`). Параметры в `.env` на сервере (не коммитить).

Локально по-прежнему можно работать с `database.sqlite` без `.env`.
