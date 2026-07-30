// Перевод строк action_logs бота на человеческий язык — для терминала в AI-лаборатории.
// Чистые функции без React: то, что бот записал кодом, здесь становится фразой.

import type { BotActionLog } from '@/types'

const FIELD_RU: Record<string, string> = {
  name: 'имя',
  age: 'возраст',
  city: 'город',
  goal: 'цель',
  contacts: 'контакты',
  allergies: 'аллергии',
  skin_type: 'тип кожи',
  skin_problem: 'проблема кожи',
  uses_care: 'текущий уход',
  experience: 'опыт',
  what_helped: 'что помогало',
  what_not_helped: 'что не помогало',
  problem_duration: 'давность проблемы',
  bought_before: 'покупал раньше',
  products_used: 'используемые средства',
  last_action: 'последнее действие',
  consultation_date: 'дата консультации',
  consultation_time: 'время консультации',
  consultation_format: 'формат консультации',
  consultation_confirmed: 'подтверждение записи',
}

// Почему бот подвинул лид. Коды приходят из pipeline.py, список закрытый.
const REASON_RU: Record<string, string> = {
  lead_qualified: 'лид квалифицирован',
  sales_message: 'сообщение про продажу',
  non_sales_message: 'сообщение не про продажу',
  purchase_intent: 'клиент хочет купить',
  consultation_confirmed: 'запись на консультацию подтверждена',
  approval_accepted: 'менеджер принял ответ',
  approval_rejected: 'менеджер отклонил ответ',
  approval_edited: 'менеджер переписал ответ',
  approval_ai_edited: 'менеджер переписал ответ через ИИ',
  approval_saved_unsorted: 'ответ отложен в /no-sorted',
  'no fields': 'нечего записывать',
}

function reasonRu(value: unknown): string {
  const key = String(value ?? '').trim()
  if (!key) return ''
  // non_sales_routed кладёт сюда свободный текст модели — его переводить нечего.
  return REASON_RU[key] ?? key
}

export function fieldsRu(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '—'
  return value.map((f) => FIELD_RU[String(f)] ?? String(f)).join(', ')
}

/** Русское склонение по числу: 1 поле, 2 поля, 5 полей. */
export function plural(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  const mod10 = n % 10
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}

function quote(value: unknown): string {
  const text = String(value ?? '').trim()
  return text ? `«${text}»` : ''
}

export function describe(log: BotActionLog): string {
  const d = log.detail ?? {}
  const failed = log.status === 'error'
  // dry_run — тестовый лид: бот прошёл весь путь, но наружу не пошёл.
  // Писать «Ответил клиенту» здесь было бы враньём.
  const dry = log.status === 'dry_run'

  switch (log.action) {
    case 'amocrm.move_lead_status': {
      // Сам status_id менеджеру ничего не говорит — он есть в раскрытом payload.
      const why = reasonRu(d.reason)
      const tail = why ? ` — ${why}` : ''
      if (failed) return 'Не смог перенести лид на другой этап'
      if (dry) return `🧪 Перенёс лид на другой этап, в amoCRM не отправлял${tail}`
      return `Перенёс лид на другой этап${tail}`
    }

    case 'amocrm.patch_lead': {
      if (failed) return 'Не смог записать карточку'
      if (log.status === 'success' || dry) {
        const n = Number(d.count ?? 0)
        const fields = `${n} ${plural(n, ['поле', 'поля', 'полей'])}: ${fieldsRu(d.fields)}`
        return dry ? `🧪 Заполнил бы в карточке ${fields}` : `Заполнил в карточке ${fields}`
      }
      return `Карточку не трогал — ${reasonRu(d.reason) || 'нечего записывать'}`
    }

    case 'amocrm.send_message':
      if (failed) return 'Не смог отправить ответ клиенту'
      if (dry) return `🧪 Ответ готов, в amoCRM не отправлен: ${quote(d.text)}`
      return `Ответил клиенту: ${quote(d.text)}`

    case 'amocrm.get_lead_stage':
      return 'Не смог узнать этап лида'

    case 'openai.sales_intent': {
      if (failed) return 'Не смог понять намерение клиента'
      const parts: string[] = [d.is_sales ? 'запрос по продажам' : 'не про продажу']
      if (d.is_purchase) parts.push('хочет купить')
      if (d.is_complex) parts.push('сложный случай')
      return `Разобрал сообщение: ${parts.join(', ')}${d.reason ? ` — ${d.reason}` : ''}`
    }

    case 'openai.sales_agent': {
      if (failed) return 'Не смог сочинить ответ'
      const n = Number(d.dialogue_messages ?? 0)
      return `Сочинил ответ по ${n} ${plural(n, ['сообщению', 'сообщениям', 'сообщениям'])} диалога`
    }

    case 'openai.extract_fields': {
      if (failed) return 'Не смог извлечь данные из диалога'
      const n = Number(d.count ?? 0)
      if (n === 0) return 'Ничего нового из диалога не извлёк'
      return `Извлёк из диалога ${n} ${plural(n, ['поле', 'поля', 'полей'])}: ${fieldsRu(d.fields)}`
    }

    case 'telegram.approval_request':
      return failed ? 'Не смог отправить карточку менеджеру' : 'Отправил карточку менеджеру на согласование'
    case 'telegram.approval_rejected':
      return 'Менеджер отклонил ответ'
    case 'telegram.approval_edited':
      return 'Менеджер переписал ответ вручную'
    case 'telegram.approval_ai_edited':
      return 'Менеджер переписал ответ через ИИ-редактор'
    case 'telegram.approval_saved':
      return 'Менеджер отложил ответ в /no-sorted'
    case 'telegram.purchase_card':
      return 'Не смог отправить карточку «хочет купить»'
    case 'telegram.stop_word_card':
      return 'Не смог отправить карточку по стоп-слову'

    case 'pipeline.purchase_intent':
      return `Клиент хочет купить: ${quote(d.message)}`
    case 'pipeline.non_sales_routed':
      return `Пропустил — не про продажу${d.reason ? ` (${d.reason})` : ''}`
    case 'pipeline.skip_scheduled_consultation':
      return `Пропустил — уже записан на консультацию${d.reason ? ` (${d.reason})` : ''}`
    case 'pipeline.blacklisted':
      return 'Пропустил — клиент в чёрном списке'

    case 'google_sheets.update_consultation':
      if (failed) return 'Не смог обновить таблицу консультаций'
      return dry ? '🧪 Обновил бы таблицу консультаций' : 'Обновил таблицу консультаций'

    case 'training.example_saved':
      return d.was_edited ? 'Сохранил правку менеджера в обучающие примеры' : 'Сохранил ответ в обучающие примеры'

    default:
      // Новое действие бота не должно ломать ленту — показываем сырое имя.
      return log.action
  }
}

const STATUS_COLOR: Record<string, string> = {
  success: '#34d399',
  error: '#f87171',
  skipped: '#a19698',
  received: '#f2564f',
  // Тестовый лид: бот показал, что сделал бы, но наружу не пошёл.
  dry_run: '#fbbf24',
}

export function statusColor(status: string): string {
  return STATUS_COLOR[status] ?? '#7d7174'
}

export function timeOf(iso: string | null): string {
  if (!iso) return '--:--:--'
  return new Date(iso).toLocaleTimeString('ru-RU', { hour12: false })
}
