#!/bin/bash

# СРОЧНЫЙ ДЕПЛОЙ Edge Function sync-ozon-performance
# Использование: bash scripts/deploy-edge-function.sh

echo "🚀 Деплой sync-ozon-performance..."

# Проверяем переменные окружения
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "❌ Ошибка: SUPABASE_ACCESS_TOKEN не установлен"
  echo "Получите токен: https://supabase.com/dashboard/account/tokens"
  exit 1
fi

if [ -z "$SUPABASE_PROJECT_REF" ]; then
  echo "❌ Ошибка: SUPABASE_PROJECT_REF не установлен"
  echo "Найдите в Settings проекта"
  exit 1
fi

# Устанавливаем Supabase CLI если не установлен
if ! command -v supabase &> /dev/null; then
    echo "📦 Устанавливаем Supabase CLI..."
    npm install -g supabase
fi

# Деплоим функцию
echo "📤 Деплоим sync-ozon-performance..."
supabase functions deploy sync-ozon-performance \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --no-verify-jwt

echo "✅ Деплой завершен!"
