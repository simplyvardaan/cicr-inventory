// Database access layer — public application-facing interface (v2.3.0).
//
// SUPABASE-PRIMARY ARCHITECTURE:
//   - Normal CRUD operations (SELECT, INSERT, UPDATE, DELETE) route to Supabase via PostgREST
//   - Complex multi-table atomic operations (borrow_records) route to Neon via pg Pool
//   - Neon pools retained for DR/SECONDARY infrastructure
//   - No dual-write, no exec_sql RPC required
//
// The exported dbRead/dbWrite objects expose the same .from().select().eq()
// chainable API that controllers already use.
import dotenv from 'dotenv';
import { Pool, QueryResult } from 'pg';
import {
  queryRead as neonQueryRead,
  queryWrite as neonQueryWrite,
  isNeonConfigured,
  isReplicaConfigured,
} from './neonPool';
import { supabaseQuery, isSupabaseConfigured } from './supabasePool';
import {
  canUseSupabaseDirect,
  routeToSupabase,
  routeToNeon,
  SUPABASE_PRIMARY_TABLES,
  SUPABASE_REPLICATED_TABLES,
  NEON_ATOMIC_TABLES,
} from './databaseRouter';
import {
  SupabaseError,
  SupabaseResult,
  SupabaseCompatibleClient,
  QueryState,
  QueryFilter,
  QueryOperation,
} from './databaseTypes';
import { isPrimaryAvailable, setSupabaseHealthy } from './dbHealth';
import { enqueuePendingChange } from './replication';

dotenv.config();

function isNetworkOrServiceOutage(err: { message?: string; code?: string } | null): boolean {
  if (!err || !err.message) return false;
  const msg = err.message.toLowerCase();
  const code = (err.code || '').toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('connection') ||
    msg.includes('timeout') ||
    msg.includes('bad gateway') ||
    msg.includes('service unavailable') ||
    msg.includes('gateway timeout') ||
    msg.includes('failed to fetch') ||
    msg.includes('socket hang up') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    code === 'econnrefused' ||
    code === 'etimedout' ||
    code === 'config'
  );
}

// ------------------------------------------------------------------ helpers
function escapeIdent(name: string): string {
  return name.split('.').map((p) => `"${p.replace(/"/g, '""')}"`).join('.');
}

/** Split a select expression by commas, respecting nested parentheses.
 *  e.g. "*, inventory(name, available_quantity)" → ["*", "inventory(name, available_quantity)"]
 *       NOT ["*", " inventory(name", " available_quantity)"]
 */
