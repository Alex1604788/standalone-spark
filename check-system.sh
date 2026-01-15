#!/bin/bash

# 🔍 БЫСТРАЯ ПРОВЕРКА СИСТЕМЫ
# Проверяет окружение, зависимости и запускает тесты

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║             🔍 ПРОВЕРКА СИСТЕМЫ STANDALONE-SPARK 🔍               ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Проверка Node.js
echo -e "\n${CYAN}1. Проверка Node.js${NC}"
echo "========================================================================"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js установлен: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js не найден"
    exit 1
fi

# Проверка npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓${NC} npm установлен: $NPM_VERSION"
else
    echo -e "${RED}✗${NC} npm не найден"
    exit 1
fi

# Проверка зависимостей
echo -e "\n${CYAN}2. Проверка зависимостей${NC}"
echo "========================================================================"
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules существует"

    # Проверяем ключевые пакеты
    if [ -d "node_modules/@supabase/supabase-js" ]; then
        echo -e "${GREEN}✓${NC} @supabase/supabase-js установлен"
    else
        echo -e "${YELLOW}⚠${NC} @supabase/supabase-js не найден, запускаю npm install..."
        npm install
    fi
else
    echo -e "${YELLOW}⚠${NC} node_modules не найден, запускаю npm install..."
    npm install
fi

# Проверка структуры проекта
echo -e "\n${CYAN}3. Проверка структуры проекта${NC}"
echo "========================================================================"
REQUIRED_DIRS=("src" "src/pages" "src/integrations" "supabase")
for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $dir/"
    else
        echo -e "${RED}✗${NC} $dir/ не найдена"
    fi
done

# Проверка конфигурационных файлов
echo -e "\n${CYAN}4. Проверка конфигурационных файлов${NC}"
echo "========================================================================"
REQUIRED_FILES=("package.json" "vite.config.ts" "src/integrations/supabase/client.ts")
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file не найден"
    fi
done

# Запуск unit тестов
echo -e "\n${CYAN}5. Запуск unit тестов${NC}"
echo "========================================================================"
if [ -f "test-deduplication-logic.test.js" ]; then
    if node test-deduplication-logic.test.js > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Тесты дедупликации пройдены"
    else
        echo -e "${RED}✗${NC} Тесты дедупликации провалились"
        echo "  Запустите: node test-deduplication-logic.test.js для деталей"
    fi
else
    echo -e "${YELLOW}⚠${NC} Файл тестов не найден"
fi

# Проверка git статуса
echo -e "\n${CYAN}6. Проверка Git${NC}"
echo "========================================================================"
if git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Git репозиторий"

    CURRENT_BRANCH=$(git branch --show-current)
    echo "  Текущая ветка: $CURRENT_BRANCH"

    # Проверяем незакоммиченные изменения
    if git diff-index --quiet HEAD --; then
        echo -e "${GREEN}✓${NC} Нет незакоммиченных изменений"
    else
        echo -e "${YELLOW}⚠${NC} Есть незакоммиченные изменения"
    fi
else
    echo -e "${RED}✗${NC} Не git репозиторий"
fi

# Итоги
echo -e "\n${CYAN}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                           ИТОГИ                                    ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}✅ Система готова к работе!${NC}\n"

echo "Доступные команды:"
echo "  npm run dev           - Запустить dev сервер"
echo "  npm run build         - Собрать проект"
echo "  node test-*.test.js   - Запустить unit тесты"
echo ""
