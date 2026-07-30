# INFRASTRUCTURE.md — карта реальной инфраструктуры (для ИИ-агентов)

> Обновлено: 2026-07-09, по итогам ручного расследования вживую (не проектная документация — реальное текущее состояние проверенное через Railway/Vercel/Cloudflare/curl). Держать в актуальном виде: этот файл — единственная память, которая переживает переход на новую машину/VPS.
>
> **Перед тем как верить любому другому .md в этом репо (AGENTS.md, CLAUDE.md, PROJECT_STATE.md) по вопросам "где что задеплоено" — проверяй здесь.** Та документация местами устарела (см. раздел 5).

## 1. Топология аккаунтов Railway

Есть **два разных** Railway-аккаунта, легко перепутать:

| Аккаунт | Email | Что там |
|---|---|---|
| Аккаунт A | `gekkokurai@gmail.com` | Проект **DemiResultsCRM** (id `ff0b94d2-fb82-4e97-8b6a-9746bd5fd20e`) — сервис `DemiResultsCRM` (id `51ddd6bc-9649-42e6-833f-20ba6690d2d7`) сейчас содержит **Python-бэкенд бота** (не CRM!), задеплоенный вручную через `railway up` в этой сессии. Плюс новые `Postgres`/`Redis`/`Demireusltsn8nbotcopy` — начатый (не завершённый) перенос бота сюда, см. раздел 3. Также проект `fearless-youthfulness` (сервис `Crm`, репо `graz1p777dev/Crm`, пустой/неиспользуемый).
| Аккаунт B | `graz1p@proton.me` (в CLI отображается как "Alihan") | Проект **scintillating-transformation** (id `8e6d4319-3fac-4f8c-8770-42b971812e44`) — **здесь живёт реальный прод**: сервисы `Demireusltsn8nbotcopy` (Python-бот, домен `api-demiresults.alihan-torebekov.kg`), `CRM` (Next.js CRM, домен `demiresults.alihan-torebekov.kg`), `Postgres`, `Redis`, `CeleryWorker`.

**Переключение между аккаунтами в Railway CLI:**
```bash
railway logout
railway login --browserless   # даёт ссылку, подтвердить в браузере под нужным аккаунтом
```
Либо через переменную (без интерактива, если токен известен):
```bash
export RAILWAY_API_TOKEN=<токен>
```
MCP-сервер Railway и CLI используют **разные** токены/сессии — переключение одного не переключает другое автоматически.

## 2. Прод — что на самом деле где

| Домен | Что это | Хостинг |
|---|---|---|
| `https://demiresults.alihan-torebekov.kg` | **Реальная CRM** (Next.js, вход через Supabase Auth) | Railway, аккаунт B, проект `scintillating-transformation`, сервис `CRM` |
| `https://api-demiresults.alihan-torebekov.kg` | **Реальный бэкенд бота** (FastAPI) | Railway, аккаунт B, сервис `Demireusltsn8nbotcopy` |
| `https://demireusltsn8nbotcopy-production.up.railway.app` | То же самое (дефолтный Railway-домен того же сервиса) | — |
| `https://demiresultscrm-production.up.railway.app` | **НЕ CRM** — это Python-бэкенд, задеплоенный по ошибке в аккаунт A в начале этой сессии (эксперименты с Лабораторией). 404 на `/` — это нормально для FastAPI без корневого роута, не признак падения. | Railway, аккаунт A |
| `https://demi-inventory.vercel.app` / `inventory.demiresults.alihan-torebekov.kg` | Товароучёт (отдельное Next.js-приложение, Multi-Zones) | Vercel |
| `https://demireusltsn8nbotcopy-alihans-projects-a4ff1bb3.vercel.app` | Старый/другой фронтенд (CRM Bot v2, простой, НЕ используется пользователем) | Vercel, проект `demireusltsn8nbotcopy` |

