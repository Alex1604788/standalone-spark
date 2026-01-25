#!/bin/bash

# =====================================================
# 🔄 ЗАПУСК СИНХРОНИЗАЦИИ ДЛЯ НЕДОСТАЮЩИХ ДАТ
# =====================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║         🔄 СИНХРОНИЗАЦИЯ НЕДОСТАЮЩИХ ДАТ OZON 🔄                 ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Проверка наличия jq для работы с JSON
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠ jq не установлен. Установите его:${NC}"
    echo "  Ubuntu/Debian: sudo apt-get install jq"
    echo "  macOS: brew install jq"
    exit 1
fi

# Параметры (ИЗМЕНИТЕ ЭТИ ЗНАЧЕНИЯ!)
SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
SUPABASE_SERVICE_KEY="<ВАШ_SERVICE_ROLE_KEY>"  # Найдите в Settings → API
MARKETPLACE_ID="<ВАШ_MARKETPLACE_ID>"          # ID маркетплейса OZON

# Период синхронизации
START_DATE="2025-12-01"
END_DATE="2025-12-31"

echo -e "${CYAN}Параметры синхронизации:${NC}"
echo "  Маркетплейс ID: $MARKETPLACE_ID"
echo "  Период: $START_DATE - $END_DATE"
echo ""

# Проверка что параметры заполнены
if [[ "$SUPABASE_SERVICE_KEY" == "<ВАШ_SERVICE_ROLE_KEY>" ]]; then
    echo -e "${RED}❌ Ошибка: Укажите SUPABASE_SERVICE_KEY в скрипте!${NC}"
    echo ""
    echo "Где найти:"
    echo "  1. Откройте: https://supabase.com/dashboard/project/bkmicyguzlwampuindff/settings/api"
    echo "  2. Скопируйте 'service_role' ключ"
    echo "  3. Вставьте в скрипт вместо <ВАШ_SERVICE_ROLE_KEY>"
    exit 1
fi

if [[ "$MARKETPLACE_ID" == "<ВАШ_MARKETPLACE_ID>" ]]; then
    echo -e "${RED}❌ Ошибка: Укажите MARKETPLACE_ID в скрипте!${NC}"
    echo ""
    echo "Где найти:"
    echo "  1. Выполните SQL: SELECT id, name FROM marketplaces WHERE marketplace = 'ozon';"
    echo "  2. Скопируйте id"
    echo "  3. Вставьте в скрипт вместо <ВАШ_MARKETPLACE_ID>"
    exit 1
fi

echo -e "${GREEN}✓${NC} Параметры проверены"
echo ""

# Запуск синхронизации
echo -e "${CYAN}Запуск Edge Function sync-ozon-performance...${NC}"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  "${SUPABASE_URL}/functions/v1/sync-ozon-performance" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"marketplace_id\": \"${MARKETPLACE_ID}\",
    \"start_date\": \"${START_DATE}\",
    \"end_date\": \"${END_DATE}\",
    \"sync_period\": \"custom\"
  }")

# Извлекаем HTTP код и тело ответа
HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
    echo -e "${GREEN}✅ Синхронизация запущена успешно!${NC}"
    echo ""
    echo "Ответ:"
    echo "$HTTP_BODY" | jq '.' 2>/dev/null || echo "$HTTP_BODY"
    echo ""
    echo -e "${CYAN}Следующие шаги:${NC}"
    echo "  1. Дождитесь завершения синхронизации (~5-10 минут)"
    echo "  2. Проверьте логи в Supabase Dashboard → Edge Functions → sync-ozon-performance"
    echo "  3. Выполните SQL проверку:"
    echo "     SELECT COUNT(DISTINCT stat_date) FROM ozon_performance_daily"
    echo "     WHERE campaign_name = 'Кабель КГ 2*2,5'"
    echo "     AND stat_date >= '2025-12-01' AND stat_date <= '2025-12-31';"
    echo ""
else
    echo -e "${RED}❌ Ошибка синхронизации!${NC}"
    echo "HTTP код: $HTTP_CODE"
    echo "Ответ:"
    echo "$HTTP_BODY"
    echo ""
    echo -e "${YELLOW}Возможные причины:${NC}"
    echo "  - Неправильный service_role ключ"
    echo "  - Неправильный marketplace_id"
    echo "  - Edge Function не задеплоена"
    echo "  - Ошибка в OZON API"
    echo ""
    echo "Проверьте логи: https://supabase.com/dashboard/project/bkmicyguzlwampuindff/logs/edge-functions"
    exit 1
fi
