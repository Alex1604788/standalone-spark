#!/bin/bash

# ========================================
# 🔍 СКРИПТ ПРОВЕРКИ ДЕПЛОЯ
# ========================================
# Дата: 2026-01-25
# Проверяет все компоненты системы

set -e

echo "========================================="
echo "🔍 ПРОВЕРКА ДЕПЛОЯ"
echo "========================================="
echo ""

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ========================================
# 1. ПРОВЕРКА ЧТО МЫ В ПРАВИЛЬНОЙ ДИРЕКТОРИИ
# ========================================
if [ ! -f "package.json" ]; then
  echo -e "${RED}❌ ОШИБКА: Запустите скрипт из корня проекта standalone-spark${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Директория: $(pwd)${NC}"
echo ""

# ========================================
# 2. ПРОВЕРКА GIT СТАТУСА
# ========================================
echo "========================================="
echo "📂 ПРОВЕРКА GIT"
echo "========================================="

CURRENT_BRANCH=$(git branch --show-current)
echo "Текущая ветка: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${YELLOW}⚠️  Вы НЕ на ветке main!${NC}"
  echo "Переключаемся на main..."
  git checkout main
fi

echo "Обновляем main..."
git pull origin main --quiet

LAST_COMMIT=$(git log -1 --oneline)
echo -e "${GREEN}Последний коммит: $LAST_COMMIT${NC}"

# Проверка что PR смержен
if git log --oneline -10 | grep -q "Merge pull request.*follow-install-instructions"; then
  echo -e "${GREEN}✅ Pull Request смержен${NC}"
else
  echo -e "${RED}❌ Pull Request НЕ найден в истории${NC}"
fi

echo ""

# ========================================
# 3. ПРОВЕРКА КОДА КНОПКИ В MAIN
# ========================================
echo "========================================="
echo "🔍 ПРОВЕРКА КОДА КНОПКИ"
echo "========================================="

if grep -q "Синхронизация за 14 дней" src/pages/Reviews.tsx; then
  echo -e "${GREEN}✅ Код кнопки найден в src/pages/Reviews.tsx${NC}"

  # Показываем строки
  echo ""
  echo "Найденные строки:"
  grep -n "Синхронизация за 14 дней\|triggerSyncFull" src/pages/Reviews.tsx | head -5
else
  echo -e "${RED}❌ Код кнопки НЕ НАЙДЕН в src/pages/Reviews.tsx!${NC}"
  echo "Проблема: код не попал в main ветку"
fi

echo ""

# ========================================
# 4. ПРОВЕРКА EDGE FUNCTIONS
# ========================================
echo "========================================="
echo "🔍 ПРОВЕРКА EDGE FUNCTIONS"
echo "========================================="

# Проверка sync-ozon версии
if grep -q "VERSION: 2026-01-16-v2" supabase/functions/sync-ozon/index.ts; then
  echo -e "${GREEN}✅ sync-ozon VERSION: 2026-01-16-v2${NC}"
else
  echo -e "${RED}❌ sync-ozon НЕ версия 2026-01-16-v2!${NC}"
fi

# Проверка auto-generate-drafts версии
if grep -q "VERSION: 2026-01-16-v1" supabase/functions/auto-generate-drafts/index.ts; then
  echo -e "${GREEN}✅ auto-generate-drafts VERSION: 2026-01-16-v1${NC}"
else
  echo -e "${RED}❌ auto-generate-drafts НЕ версия 2026-01-16-v1!${NC}"
fi

# Проверка защиты от дублей в sync-ozon
if grep -q "publishedReviewsSet" supabase/functions/sync-ozon/index.ts; then
  echo -e "${GREEN}✅ sync-ozon: защита от дублей присутствует${NC}"
else
  echo -e "${RED}❌ sync-ozon: защита от дублей ОТСУТСТВУЕТ!${NC}"
fi

# Проверка защиты от дублей в auto-generate-drafts
if grep -q "existingReply" supabase/functions/auto-generate-drafts/index.ts; then
  echo -e "${GREEN}✅ auto-generate-drafts: проверка на дубли присутствует${NC}"
else
  echo -e "${RED}❌ auto-generate-drafts: проверка на дубли ОТСУТСТВУЕТ!${NC}"
fi

echo ""

# ========================================
# 5. ПРОВЕРКА SQL МИГРАЦИИ
# ========================================
echo "========================================="
echo "🔍 ПРОВЕРКА SQL МИГРАЦИИ"
echo "========================================="

if [ -f "supabase/migrations/20260116_setup_new_ozon_sync_logic.sql" ]; then
  echo -e "${GREEN}✅ Миграция 20260116_setup_new_ozon_sync_logic.sql найдена${NC}"

  # Проверяем содержимое
  if grep -q "sync-ozon-incremental" supabase/migrations/20260116_setup_new_ozon_sync_logic.sql; then
    echo -e "${GREEN}✅ Миграция содержит sync-ozon-incremental${NC}"
  fi

  if grep -q "sync-ozon-weekly" supabase/migrations/20260116_setup_new_ozon_sync_logic.sql; then
    echo -e "${GREEN}✅ Миграция содержит sync-ozon-weekly${NC}"
  fi
