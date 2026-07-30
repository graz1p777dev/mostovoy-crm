# Деплой единой CRM

Объединённая CRM состоит из трёх частей:

| Часть | Технология | Где хостится |
|---|---|---|
| **Frontend** (эта репа) | Next.js 16 + Tailwind + shadcn | **Vercel** |
| **Бизнес-модули** (дашборд, финансы, зарплата, сотрудники) | Supabase (Postgres + Auth) | **Supabase Cloud** |
| **AI-бот** (диалоги, настройки, аналитика) | FastAPI + Celery + Redis | **Railway** |

Frontend на Vercel обращается к Supabase напрямую и к бот-бэкенду через прокси `/api/backend`.

## 1. Frontend → Vercel

### Через дашборд Vercel (рекомендуется)
1. Vercel → **Add New → Project** → импортировать репозиторий `graz1p777dev/DemiResultsCRM`
2. Framework: **Next.js** (определится сам)
3. Добавить переменные окружения (см. `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `BOT_BACKEND_API_URL` = `https://api-demiresults.alihan-torebekov.kg`
   - `BOT_BACKEND_ADMIN_API_KEY` (если бэкенд требует ключ)
4. **Deploy**. Каждый `git push` в `main` = авто-деплой.

### Через CLI
```bash
npm i -g vercel
vercel login
vercel link          # привязать к проекту
vercel --prod        # прод-деплой
```

## 2. Supabase (бизнес-модули)

Схема БД лежит в `supabase-schema.sql` и `supabase-migration-v2.sql`.

```bash
# применить схему к своему Supabase-проекту
psql "$SUPABASE_DB_URL" -f supabase-schema.sql
psql "$SUPABASE_DB_URL" -f supabase-migration-v2.sql
```

Или через Supabase Dashboard → SQL Editor.

## 3. AI-бот бэкенд → Railway

Бэкенд бота (FastAPI + Celery + Beat + Redis + Postgres) живёт в отдельном
репозитории `Demireusltsn8nbotcopy` и уже задеплоен на Railway
(`api-demiresults.alihan-torebekov.kg`).

Для нового сервера см. `DEPLOY.md` и `docker-compose.yml` в том репозитории —
там же настроены автоматические бэкапы Postgres.

Единой CRM достаточно указать `BOT_BACKEND_API_URL` на этот бэкенд.

## 4. Деплой на свой VPS (альтернатива Vercel)

Frontend можно поднять и на своём сервере:

```bash
git clone https://github.com/graz1p777dev/DemiResultsCRM.git
cd DemiResultsCRM
cp .env.example .env.local && nano .env.local   # заполнить ключи
npm ci
npm run build
npm run start        # порт 3000
```

Поставить перед ним nginx/caddy для HTTPS и домена.
