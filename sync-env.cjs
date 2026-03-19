
const { execSync } = require('child_process');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));

const varsToSync = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_PROJECT_ID',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY'
];

for (const key of varsToSync) {
    const value = envConfig[key];
    if (value) {
        console.log(`Syncing ${key}...`);
        try {
            // Use stdin to avoid leaking key in process list and shell escaping issues
            execSync(`npx vercel env add ${key} production`, { input: value });
        } catch (e) {
            console.error(`Error syncing ${key}:`, e.message);
        }
    }
}
console.log('Done!');
