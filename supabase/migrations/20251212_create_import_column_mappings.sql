-- Таблица для хранения маппинга колонок Excel файлов
-- Позволяет пользователю настроить соответствие между колонками файла и полями БД

create table if not exists import_column_mappings (
  id uuid primary key default gen_random_uuid(),
  marketplace_id uuid not null references marketplaces(id) on delete cascade,
  import_type text not null, -- 'accruals' | 'storage_costs'
  mapping jsonb not null,    -- {"offer_id":"Артикул", "accrual_type":"Тип начисления", "date":"Дата начисления", ...}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketplace_id, import_type)
);

-- Индекс для быстрого поиска
create index if not exists idx_import_column_mappings_marketplace_type 
  on import_column_mappings(marketplace_id, import_type);

-- Комментарии
comment on table import_column_mappings is 'Маппинг колонок Excel файлов для импорта данных';
comment on column import_column_mappings.mapping is 'JSON объект: ключ - поле БД, значение - название колонки в Excel';
comment on column import_column_mappings.import_type is 'Тип импорта: accruals (начисления) или storage_costs (стоимость размещения)';

