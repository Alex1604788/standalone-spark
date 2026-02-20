#!/bin/bash

# ============================================================================
# АВТОМАТИЧЕСКИЙ ДЕПЛОЙ EDGE FUNCTIONS
# Проект: КРАФТМАН (standalone-spark)
# Дата: 2026-02-20
# ============================================================================

set -e  # Остановить при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project ref
PROJECT_REF="bkmicyguzlwampuindff"

echo ""
echo "========================================"
echo "  АВТОМАТИЧЕСКИЙ ДЕПЛОЙ EDGE FUNCTIONS"
echo "  Проект: КРАФТМАН"
echo "  Дата: $(date)"
echo "========================================"
echo ""

# Проверяем что мы в правильной директории
if [ ! -d "supabase/functions" ]; then
  echo -e "${RED}❌ Ошибка: не найдена директория supabase/functions${NC}"
  echo "Запустите скрипт из корневой директории проекта:"
  echo "  cd /home/user/standalone-spark"
  echo "  ./AUTO_DEPLOY.sh"
  exit 1
fi

# Проверяем установлен ли supabase CLI
if ! command -v supabase &> /dev/null; then
  echo -e "${RED}❌ Ошибка: supabase CLI не установлен${NC}"
  echo ""
  echo "Установите Supabase CLI:"
  echo "  npm install -g supabase"
  echo ""
  exit 1
fi

echo -e "${BLUE}ШАГ 1/3: Проверка подключения к Supabase...${NC}"

# Проверяем что проект уже залинкован
if [ ! -f ".supabase/config.toml" ]; then
  echo -e "${YELLOW}Проект не залинкован. Выполняю линковку...${NC}"
  supabase link --project-ref $PROJECT_REF
  echo -e "${GREEN}✓ Проект залинкован${NC}"
else
  echo -e "${GREEN}✓ Проект уже залинкован${NC}"
fi

echo ""
echo -e "${BLUE}ШАГ 2/3: Деплой критических Edge Functions...${NC}"
echo ""

# Список критических функций для деплоя
CRITICAL_FUNCTIONS=(
  "sync-ozon"
  "sync-chats-api"
  "auto-generate-drafts"
  "auto-generate-drafts-cron"
  "process-scheduled-replies"
  "publish-reply"
)

DEPLOYED=0
FAILED=0

for func in "${CRITICAL_FUNCTIONS[@]}"; do
  echo -e "${YELLOW}Деплою: $func${NC}"

  if supabase functions deploy $func --no-verify-jwt 2>&1; then
    echo -e "${GREEN}  ✓ $func задеплоена${NC}"
    ((DEPLOYED++))
  else
    echo -e "${RED}  ✗ Ошибка при деплое $func${NC}"
    ((FAILED++))
  fi

  echo ""
done

echo ""
echo -e "${BLUE}ШАГ 3/3: Деплой дополнительных функций...${NC}"
echo ""

# Дополнительные функции
ADDITIONAL_FUNCTIONS=(
  "sync-reviews-api"
  "sync-questions-api"
  "update-reply-statuses"
  "generate-reply"
  "mark-reply-published"
)

for func in "${ADDITIONAL_FUNCTIONS[@]}"; do
  if [ -d "supabase/functions/$func" ]; then
    echo -e "${YELLOW}Деплою: $func${NC}"

    if supabase functions deploy $func --no-verify-jwt 2>&1; then
      echo -e "${GREEN}  ✓ $func задеплоена${NC}"
      ((DEPLOYED++))
    else
      echo -e "${RED}  ✗ Ошибка при деплое $func${NC}"
      ((FAILED++))
    fi

    echo ""
  fi
done

# Итоги
echo ""
echo "========================================"
echo "  ИТОГИ ДЕПЛОЯ"
echo "========================================"
echo -e "${GREEN}✓ Успешно задеплоено: $DEPLOYED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}✗ Ошибки: $FAILED${NC}"
fi
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 ВСЕ ФУНКЦИИ ЗАДЕПЛОЕНЫ УСПЕШНО!${NC}"
  echo ""
  echo "СЛЕДУЮЩИЕ ШАГИ:"
  echo "1. Проверьте логи Edge Functions:"
  echo "   https://supabase.com/dashboard/project/$PROJECT_REF/logs/edge-functions"
  echo ""
  echo "2. Дождитесь первого запуска cron job (через 10 минут)"
  echo ""
  echo "3. Проверьте синхронизацию в приложении:"
  echo "   Отзывы → Синхронизация"
  echo ""
else
  echo -e "${YELLOW}⚠️  НЕКОТОРЫЕ ФУНКЦИИ НЕ ЗАДЕПЛОЕНЫ${NC}"
  echo ""
  echo "Проверьте ошибки выше и попробуйте задеплоить вручную:"
  echo "  supabase functions deploy <function-name> --no-verify-jwt"
  echo ""
fi

echo "========================================"
echo ""
