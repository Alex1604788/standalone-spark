#!/usr/bin/env node

const https = require('https');

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY3ODAwNDgsImV4cCI6MjA1MjM1NjA0OH0.vkMzG1QOWxKQP_JUlwKSNLsOPPc_jTkkUcVG0DlPF6k';
const ACCESS_TOKEN = 'sbp_5ff9cb7a1a678a7aad11fb7398dc810695b08a3a';
const PROJECT_REF = 'bkmicyguzlwampuindff';

// Queries to test
const queries = {
  "1. Check cleanup_old_reviews function exists": `
    SELECT
      routine_name,
      routine_type,
      data_type as return_type
    FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name = 'cleanup_old_reviews';
  `,

  "2. Test cleanup_old_reviews function (dry run)": `
    SELECT public.cleanup_old_reviews(9999) as test_result;
  `,

  "3. Check active cron jobs": `
    SELECT
      jobid,
      schedule,
      command,
      active,
      jobname
    FROM cron.job
    WHERE active = true
    ORDER BY jobid DESC;
  `,

  "4. Check process-scheduled-replies cron": `
    SELECT
      jobid,
      schedule,
      command,
      active
    FROM cron.job
    WHERE command LIKE '%process-scheduled-replies%'
    ORDER BY jobid DESC
    LIMIT 5;
  `,

  "5. Check Ozon credentials mode": `
    SELECT
      id,
      marketplace_type,
      mode,
      created_at
    FROM marketplace_credentials
    WHERE marketplace_type = 'ozon'
    ORDER BY created_at DESC
    LIMIT 5;
  `
};

async function executeQuery(queryName, query) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const postData = JSON.stringify({ query: query.trim() });

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📋 ${queryName}`);
    console.log(`${'='.repeat(80)}`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            if (result && result.length > 0) {
              console.log('✅ Result:');
              console.log(JSON.stringify(result, null, 2));
            } else if (Array.isArray(result) && result.length === 0) {
              console.log('⚠️  No results found');
            } else {
              console.log('✅ Result:', result);
            }
            resolve(result);
          } catch (e) {
            console.log('✅ Raw response:', data);
            resolve(data);
          }
        } else {
          console.error('❌ Error - Status:', res.statusCode);
          console.error('Response:', data);
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Request error: ${error.message}`);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

async function checkDeployment() {
  console.log('\n🔍 ПРОВЕРКА ДЕПЛОЯ');
  console.log('Project:', PROJECT_REF);
  console.log('URL:', SUPABASE_URL);

  for (const [name, query] of Object.entries(queries)) {
    await executeQuery(name, query);
    // Wait between queries
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Проверка завершена!');
  console.log('='.repeat(80) + '\n');
}

checkDeployment();
