#!/usr/bin/env node

const fs = require('fs');
const { exec } = require('child_process');
const https = require('https');

const PROJECT_REF = 'bkmicyguzlwampuindff';
const DB_PASSWORD = 'Pkbb3oUzjMLoa8s3';
const SQL_FILE = '/home/user/standalone-spark/AUTO_SETUP_SYSTEM.sql';

// Read SQL file
const sqlContent = fs.readFileSync(SQL_FILE, 'utf8');

// Connection string for pooler (uses port 6543 with transaction mode)
const connectionString = `postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

console.log('🔄 Executing SQL setup script...');
console.log('📝 Connection: pooler mode (port 6543)');

// Use psql with pooler connection
const command = `PGPASSWORD="${DB_PASSWORD}" psql "${connectionString}" -f "${SQL_FILE}"`;

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Error executing SQL:', error.message);
    if (stderr) console.error('STDERR:', stderr);
    process.exit(1);
  }

  if (stdout) {
    console.log('✅ SQL executed successfully!');
    console.log(stdout);
  }

  if (stderr && !error) {
    console.log('⚠️  Warnings:', stderr);
  }
});
