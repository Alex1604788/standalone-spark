#!/usr/bin/env node

const fs = require('fs');
const https = require('https');

const ACCESS_TOKEN = 'sbp_5ff9cb7a1a678a7aad11fb7398dc810695b08a3a';
const PROJECT_REF = 'bkmicyguzlwampuindff';
const SQL_FILE = '/home/user/standalone-spark/AUTO_SETUP_SYSTEM.sql';

// Read SQL file
const sqlContent = fs.readFileSync(SQL_FILE, 'utf8');

console.log('🔄 Executing SQL via Supabase Management API...');
console.log('📝 Project:', PROJECT_REF);

// Use Supabase Management API to execute SQL
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

const postData = JSON.stringify({
  query: sqlContent
});

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ SQL executed successfully!');
      console.log('Response:', data);
    } else {
      console.error('❌ Error executing SQL');
      console.error('Status:', res.statusCode);
      console.error('Response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error.message);
  process.exit(1);
});

req.write(postData);
req.end();
