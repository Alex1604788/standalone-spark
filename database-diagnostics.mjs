import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

// Supabase connection details
const client = new Client({
  host: 'aws-0-eu-central-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.bkmicyguzlwampuindff',
  password: process.env.SUPABASE_DB_PASSWORD || '',
  ssl: { rejectUnauthorized: false }
});

async function runDiagnostics() {
  try {
    await client.connect();
    console.log('✅ Подключено к базе данных Supabase\n');
    console.log('='.repeat(80));
    console.log('ДИАГНОСТИКА РАЗМЕРА БАЗЫ ДАННЫХ');
    console.log('='.repeat(80));
    console.log();

    // Read SQL file
    const sqlContent = fs.readFileSync('./DATABASE_SIZE_DIAGNOSTIC.sql', 'utf8');

    // Split by queries (basic split by semicolon and SELECT)
    const queries = sqlContent
      .split(/\n(?=-- ШАГ|\nSELECT)/g)
      .filter(q => q.trim() && !q.trim().startsWith('--') && q.includes('SELECT'));

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i].trim();

      // Extract section name from comment
      const commentMatch = query.match(/-- (.+)/);
      const sectionName = commentMatch ? commentMatch[1] : `Запрос ${i + 1}`;

      // Extract actual SQL query
      const sqlQuery = query
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim();

      if (!sqlQuery) continue;

      console.log(`\n${'='.repeat(80)}`);
      console.log(`📊 ${sectionName}`);
      console.log('='.repeat(80));

      try {
        const result = await client.query(sqlQuery);

        if (result.rows.length === 0) {
          console.log('   ℹ️  Нет данных');
        } else {
          // Format and display results
          console.table(result.rows);

          // Additional analysis for specific sections
          if (sectionName.includes('Размер всех таблиц')) {
            const totalBytes = result.rows.reduce((sum, row) => sum + parseInt(row.total_bytes || 0), 0);
            console.log(`\n   📈 Общий размер всех таблиц: ${formatBytes(totalBytes)}`);
          }
        }
      } catch (err) {
        console.log(`   ⚠️  Ошибка выполнения запроса: ${err.message}`);
      }

      // Add delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Диагностика завершена');
    console.log('='.repeat(80));

  } catch (err) {
    console.error('❌ Ошибка подключения:', err.message);
    console.error('\n💡 Убедитесь, что у вас установлена переменная окружения SUPABASE_DB_PASSWORD');
    console.error('   Получить пароль можно в Supabase Dashboard -> Project Settings -> Database');
  } finally {
    await client.end();
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Run diagnostics
runDiagnostics();
