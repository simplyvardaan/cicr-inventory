// Supabase PostgreSQL connection client (v2.1.0).
//
// This is the PRIMARY database connection. All reads and writes should
// go through Supabase first. Neon is the SECONDARY (fallback when
// Supabase is unreachable or sleeping).
//
// The Supabase JS client handles connection pooling internally via
// PostgREST, so we don't need manual pool management.
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config();

// ---------------------------------------------------------------- configuration
export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export const supabaseConfig: SupabaseConfig = {
  url: process.env.SUPABASE_URL || '',
  anonKey: process.env.SUPABASE_ANON_KEY || '',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
};

export const isSupabaseConfigured = (): boolean =>
  Boolean(supabaseConfig.url && supabaseConfig.serviceRoleKey);

// ----------------------------------------------------------- client construction
// Use service_role key for backend operations (bypasses RLS).
// The anon key is used for health checks and public operations.
let _supabaseAdmin: SupabaseClient | null = null;
let _supabasePublic: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (_supabaseAdmin) return _supabaseAdmin;

  _supabaseAdmin = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    auth: { persistSession: false },
  });
  return _supabaseAdmin;
}

export function getSupabasePublic(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (_supabasePublic) return _supabasePublic;

  _supabasePublic = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: { persistSession: false },
  });
  return _supabasePublic;
}

// ---------------------------------------------------------- health check
export async function checkSupabaseHealth(): Promise<boolean> {
  const client = getSupabaseAdmin();
  if (!client) return false;

  try {
    const { error } = await client.from('users').select('id').limit(1);
    // PGRST116 = table exists but no rows (still healthy)
    if (error && error.code !== 'PGRST116') {
      console.warn('[SUPABASE] Health check warning:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[SUPABASE] Health check failed:', err.message);
    return false;
  }
}

// ---------------------------------------------------------- query helpers
// These helpers translate Supabase client calls into the same interface
// that database.ts QueryBuilder uses, so controllers don't need changes.

export interface SupabaseQueryResult<T = any> {
  data: T | T[] | null;
  error: { message: string; code: string } | null;
  count?: number;
}

interface SupabaseQueryOptions {
  columns?: string;
  data?: Record<string, unknown>[];
  updates?: Record<string, unknown>;
  filters?: Array<{ column: string; op: string; value: unknown }>;
  orderBy?: { column: string; ascending: boolean };
  limit?: number;
  single?: boolean;
}

const SUPABASE_QUERY_TIMEOUT_MS = 8000;

function withTimeout<T = any>(promise: PromiseLike<T> | Promise<T>, timeoutMs = SUPABASE_QUERY_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Supabase query timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Execute a query via Supabase PostgREST.
 * Supports SELECT, INSERT, UPDATE, DELETE with filters, ordering, limits.
 */
export async function supabaseQuery(
  table: string,
  operation: 'select' | 'insert' | 'update' | 'delete',
  options: SupabaseQueryOptions = {},
): Promise<SupabaseQueryResult> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { data: null, error: { message: 'Supabase not configured', code: 'CONFIG' } };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = client.from(table);

    switch (operation) {
      case 'select': {
        const columns = options.columns || '*';
        const isCountOnly = options.limit === 0;
        query = query.select(columns, { count: isCountOnly ? 'exact' : undefined });

        // Apply filters
        if (options.filters) {
          for (const filter of options.filters) {
            switch (filter.op) {
              case 'eq':
                query = query.eq(filter.column, filter.value);
                break;
              case 'neq':
                query = query.neq(filter.column, filter.value);
                break;
              case 'gt':
                query = query.gt(filter.column, filter.value);
                break;
              case 'gte':
                query = query.gte(filter.column, filter.value);
                break;
              case 'lt':
                query = query.lt(filter.column, filter.value);
                break;
              case 'lte':
                query = query.lte(filter.column, filter.value);
                break;
              case 'in':
                query = query.in(filter.column, filter.value as unknown[]);
                break;
              case 'ilike':
                query = query.ilike(filter.column, filter.value as string);
                break;
              case 'is':
                query = query.is(filter.column, filter.value);
                break;
              case 'or': {
                // PostgREST or() syntax: "col1.op1.val1,col2.op2.val2"
                query = query.or(filter.value as string);
                break;
              }
            }
          }
        }

        // Apply ordering
        if (options.orderBy) {
          query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending });
        }

        // Apply limit (skip for count-only queries)
        if (options.limit && options.limit > 0) {
          query = query.limit(options.limit);
        }

        // Single result
        if (options.single) {
          const res: any = await withTimeout(query.single());
          return { data: res?.data ?? null, error: res?.error ?? null, count: res?.count ?? undefined };
        }

        const res: any = await withTimeout(query);
        return { data: res?.data ?? null, error: res?.error ?? null, count: res?.count ?? undefined };
      }

      case 'insert': {
        const res: any = await withTimeout(query.insert(options.data || []).select());
        return { data: res?.data ?? null, error: res?.error ?? null };
      }

      case 'update': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = query.update(options.updates || {});
        if (options.filters) {
          for (const filter of options.filters) {
            switch (filter.op) {
              case 'eq':
                q = q.eq(filter.column, filter.value);
                break;
              case 'neq':
                q = q.neq(filter.column, filter.value);
                break;
              case 'gt':
                q = q.gt(filter.column, filter.value);
                break;
              case 'gte':
                q = q.gte(filter.column, filter.value);
                break;
              case 'lt':
                q = q.lt(filter.column, filter.value);
                break;
              case 'lte':
                q = q.lte(filter.column, filter.value);
                break;
              case 'in':
                q = q.in(filter.column, filter.value as unknown[]);
                break;
              case 'ilike':
                q = q.ilike(filter.column, filter.value as string);
                break;
              case 'is':
                q = q.is(filter.column, filter.value);
                break;
            }
          }
        }
        const res: any = await withTimeout(q.select());
        return { data: res?.data ?? null, error: res?.error ?? null };
      }

      case 'delete': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = query.delete();
        if (options.filters) {
          for (const filter of options.filters) {
            switch (filter.op) {
              case 'eq':
                q = q.eq(filter.column, filter.value);
                break;
              case 'neq':
                q = q.neq(filter.column, filter.value);
                break;
              case 'gt':
                q = q.gt(filter.column, filter.value);
                break;
              case 'gte':
                q = q.gte(filter.column, filter.value);
                break;
              case 'lt':
                q = q.lt(filter.column, filter.value);
                break;
              case 'lte':
                q = q.lte(filter.column, filter.value);
                break;
              case 'in':
                q = q.in(filter.column, filter.value as unknown[]);
                break;
              case 'ilike':
                q = q.ilike(filter.column, filter.value as string);
                break;
              case 'is':
                q = q.is(filter.column, filter.value);
                break;
            }
          }
        }
        const res: any = await withTimeout(q.select());
        return { data: res?.data ?? null, error: res?.error ?? null };
      }

      default:
        return { data: null, error: { message: 'Unknown operation', code: 'OP' } };
    }
  } catch (err: any) {
    return { data: null, error: { message: err.message, code: err.code || 'UNKNOWN' } };
  }
}

// ---------------------------------------------------------- graceful close
export async function closeSupabase(): Promise<void> {
  _supabaseAdmin = null;
  _supabasePublic = null;
}
