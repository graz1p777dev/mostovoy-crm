// ─── KPI Role Configuration ───────────────────────────────────────────────────
// Конфигурация KPI по ролям. Добавление новой роли — только здесь.
// Нет if-else по проекту. UI читает конфиг и строит форму автоматически.

export type KpiFieldType = 'integer' | 'decimal' | 'money'

// Ключи должны совпадать с полями таблицы employee_kpi
export type KpiFieldKey =
  | 'plan_fv'
  | 'plan_sales'
  | 'plan_revenue'
  | 'plan_appeals'
  | 'plan_leads'
  | 'plan_nv'
  | 'plan_work_days'

export interface KpiFieldConfig {
  key:         KpiFieldKey
  label:       string
  description: string
  placeholder: string
  type:        KpiFieldType
  weight?:     number   // вес в расчёте KPI%
}

export interface RoleKpiConfig {
  role:        string
  label:       string
  description: string
  fields:      KpiFieldConfig[]
}

// ─── Конфигурации по ролям ────────────────────────────────────────────────────

export const KPI_ROLE_CONFIGS: RoleKpiConfig[] = [
  {
    role:        'mp',
    label:       'Менеджер продаж',
    description: 'KPI по первичным визитам, продажам и выручке',
    fields: [
      {
        key:         'plan_fv',
        label:       'KPI ФВ (первичные визиты)',
        description: 'Плановое количество первичных визитов за месяц',
        placeholder: '20',
        type:        'integer',
        weight:      40,
      },
      {
        key:         'plan_sales',
        label:       'KPI Продажи',
        description: 'Плановое количество продаж (конверсия ФВ → продажа)',
        placeholder: '8',
        type:        'integer',
        weight:      35,
      },
      {
        key:         'plan_revenue',
        label:       'KPI Общий план продаж (₸)',
        description: 'Плановая выручка за месяц',
        placeholder: '500 000',
        type:        'money',
        weight:      25,
      },
      {
        key:         'plan_nv',
        label:       'KPI CRM (нормо-визиты)',
        description: 'Плановое количество нормо-визитов (работа в CRM)',
        placeholder: '60',
        type:        'integer',
      },
      {
        key:         'plan_work_days',
        label:       'Рабочих дней',
        description: 'Плановое количество рабочих дней',
        placeholder: '22',
        type:        'integer',
      },
    ],
  },

  {
    role:        'lmai',
    label:       'Лид-менеджер',
    description: 'KPI по обращениям, лидам и конверсии в ФВ',
    fields: [
      {
        key:         'plan_appeals',
        label:       'Новые обращения',
        description: 'Плановое количество новых обращений за месяц',
        placeholder: '80',
        type:        'integer',
        weight:      40,
      },
      {
        key:         'plan_leads',
        label:       'Квалифицированные лиды',
        description: 'Плановое количество квалифицированных лидов',
        placeholder: '50',
        type:        'integer',
        weight:      30,
      },
      {
        key:         'plan_fv',
        label:       'ФВ (первичные визиты)',
        description: 'Плановое количество записей на первичный визит',
        placeholder: '25',
        type:        'integer',
        weight:      30,
      },
      {
        key:         'plan_nv',
        label:       'KPI CRM (нормо-визиты)',
        description: 'Плановое количество обработанных обращений в CRM',
        placeholder: '80',
        type:        'integer',
      },
      {
        key:         'plan_sales',
        label:       'KPI Общий план продаж (кол-во)',
        description: 'Командный план продаж — контроль результата',
        placeholder: '8',
        type:        'integer',
      },
      {
        key:         'plan_work_days',
        label:       'Рабочих дней',
        description: 'Плановое количество рабочих дней',
        placeholder: '22',
        type:        'integer',
      },
    ],
  },

  {
    role:        'rop',
    label:       'Руководитель отдела продаж (РОП)',
    description: 'KPI по командным показателям и управлению отделом',
    fields: [
      {
        key:         'plan_fv',
        label:       'Командный план ФВ',
        description: 'Суммарный план первичных визитов для всей команды',
        placeholder: '80',
        type:        'integer',
        weight:      25,
      },
      {
        key:         'plan_sales',
        label:       'Командный план продаж',
        description: 'Суммарный план продаж для всей команды',
        placeholder: '25',
        type:        'integer',
        weight:      30,
      },
      {
        key:         'plan_revenue',
        label:       'Командный план выручки (₸)',
        description: 'Суммарная плановая выручка команды за месяц',
        placeholder: '2 000 000',
        type:        'money',
        weight:      30,
      },
      {
        key:         'plan_nv',
        label:       'Личный план продаж',
        description: 'Личный план продаж РОПа',
        placeholder: '5',
        type:        'integer',
        weight:      15,
      },
      {
        key:         'plan_appeals',
        label:       'Контроль качества (баллы)',
        description: 'Плановый балл по контролю качества работы команды',
        placeholder: '90',
        type:        'integer',
      },
      {
        key:         'plan_work_days',
        label:       'Рабочих дней',
        description: 'Плановое количество рабочих дней',
        placeholder: '22',
        type:        'integer',
      },
    ],
  },

  {
    role:        'accountant',
    label:       'Бухгалтер',
    description: 'Учёт рабочего времени и задач',
    fields: [
      {
        key:         'plan_work_days',
        label:       'Рабочих дней',
        description: 'Плановое количество рабочих дней',
        placeholder: '22',
        type:        'integer',
      },
    ],
  },

  // ── Пример добавления новой роли (врач, маркетолог и т.д.): ──────────────
  // {
  //   role:        'doctor',
  //   label:       'Врач',
  //   description: 'KPI по нормо-визитам и выручке',
  //   fields: [
  //     { key: 'plan_nv',      label: 'Нормо-визиты',      ... },
  //     { key: 'plan_revenue', label: 'Личная выручка (₸)', ... },
  //     { key: 'plan_fv',      label: 'Первичные визиты',   ... },
  //   ],
  // },
]

// ─── Хелперы ──────────────────────────────────────────────────────────────────

const CONFIG_MAP = new Map(KPI_ROLE_CONFIGS.map(c => [c.role, c]))

export function getKpiConfig(role: string): RoleKpiConfig | undefined {
  return CONFIG_MAP.get(role)
}

export function hasKpi(role: string): boolean {
  return role !== 'owner' && CONFIG_MAP.has(role)
}
