import type { D1Database } from '@cloudflare/workers-types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

export const getDb = (database: D1Database) => drizzle(database, { schema });
