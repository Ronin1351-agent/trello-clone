import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema.js';
import * as relations from './relations.js';

const client = postgres(env.DATABASE_URL, {
  max: env.DB_POOL_MAX,
  idle_timeout: 20,
  connect_timeout: 30,
  prepare: false,
});
export const db = drizzle(client, { schema: { ...schema, ...relations } });

export { schema };
