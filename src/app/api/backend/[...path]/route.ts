import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

// Proxy to the FastAPI bot backend (amoCRM / OpenAI / Telegram integration).
// Server-side only: the admin API key never reaches the browser.
const BACKEND_API_URL = process.env.BOT_BACKEND_API_URL || "http://localhost:8000";
const BACKEND_ADMIN_API_KEY = process.env.BOT_BACKEND_ADMIN_API_KEY || "";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

// ─── Политика доступа ────────────────────────────────────────────────────────
// Роль проверялась только в nav.ts, то есть решала, рисовать ли пункт меню.
// Сам маршрут пускал любого, кто вошёл в систему, поэтому менеджер с ролью 'mp'
// мог послать PATCH /api/backend/admin/bot-prompt и подменить промпт бота в проде.
//
// Правила ниже — allow-list. Всё, что не совпало ни с одним, доступно только
// owner: новый эндпоинт бота по умолчанию закрыт, а не открыт.

// Бухгалтер работает только с финансами (middleware уводит его на /dashboard/finance)
// и к боту отношения не имеет.
const STAFF: UserRole[] = ["owner", "rop", "mp", "lmai"];
const HEADS: UserRole[] = ["owner", "rop"];

type Rule = { methods: string[]; pattern: RegExp; roles: UserRole[] };

const RULES: Rule[] = [
  // Диалоги: менеджер обязан видеть переписку и отвечать в ней.
  // Сюда же ходит /chat/[leadId] — страница, которую открывают по ссылке из Telegram.
  { methods: ["GET"], pattern: /^admin\/conversations$/, roles: STAFF },
  { methods: ["GET"], pattern: /^admin\/chat\/[^/]+$/, roles: STAFF },
  // Голосовые/фото вложения клиента — тот же экран /chat/[leadId].
  { methods: ["GET"], pattern: /^admin\/attachment\/\d+$/, roles: STAFF },
  { methods: ["PATCH"], pattern: /^admin\/leads\/\d+\/ai$/, roles: STAFF },
  { methods: ["POST"], pattern: /^admin\/leads\/\d+\/messages$/, roles: STAFF },

  // Аналитика и отчёты — руководителю отдела они нужны, менять он ничего не может.
  { methods: ["GET"], pattern: /^admin\/analytics(\/(tokens|funnel|managers))?$/, roles: HEADS },
  { methods: ["GET"], pattern: /^admin\/reports\/daily$/, roles: HEADS },
  { methods: ["GET"], pattern: /^admin\/action-logs$/, roles: HEADS },

  // Чёрный список и стоп-слова: правит и РОП тоже — это ежедневная работа отдела.
  { methods: ["GET", "POST", "DELETE"], pattern: /^admin\/blacklist(\/\d+)?$/, roles: HEADS },
  { methods: ["GET", "PUT"], pattern: /^admin\/stop-words$/, roles: HEADS },

  // ИИ-помощник: открыт всем сотрудникам — RBAC на финансовые/бизнес-данные
  // инструменты проверяет сам бэкенд по X-User-Is-Admin (см. ниже), это
  // правило только решает, кто вообще может достучаться до /copilot/*.
  { methods: ["GET", "POST", "PATCH", "DELETE"], pattern: /^copilot\/.*$/, roles: STAFF },
];

function isAllowed(method: string, path: string, role: UserRole): boolean {
  if (role === "owner") return true;
  return RULES.some(
    (rule) => rule.methods.includes(method) && rule.pattern.test(path) && rule.roles.includes(role)
  );
}

type Identity = { role: UserRole | undefined; name: string };

// null — не вошёл (401). role undefined — вошёл, но сотрудника с такой ролью нет (403).
async function getIdentity(): Promise<Identity | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("employees")
    .select("name, role")
    .eq("user_id", user.id)
    .maybeSingle();

  return { role: (data?.role as UserRole | undefined) ?? undefined, name: data?.name || user.id };
}

function backendUrl(path: string[], search: string) {
  const cleanBase = BACKEND_API_URL.replace(/\/$/, "");
  const cleanPath = path.join("/");
  return `${cleanBase}/${cleanPath}${search}`;
}

async function proxy(request: NextRequest, context: RouteContext) {
  const identity = await getIdentity();
  if (identity === null) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const { role, name } = identity;
  if (role === undefined) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const { path } = await context.params;
  // Пустой сегмент или ".." дал бы обращение мимо /admin — например к /health,
  // а после нормализации fetch'ем и к чему угодно ещё.
  if (path.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return NextResponse.json({ detail: "Bad path" }, { status: 400 });
  }

  const cleanPath = path.join("/");
  if (!isAllowed(request.method, cleanPath, role)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  // Заголовки собираем с нуля, а не копируем из запроса: иначе браузерные cookie
  // с сессией Supabase уезжают в бэкенд бота, а подставленный клиентом
  // X-Admin-API-Key прошёл бы насквозь, если серверный ключ не задан.
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (BACKEND_ADMIN_API_KEY) headers.set("X-Admin-API-Key", BACKEND_ADMIN_API_KEY);
  // Only the Copilot backend reads these — 'owner' maps to its binary
  // is_admin gate (backend/app/core/copilot_auth.py in the bot repo).
  // encodeURIComponent: Headers требует ASCII/Latin1, а имя сотрудника часто
  // кириллица — без кодирования .set() кидает TypeError (ByteString) и весь
  // прокси-запрос падает. Бэкенд декодирует обратно (copilot_auth.py).
  headers.set("X-User-Name", encodeURIComponent(name));
  headers.set("X-User-Is-Admin", role === "owner" ? "true" : "false");

  // arrayBuffer keeps binary bodies (file uploads) intact
  const response = await fetch(backendUrl(path, request.nextUrl.search), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    cache: "no-store",
  });

  const responseType = response.headers.get("content-type") || "application/json";
  return new NextResponse(await response.arrayBuffer(), {
    status: response.status,
    headers: { "content-type": responseType },
  });
}

export async function GET(request: NextRequest, context: RouteContext) { return proxy(request, context); }
export async function POST(request: NextRequest, context: RouteContext) { return proxy(request, context); }
export async function PATCH(request: NextRequest, context: RouteContext) { return proxy(request, context); }
export async function PUT(request: NextRequest, context: RouteContext) { return proxy(request, context); }
export async function DELETE(request: NextRequest, context: RouteContext) { return proxy(request, context); }
