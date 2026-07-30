// Заводит владельца CRM: пользователь Supabase Auth + запись employees.
// Работает против любого Supabase — локального или боевого.
// Пароль и ключи берутся из окружения, в коде их нет.
const URL = process.env.SEED_SUPABASE_URL
const SERVICE_KEY = process.env.SEED_SERVICE_ROLE_KEY
const EMAIL = process.env.SEED_EMAIL
const PASSWORD = process.env.SEED_PASSWORD
const NAME = process.env.SEED_NAME || 'Владелец'

if (!URL || !SERVICE_KEY || !EMAIL || !PASSWORD) {
  console.error('нужны SEED_SUPABASE_URL, SEED_SERVICE_ROLE_KEY, SEED_EMAIL, SEED_PASSWORD')
  process.exit(1)
}

const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

// 1. Ищем, нет ли уже такого пользователя — скрипт идемпотентный.
const list = await fetch(`${URL}/auth/v1/admin/users?per_page=1000`, { headers: h }).then(r => r.json())
const existing = (list.users || []).find(u => u.email === EMAIL)

let userId
if (existing) {
  userId = existing.id
  // Обновляем пароль и подтверждаем почту.
  const r = await fetch(`${URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT', headers: h,
    body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
  })
  if (!r.ok) { console.error('не удалось обновить:', await r.text()); process.exit(1) }
  console.log('пользователь уже был, пароль обновлён:', userId)
} else {
  const r = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  })
  const d = await r.json()
  if (!r.ok) { console.error('не удалось создать:', d); process.exit(1) }
  userId = d.id
  console.log('пользователь создан:', userId)
}

// 2. Запись сотрудника с ролью владельца, без принудительной смены пароля.
const rest = { ...h, Prefer: 'resolution=merge-duplicates,return=representation' }
const r2 = await fetch(`${URL}/rest/v1/employees?on_conflict=email`, {
  method: 'POST', headers: rest,
  body: JSON.stringify([{
    user_id: userId, name: NAME, email: EMAIL,
    role: 'owner', status: 'active', must_change_password: false,
    hire_date: new Date().toISOString().slice(0, 10),
  }]),
})
const d2 = await r2.json()
if (!r2.ok) { console.error('не удалось завести сотрудника:', d2); process.exit(1) }
console.log('сотрудник:', d2[0]?.id, d2[0]?.role, '· смена пароля не требуется')