**DNS** зоны `alihan-torebekov.kg` — на Cloudflare (не Vercel-неймсерверы), несмотря на то что `vercel domains inspect` может предлагать сменить нейм-серверы — **не делать этого**, DNS остаётся на Cloudflare, домены на Railway через CNAME.

## 3. Незавершённый перенос бота на аккаунт A (gekkokurai)

По запросу пользователя начат перенос бота с аккаунта B на аккаунт A (причина: консолидация). **Не завершён, прод НЕ переключён** — старый бот на аккаунте B продолжает обслуживать реальный трафик.

Сделано:
- В проекте `DemiResultsCRM` (аккаунт A) подняты `Postgres` (id `473e8693-c8dd-4685-a34f-7317a323f965`) и `Redis` (id `812df818-a1ba-4e04-9d04-8816b39021f9`), данные перенесены через `pg_dump`/`pg_restore` и сверены построчно (1169 leads / 4703 messages / 1170 clients — совпадает 1:1 с источником на момент переноса).
- Создан сервис `Demireusltsn8nbotcopy` (id `790e4e9f-fd61-452a-9e2e-2e43b527c231`), задеплоен код backend, переменные окружения скопированы (кроме `DATABASE_URL`/`REDIS_URL` — те через `${{Postgres.DATABASE_URL}}`/`${{Redis.REDIS_URL}}`, и `BACKEND_API_URL`/`PUBLIC_BACKEND_URL`/`NEXT_PUBLIC_API_BASE_URL` — те выставлены на `api-demiresults.alihan-torebekov.kg`, финальный домен).
- Отдельный `CeleryWorker`-сервис создать не вышло (лимит бесплатного плана на 5 сервисов) — вместо этого выставлен `RUN_WORKER_IN_WEB=true` (воркер поднимается в том же контейнере, это уже поддерживается в `Dockerfile`).

**Осталось для завершения переноса** (если решите продолжать, а не переезжать на VPS — см. раздел 6):
1. Проверить, что новый сервис реально стартует и отвечает на `/health`.
2. Данные с момента переноса устарели — сделать финальный `pg_dump`/`pg_restore` дельту перед переключением, чтобы не потерять свежие диалоги.
3. Переключить домен `api-demiresults.alihan-torebekov.kg` с сервиса на аккаунте B на сервис на аккаунте A (открепить → прикрепить, обновить CNAME в Cloudflare на новый Railway-таргет).
4. Переключить Telegram/amoCRM вебхуки, если URL поменяется.
5. **Учитывая, что пользователь решил ставить VPS (раздел 6) — вероятно, этот перенос не нужен, бот переедет сразу на VPS.** Уточнить перед продолжением.

## 4. Инциденты этой сессии (уже исправлены)

| Что | Симптом | Причина | Статус |
|---|---|---|---|
| Дыра в авторизации | `demiresults.alihan-torebekov.kg/dashboard/*` открывался без логина | На проде (Railway, сервис `CRM`, аккаунт B) была включена `AUTH_BYPASS=1` | ✅ Исправлено — выставлено `AUTH_BYPASS=0`, передеплоено. Проверено: `/dashboard/employees` без сессии → 307 на `/auth/login`. |
| CRM не видела бота | Диалоги/Лаборатория/Настройки бота не грузили данные (500 на прокси) | DNS-запись `api-demiresults.alihan-torebekov.kg` (CNAME) пропала из Cloudflare, хотя Railway считал домен верифицированным | ✅ Исправлено — запись восстановлена: `CNAME api-demiresults → j6jsn8fh.up.railway.app`, DNS only (без Cloudflare proxy). |
| Ложная тревога "прод лежит" | Параллельная сессия увидела 404 на `demiresultscrm-production.up.railway.app` и решила откатывать коммит `676118d` | Это не CRM, а мой же тестовый Python-бэкенд в аккаунте A (см. раздел 2, третья строка). 404 на `/` для FastAPI — норма. | Откат не потребовался, ничего не делали. |
| **Утечка приватного ключа** | `GOOGLE_SERVICE_ACCOUNT_JSON` (private_key) дважды случайно попал в вывод терминала при неаккуратной фильтрации многострочного env-var (`cut -d= -f1` не режет строки без `=`) | Человеческая (агентская) ошибка при чтении env-переменных бота | ⚠️ **Нужно перевыпустить ключ** `demi-results-ai-bot@demi-restuts-ai-bot.iam.gserviceaccount.com` в Google Cloud Console — если ещё не сделано. |