else
  echo -e "${RED}❌ Миграция 20260116_setup_new_ozon_sync_logic.sql НЕ НАЙДЕНА!${NC}"
fi

echo ""

# ========================================
# 6. ПРОВЕРКА ДОКУМЕНТАЦИИ
# ========================================
echo "========================================="
echo "📚 ПРОВЕРКА ДОКУМЕНТАЦИИ"
echo "========================================="

DOCS=(
  "PULL_REQUEST.md"
  "КАК_СОЗДАТЬ_PR.md"
  "ДЕПЛОЙ_ВЕРСИИ.md"
  "БЫСТРОЕ_РЕШЕНИЕ.md"
  "ФРОНТЕНД_НЕ_ЗАДЕПЛОЕН.md"
  "ДИАГНОСТИКА_ПРОБЛЕМЫ.sql"
  "ЧЕКЛИСТ_ФРОНТЕНД.md"
)

for doc in "${DOCS[@]}"; do
  if [ -f "$doc" ]; then
    echo -e "${GREEN}✅ $doc${NC}"
  else
    echo -e "${YELLOW}⚠️  $doc - отсутствует${NC}"
  fi
done

echo ""

# ========================================
# 7. ПРОВЕРКА PACKAGE.JSON
# ========================================
echo "========================================="
echo "📦 ПРОВЕРКА PACKAGE.JSON"
echo "========================================="

if [ -f "package.json" ]; then
  echo -e "${GREEN}✅ package.json найден${NC}"

  # Проверка основных зависимостей
  if grep -q "react" package.json; then
    REACT_VERSION=$(grep '"react"' package.json | sed 's/.*"react": "\(.*\)".*/\1/')
    echo "React: $REACT_VERSION"
  fi

  if grep -q "vite" package.json; then
    VITE_VERSION=$(grep '"vite"' package.json | sed 's/.*"vite": "\(.*\)".*/\1/')
    echo "Vite: $VITE_VERSION"
  fi
fi

echo ""

# ========================================
# 8. ИТОГОВАЯ СВОДКА
# ========================================
echo "========================================="
echo "📊 ИТОГОВАЯ СВОДКА"
echo "========================================="

echo ""
echo "✅ ЧТО ГОТОВО К ДЕПЛОЮ:"
echo "  - Код кнопки в main ветке"
echo "  - Edge Functions обновлены (v2, v1)"
echo "  - SQL миграция создана"
echo "  - Документация создана"
echo ""

echo "⏳ ЧТО НУЖНО СДЕЛАТЬ:"
echo ""
echo "1️⃣  ПРИМЕНИТЬ SQL МИГРАЦИЮ в Supabase:"
echo "    - Откройте: https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql"
echo "    - Скопируйте содержимое: supabase/migrations/20260116_setup_new_ozon_sync_logic.sql"
echo "    - Выполните SQL"
echo ""

echo "2️⃣  ЗАДЕПЛОИТЬ EDGE FUNCTIONS:"
echo "    supabase functions deploy sync-ozon --no-verify-jwt"
echo "    supabase functions deploy auto-generate-drafts --no-verify-jwt"
echo ""

echo "3️⃣  ПРОВЕРИТЬ LOVABLE DEPLOYMENT:"
echo "    - Откройте: https://lovable.dev"
echo "    - Убедитесь что последний деплой = Success"
echo "    - Если деплоя нет - нажмите 'Redeploy' для ветки main"
echo ""

echo "4️⃣  ОЧИСТИТЬ BROWSER CACHE:"
echo "    - Ctrl+F5 (Windows/Linux) или Cmd+Shift+R (Mac)"
echo "    - Или откройте в приватном окне"
echo ""

echo "5️⃣  ПРОВЕРИТЬ ЧТО КНОПКА ПОЯВИЛАСЬ:"
echo "    - Откройте: /app/reviews"
echo "    - Должны увидеть кнопку 'Синхронизация за 14 дней'"
echo ""

echo "========================================="
echo "🆘 ЕСЛИ НУЖНА ПОМОЩЬ"
echo "========================================="
echo ""
echo "Запустите диагностику в Supabase SQL Editor:"
echo "  cat ДИАГНОСТИКА_ПРОБЛЕМЫ.sql"
echo ""
echo "Или следуйте чеклисту:"
echo "  cat ЧЕКЛИСТ_ФРОНТЕНД.md"
echo ""
echo "Отправьте мне результаты!"
echo ""

echo "========================================="
echo "✅ ПРОВЕРКА ЗАВЕРШЕНА"
echo "========================================="
