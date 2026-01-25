#!/usr/bin/env node

/**
 * УСТАНОВКА ФУНКЦИИ АВТОАНАЛИЗА
 * Применяет миграцию CREATE_ANALYSIS_FUNCTION.sql
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import 'dotenv/config';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 УСТАНОВКА ФУНКЦИИ АВТОАНАЛИЗА');
console.log('='.repeat(80));
console.log('');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function setup() {
  try {
    console.log('📖 Читаю SQL миграцию...');
    const sql = readFileSync('CREATE_ANALYSIS_FUNCTION.sql', 'utf-8');
    console.log('✅ SQL миграция загружена');
    console.log('');

    console.log('⚠️  ВНИМАНИЕ!');
    console.log('   Supabase JS Client не поддерживает выполнение произвольного SQL');
    console.log('   Нужно применить миграцию вручную');
    console.log('');

    console.log('📋 ИНСТРУКЦИЯ:');
    console.log('');
    console.log('1. Открой Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new');
    console.log('');
    console.log('2. Скопируй содержимое файла CREATE_ANALYSIS_FUNCTION.sql');
    console.log('');
    console.log('3. Вставь в SQL Editor и нажми RUN');
    console.log('');
    console.log('4. После успешного выполнения запусти:');
    console.log('   node run-auto-analysis.mjs');
    console.log('');

    console.log('💡 Файл для копирования: CREATE_ANALYSIS_FUNCTION.sql');
    console.log('');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

setup();