## 5. Расхождения с существующей документацией (AGENTS.md / CLAUDE.md / PROJECT_STATE.md)

- **AGENTS.md** пишет "Frontend → Vercel" — неверно, реально CRM на **Railway** (аккаунт B, см. раздел 2).
- **AGENTS.md**, раздел "Статус переноса модулей бота" помечает Диалоги/Аналитику/Отчёты/Настройки как невыполненные (`[ ]`) — по факту все страницы (`dialogs`, `bot-analytics`, `bot-reports`, `bot-settings`) существуют и задеплоены, плюс добавлена `laboratory` (которой в AGENTS.md вообще нет). Список нужно обновить.
- **CLAUDE.md** и **PROJECT_STATE.md** указывают Supabase project ref `rjzmxgiqleftwcsxgfte` — но реально задеплоенный на Railway сервис `CRM` использует env `NEXT_PUBLIC_SUPABASE_URL=https://hxjkswdmirfxnvdjmgjw.supabase.co` — **другой проект**. Не разобрался, какой из них актуальный источник правды (возможно, `rjzmxgiqleftwcsxgfte` — старый/локальный, `hxjkswdmirfxnvdjmgjw` — тот, что реально в проде; или наоборот, у прода тестовый). **Проверить в Supabase Dashboard перед следующими изменениями схемы.**
- **PROJECT_STATE.md** (снимок от 2026-07-02) указывает 1 пользователя (`bacer.espire@gmail.com`). По факту как минимум ещё один owner `gekkokurai@gmail.com` тоже активен — снимок устарел.
- На проде (сервис `CRM`, аккаунт B) **нет переменной `SUPABASE_SERVICE_ROLE_KEY`** — значит `createAuthUser`/`deleteAuthUser`/админские операции с пользователями (см. `src/actions/auth.ts`) сейчас не могут работать в проде. Нужно взять ключ в Supabase Dashboard → Settings → API → `service_role` и добавить в Railway variables сервиса `CRM`.

## 6. Планы пользователя на 2026-07-09 (со слов)

Пользователь сказал, что настраивает **свой VPS** и, вероятно, откажется от текущей Railway/Vercel-мешанины в пользу самостоятельного хостинга. Для этого уже готовы (см. репо `Demi Results n8n copy project`, НЕ этот):
- `docker-compose.yml` — весь стек бота одной командой (Postgres, Redis, backend, worker, beat, frontend, автобэкапы с ротацией).
- `setup.sh` — полный provision чистого Ubuntu-сервера (Docker, nginx, SSL/certbot, UFW, cron-бэкапы, Telegram webhook).
- `DEPLOY.md`, `deploy/backup_now.sh`, `deploy/restore.sh`.

Всё это проверено (`bash -n` синтаксис чист) но **не прогонялось на реальном VPS**. При первом реальном деплое — внимательно смотреть логи каждого шага, не доверять слепо.

**Важно:** непонятно, переезжает ли на VPS только бот, или бот + CRM (эта репа). CRM завязана на Supabase (управляемая БД, не Postgres в docker-compose) — если CRM тоже переезжает, `docker-compose.yml`/`setup.sh` для неё не подходят, нужен отдельный план (Next.js standalone build + PM2/systemd + nginx, Supabase остаётся облачным). Уточнить у пользователя, если неясно из контекста на момент чтения.