function splitColumns(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') depth--;
    else if (expr[i] === ',' && depth === 0) {
      parts.push(expr.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(expr.slice(start).trim());
  return parts;
}

function parseColumns(selectExpr: string): string {
  if (selectExpr === '*') return '*';
  return splitColumns(selectExpr).map(escapeIdent).join(', ');
}

// Foreign key definitions for PostgREST-style joins (used by Neon path for borrow_records)
const FK_MAP: Record<string, { table: string; fkCol: string; pkCol: string; alias: string }> = {
  'inventory(name, category)':                { table: 'inventory', fkCol: 'inventory_id', pkCol: 'id', alias: 'inventory' },
  'inventory(name, available_quantity)':      { table: 'inventory', fkCol: 'inventory_id', pkCol: 'id', alias: 'inventory' },
  'inventory(name)':                          { table: 'inventory', fkCol: 'inventory_id', pkCol: 'id', alias: 'inventory' },
  'users(name, email, role)':                 { table: 'users',     fkCol: 'user_id',      pkCol: 'id', alias: 'users' },
  'users(name, email, roll_number)':          { table: 'users',     fkCol: 'user_id',      pkCol: 'id', alias: 'users' },
  'users(name, email)':                       { table: 'users',     fkCol: 'user_id',      pkCol: 'id', alias: 'users' },
};

// ---------------------------------------------------------------- QueryBuilder
class QueryBuilder {
  private state: QueryState;

  constructor(table: string) {
    this.state = { table, operation: 'select', columns: '*', filters: [] };
  }

  select(columns: string = '*', options?: { count?: string; head?: boolean }): this {
    if (this.state.operation === 'select') {
      this.state.columns = columns;
      if (options) {
        this.state.selectOptions = options;
        if (options.head) {
          this.state.countOnly = true;
          this.state.countExact = options.count === 'exact';
        }
      }
    } else {
      this.state.returnColumns = columns;
    }
    return this;
  }

  insert(data: Record<string, unknown>[]): this {
    this.state.operation = 'insert';
    this.state.data = data;
    return this;
  }

  update(data: Record<string, unknown>): this {
    this.state.operation = 'update';
    this.state.updates = data;
    return this;
  }

  delete(): this {
    this.state.operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.state.filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.state.filters.push({ type: 'neq', column, value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.state.filters.push({ type: 'gt', column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.state.filters.push({ type: 'gte', column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.state.filters.push({ type: 'lt', column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.state.filters.push({ type: 'lte', column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.state.filters.push({ type: 'in', column, value: values });
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.state.filters.push({ type: 'ilike', column, value: pattern });
    return this;
  }

  is(column: string, value: null): this {
    this.state.filters.push({ type: 'is_null', column, value });
    return this;
  }

  not(column: string, op: string, value: unknown): this {
    if (op === 'is' && value === null) {
      this.state.filters.push({ type: 'is_not_null', column, value });
    }
    return this;
  }

  or(filterStr: string): this {
    this.state.filters.push({ type: 'or', column: '', value: filterStr });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.state.orderBy = { column, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(count: number): this {
    this.state.limitCount = count;
    return this;
  }

  single(): Promise<SupabaseResult> {
    this.state.singleResult = true;
    return this.execute();
  }

  maybeSingle(): Promise<SupabaseResult> {
    this.state.maybeSingle = true;
    this.state.singleResult = true;
    return this.execute();
  }

  then<TResult1 = SupabaseResult, TResult2 = never>(
    onFulfilled?: ((value: SupabaseResult) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onFulfilled, onRejected);
  }

  // Terminal: execute the built query
  async execute(): Promise<SupabaseResult> {
    try {
      const { table, operation, filters } = this.state;

      // Route simple CRUD operations to Supabase PostgREST
      if (canUseSupabaseDirect(table, operation, filters)) {
        const directResult = await this.executeViaSupabaseDirect();
        if (!directResult.error || !isNetworkOrServiceOutage(directResult.error)) {
          return directResult;
        }

        console.warn(
          `[DB FAILOVER] Supabase primary error (${directResult.error.message}). Failing over immediately to Neon secondary for table "${table}".`
        );
        setSupabaseHealthy(false);
        // Fall through to Neon execution below
      }

      // Failover path: while the PRIMARY is unavailable, replicated tables are
      // served by Neon. Supported writes are additionally recorded in the durable
      // pending-change queue so they can be reconciled back to Supabase on recovery.
      // Exactly one database is written per operation (no dual-write).
      const failoverWrite =
        !isPrimaryAvailable() &&
        SUPABASE_REPLICATED_TABLES.has(table) &&
        operation !== 'select';

      let result: SupabaseResult;
      switch (this.state.operation) {
        case 'select': result = await this.executeSelect(); break;
        case 'insert': result = await this.executeInsert(); break;
        case 'update': result = await this.executeUpdate(); break;
        case 'delete': result = await this.executeDelete(); break;
        default: result = { data: null, error: { message: 'Unknown operation', code: '' } };
      }

      if (failoverWrite && !result.error) {
        await this.recordPendingChange(result);
      }

      return result;
    } catch (err: any) {
      if (isNetworkOrServiceOutage(err) && isPrimaryAvailable()) {
        console.warn(`[DB FAILOVER] Caught Supabase exception (${err.message}). Failing over to Neon secondary.`);
        setSupabaseHealthy(false);
        try {
          switch (this.state.operation) {
            case 'select': return await this.executeSelect();
            case 'insert': return await this.executeInsert();
            case 'update': return await this.executeUpdate();
            case 'delete': return await this.executeDelete();
          }
        } catch (neonErr: any) {
          return { data: null, error: { message: neonErr.message, code: neonErr.code || '' } };
        }
      }
      return { data: null, error: { message: err.message, code: err.code || '' } };
    }
  }

  // Record a write performed on the secondary for later reconciliation.
  private async recordPendingChange(result: SupabaseResult): Promise<void> {
    const { table, operation, updates, filters } = this.state;
    try {
      if (operation === 'insert') {
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        if (row) {
          await enqueuePendingChange({ table, operation, row: row as Record<string, unknown>, filters: [] });
        }
      } else if (operation === 'update') {
        await enqueuePendingChange({ table, operation, updates, filters });
      } else if (operation === 'delete') {
        await enqueuePendingChange({ table, operation, filters });
      }
    } catch (err: any) {
      console.error('[DB] Failed to record pending failover change:', err?.message);
    }
  }

  // ------------------------------------------------------------- Direct Supabase PostgREST execution for simple CRUD
  private async executeViaSupabaseDirect(): Promise<SupabaseResult> {
    const { table, operation, columns, data, updates, filters, orderBy, limitCount, singleResult, countOnly, selectOptions } = this.state;

    // Convert QueryBuilder filters to supabaseQuery format
    const sbFilters = filters.map((f) => ({
      column: f.column,
      op: f.type === 'eq' ? 'eq' :
          f.type === 'neq' ? 'neq' :
          f.type === 'gt' ? 'gt' :
          f.type === 'gte' ? 'gte' :
          f.type === 'lt' ? 'lt' :
          f.type === 'lte' ? 'lte' :
          f.type === 'in' ? 'in' :
          f.type === 'ilike' ? 'ilike' :
          f.type === 'is_null' ? 'is' : 'eq',
      value: f.value,
    }));

    const sbOptions: {
      columns?: string;
      data?: Record<string, unknown>[];
      updates?: Record<string, unknown>;
      filters?: Array<{ column: string; op: string; value: unknown }>;
      orderBy?: { column: string; ascending: boolean };
      limit?: number;
      single?: boolean;
    } = {};

    if (columns && columns !== '*') {
      sbOptions.columns = columns;
    }

    if (operation === 'insert' && data) {
      sbOptions.data = data;
    }

    if (operation === 'update' && updates) {
      sbOptions.updates = updates;
    }

    if (sbFilters.length > 0) {
      sbOptions.filters = sbFilters;
    }

    if (orderBy) {
      sbOptions.orderBy = { column: orderBy.column, ascending: orderBy.ascending };
    }

    if (limitCount) {
      sbOptions.limit = limitCount;
    }

    if (singleResult) {
      sbOptions.single = true;
    }

    // Handle count head queries (e.g., select('*', { count: 'exact', head: true }))
    if (countOnly && selectOptions?.head) {
      sbOptions.columns = '*';
      sbOptions.limit = 0;
    }

    const result = await supabaseQuery(table, operation, sbOptions);

    // Convert SupabaseQueryResult to SupabaseResult format
    if (result.error) {
      return { data: null, error: { message: result.error.message, code: result.error.code } };
    }

    // For count queries, return count in the expected format
    if (countOnly && selectOptions?.head) {
      return { data: null, count: result.count ?? 0, error: null };
    }

    if (singleResult && Array.isArray(result.data)) {
      return { data: result.data[0] || null, error: null, count: result.count };
    }

    return { data: result.data, error: null, count: result.count };
  }

  // ------------------------------------------------------------- SELECT (Neon path for complex queries)
  private async executeSelect(): Promise<SupabaseResult> {
    const { table, columns, filters, orderBy, limitCount, singleResult, countOnly, countExact } = this.state;

    // Handle joins
    const colParts = columns ? splitColumns(columns) : ['*'];
    const joinEntries = Object.entries(FK_MAP).filter(([key]) =>
      colParts.includes(key),
    );
    const hasJoins = joinEntries.length > 0;

    // Extract base columns (non-join parts)
    let baseColumns = columns || '*';
    const joinParts: string[] = [];

    if (hasJoins) {
      const plainCols: string[] = [];
      for (const part of colParts) {
        if (FK_MAP[part]) {
          const fk = FK_MAP[part];
          const joinCols = part.slice(part.indexOf('(') + 1, -1).split(',').map((c) => c.trim());
          for (const jc of joinCols) {
            joinParts.push(`${escapeIdent(fk.alias)}.${escapeIdent(jc)} AS ${escapeIdent(`${fk.alias}_${jc}`)}`);
          }
          joinParts.push(`${escapeIdent(fk.alias)}.${escapeIdent(fk.pkCol)} AS ${escapeIdent(`${fk.alias}_${fk.pkCol}`)}`);
        } else {
          plainCols.push(part);
        }
      }
      baseColumns = plainCols.length > 0
        ? plainCols.map((c) => (c === '*' ? `${escapeIdent(table)}.*` : escapeIdent(c))).join(', ')
        : `${escapeIdent(table)}.*`;
    } else {
      baseColumns = columns === '*' ? `${escapeIdent(table)}.*` : parseColumns(columns || '*');
    }

    const allSelectCols = hasJoins
      ? `${baseColumns}, ${joinParts.join(', ')}`
      : (countOnly ? '*' : baseColumns);

    let sql = countOnly
      ? `SELECT COUNT(*) AS total FROM ${escapeIdent(table)}`
      : `SELECT ${allSelectCols} FROM ${escapeIdent(table)}`;

    // Add JOINs
    if (hasJoins) {
      for (const [, fk] of joinEntries) {
        sql += ` LEFT JOIN ${escapeIdent(fk.table)} AS ${escapeIdent(fk.alias)} ON ${escapeIdent(table)}.${escapeIdent(fk.fkCol)} = ${escapeIdent(fk.alias)}.${escapeIdent(fk.pkCol)}`;
      }
    }

    const values: unknown[] = [];
    let paramIdx = 1;
    const whereClauses: string[] = [];

    for (const filter of filters) {
      const qualifiedFilter = hasJoins
        ? { ...filter, column: `${table}.${filter.column}` }
        : filter;
      const clause = this.buildFilterClause(qualifiedFilter, values, paramIdx);
      if (clause) {
        whereClauses.push(clause.sql);
        paramIdx = clause.nextIdx;
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (!countOnly && orderBy) {
      sql += ` ORDER BY ${escapeIdent(table)}.${escapeIdent(orderBy.column)} ${orderBy.ascending ? 'ASC' : 'DESC'}`;
    }

    if (countOnly) {
      const result = await poolQuery(sql, values);
      const total = parseInt(result.rows[0]?.total || '0', 10);
      return { data: null, count: total, error: null };
    }

    if (limitCount !== undefined) {
      sql += ` LIMIT ${Math.max(1, Math.min(limitCount, 1000))}`;
    } else if (singleResult) {
      sql += ` LIMIT 1`;
    }

    const result = await poolQuery(sql, values);

    // Unflatten join columns
    const rows = (result.rows || []).map((row: any) => this.unflattenRow(row, columns || '*'));

    if (singleResult) {
      if (rows.length === 0) {
        if (this.state.maybeSingle) {
          return { data: null, error: null };
        }
        return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
      }
      return { data: rows[0], error: null };
    }

    return { data: rows, error: null };
  }

  // ------------------------------------------------------------- INSERT (Neon path)
  private async executeInsert(): Promise<SupabaseResult> {
    const { table, data, returnColumns, singleResult } = this.state;
    if (!data || data.length === 0) {
      return { data: null, error: { message: 'No data provided', code: '' } };
    }

    const returningCols = returnColumns ? parseColumns(returnColumns) : '*';
    const allCols: string[] = Array.from(new Set(data.flatMap((r: any) => Object.keys(r))));
    const values: unknown[] = [];
    const tuples: string[] = [];

    for (const row of (data as Record<string, any>[])) {
      const placeholders = allCols.map((c: string) => {
        values.push(row[c] === undefined ? null : row[c]);
        return `$${values.length}`;
      });
      tuples.push(`(${placeholders.join(', ')})`);
    }

    const sql = `INSERT INTO ${escapeIdent(table)} (${allCols.map(escapeIdent).join(', ')}) VALUES ${tuples.join(', ')} RETURNING ${returningCols}`;

    const result = await poolQuery(sql, values);
    if (singleResult || data.length === 1) {
      return { data: result.rows[0] || null, error: null };
    }
    return { data: result.rows, error: null };
  }

  // ------------------------------------------------------------- UPDATE (Neon path)
  private async executeUpdate(): Promise<SupabaseResult> {
    const { table, updates, filters, returnColumns, singleResult } = this.state;
    if (!updates) {
      return { data: null, error: { message: 'No updates provided', code: '' } };
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [col, val] of Object.entries(updates)) {
      setClauses.push(`${escapeIdent(col)} = $${paramIdx}`);
      values.push(val);
      paramIdx++;
    }

    let sql = `UPDATE ${escapeIdent(table)} SET ${setClauses.join(', ')}`;

    const whereClauses: string[] = [];
    for (const filter of filters) {
      const clause = this.buildFilterClause(filter, values, paramIdx);
      if (clause) {
        whereClauses.push(clause.sql);
        paramIdx = clause.nextIdx;
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const returningCols = returnColumns ? parseColumns(returnColumns) : '*';
    sql += ` RETURNING ${returningCols}`;

    const result = await poolQuery(sql, values);

    if (singleResult) {
      if (result.rows.length === 0) {
        return { data: null, error: null };
      }
      return { data: result.rows[0], error: null };
    }

    return { data: result.rows, error: null };
  }

  // ------------------------------------------------------------- DELETE (Neon path)
  private async executeDelete(): Promise<SupabaseResult> {
    const { table, filters, returnColumns, singleResult } = this.state;

    let sql = `DELETE FROM ${escapeIdent(table)}`;
    const values: unknown[] = [];
    let paramIdx = 1;
    const whereClauses: string[] = [];

    for (const filter of filters) {
      const clause = this.buildFilterClause(filter, values, paramIdx);
      if (clause) {
        whereClauses.push(clause.sql);
        paramIdx = clause.nextIdx;
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (returnColumns) {
      const returningCols = parseColumns(returnColumns);
      sql += ` RETURNING ${returningCols}`;
      const result = await poolQuery(sql, values);
      if (singleResult) {
        if (result.rows.length === 0) {
          return { data: null, error: null };
        }
        return { data: result.rows[0], error: null, count: result.rowCount ?? 0 };
      }
      return { data: result.rows, error: null, count: result.rowCount ?? 0 };
    }

    const result = await poolQuery(sql, values);
    return { data: null, error: null, count: result.rowCount ?? 0 };
  }

  // ------------------------------------------------------------- filter builder
  private buildFilterClause(
    filter: { type: string; column: string; value: unknown; op?: string },
    values: unknown[],
    startIdx: number,
  ): { sql: string; nextIdx: number } | null {
    let idx = startIdx;

    switch (filter.type) {
      case 'eq':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} = $${idx}`, nextIdx: idx + 1 };
      case 'neq':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} != $${idx}`, nextIdx: idx + 1 };
      case 'gt':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} > $${idx}`, nextIdx: idx + 1 };
      case 'gte':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} >= $${idx}`, nextIdx: idx + 1 };
      case 'lt':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} < $${idx}`, nextIdx: idx + 1 };
      case 'lte':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} <= $${idx}`, nextIdx: idx + 1 };
      case 'ilike':
        values.push(filter.value);
        return { sql: `${escapeIdent(filter.column)} ILIKE $${idx}`, nextIdx: idx + 1 };
      case 'in': {
        const arr = filter.value as unknown[];
        if (!Array.isArray(arr) || arr.length === 0) return null;
        const placeholders = arr.map(() => { idx++; return `$${idx - 1}`; });
        values.push(...arr);
        return { sql: `${escapeIdent(filter.column)} IN (${placeholders.join(', ')})`, nextIdx: idx };
      }
      case 'is_null':
        return { sql: `${escapeIdent(filter.column)} IS NULL`, nextIdx: idx };
      case 'is_not_null':
        return { sql: `${escapeIdent(filter.column)} IS NOT NULL`, nextIdx: idx };
      case 'or': {
        const filterStr = filter.value as string;
        const conditions = this.parseOrFilter(filterStr, values, idx);
        values.push(...conditions.newValues);
        return { sql: `(${conditions.sql})`, nextIdx: idx + conditions.newValues.length };
      }
      default:
        return null;
    }
  }

  private parseOrFilter(
    filterStr: string,
    _existingValues: unknown[],
    startIdx: number,
  ): { sql: string; newValues: unknown[] } {
    const parts = filterStr.split(',');
    const clauses: string[] = [];
    const newValues: unknown[] = [];
    let idx = startIdx;

    for (const part of parts) {
      const dotIdx = part.indexOf('.');
      if (dotIdx === -1) continue;

      const column = part.substring(0, dotIdx);
      const rest = part.substring(dotIdx + 1);

      const ops = ['ilike', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte'];
      let matchedOp = '';
      let value = '';

      for (const op of ops) {
        if (rest.startsWith(op + '.')) {
          matchedOp = op;
          value = rest.substring(op.length + 1);
          break;
        }
      }

      if (!matchedOp) continue;

      newValues.push(value);
      switch (matchedOp) {
        case 'ilike':
          clauses.push(`${escapeIdent(column)} ILIKE $${idx}`);
          break;
        case 'eq':
          clauses.push(`${escapeIdent(column)} = $${idx}`);
          break;
        case 'neq':
          clauses.push(`${escapeIdent(column)} != $${idx}`);
          break;
        default:
          clauses.push(`${escapeIdent(column)} ${matchedOp === 'gt' ? '>' : matchedOp === 'gte' ? '>=' : matchedOp === 'lt' ? '<' : '<='} $${idx}`);
      }
      idx++;
    }

    return { sql: clauses.join(' OR '), newValues };
  }

  // ------------------------------------------------------------- unflatten joins
  private unflattenRow(row: Record<string, unknown>, columns: string): Record<string, unknown> {
    if (!columns.includes('(')) return row;

    const joinColMap: Record<string, Set<string>> = {};
    const parts = splitColumns(columns);
    for (const part of parts) {
      const fkEntry = FK_MAP[part];
      if (fkEntry) {
        const colListMatch = part.match(/^\w+\((.+)\)$/);
        if (colListMatch) {
          joinColMap[fkEntry.alias] = new Set(
            colListMatch[1].split(',').map((c) => c.trim()),
          );
        }
      }
    }

    const result: Record<string, unknown> = {};
    const joinObjects: Record<string, Record<string, unknown>> = {};

    for (const [key, val] of Object.entries(row)) {
      const joinMatch = key.match(/^(\w+)_(.+)$/);
      if (joinMatch) {
        const [, alias, colName] = joinMatch;
        const expectedCols = joinColMap[alias];
        if (expectedCols && expectedCols.has(colName)) {
          if (!joinObjects[alias]) joinObjects[alias] = {};
          joinObjects[alias][colName] = val;
          continue;
        }
      }
      result[key] = val;
    }

    for (const [alias, obj] of Object.entries(joinObjects)) {
      result[alias] = obj;
    }

    return result;
  }
}

// ---------------------------------------------------------------- pool routing (Neon for complex operations & failover)
async function poolQuery(sql: string, values?: unknown[]): Promise<QueryResult> {
  const upperSql = sql.trim().toUpperCase();
  const isWrite = upperSql.startsWith('INSERT') ||
                  upperSql.startsWith('UPDATE') ||
                  upperSql.startsWith('DELETE') ||
                  upperSql.startsWith('BEGIN') ||
                  upperSql.startsWith('COMMIT') ||
                  upperSql.startsWith('ROLLBACK');

  if (isWrite) {
    if (isNeonConfigured()) {
      return await neonQueryWrite(sql, values);
    }
    return { rows: [], rowCount: 0, command: 'INSERT', oid: 0, fields: [] };
  }

  // READ: Use Neon
  if (isNeonConfigured()) {
    return neonQueryRead(sql, values);
  }

  throw new Error('Neon not configured for database operations');
}

// ----------------------------------------------------- export instances
function createClient(): SupabaseCompatibleClient {
  return {
    from(table: string): QueryBuilder {
      return new QueryBuilder(table);
    },
  };
}

export const dbWrite: SupabaseCompatibleClient = createClient();
export const dbRead: SupabaseCompatibleClient = createClient();

// Backward-compatible alias for the primary write client (preserves the
// upstream public API expected by existing controllers).
// Backward-compatible alias for the primary write client.
export const supabase: SupabaseCompatibleClient = dbWrite;

export const isReadReplicaConfigured = (): boolean => isReplicaConfigured();

// Re-export routing constants for external reference if needed.
export {
  SUPABASE_PRIMARY_TABLES,
  SUPABASE_REPLICATED_TABLES,
  NEON_ATOMIC_TABLES,
  routeToSupabase,
  routeToNeon,
  canUseSupabaseDirect
};