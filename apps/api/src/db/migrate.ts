import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../../.env') });

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client);

async function main() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: path.resolve(__dirname, './migrations') });
  console.log('Migrations complete.');
  await client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
