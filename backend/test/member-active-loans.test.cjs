const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

// M-8 regression: member Active Loans / returnable-loans authorization boundary.
//
// Required behavior:
//   - MEMBER sees ONLY their own active loans (server-side, via JWT identity).
//   - MEMBER cannot obtain another member's loan by manipulating IDs/API calls.
//   - ADMIN keeps seeing ALL users' active loans.
//   - Existing return approval workflow keeps working.
//
// Stubbed data layer with a miniature PostgREST emulator: whatever filter
// constraints the controller attaches are honored, so a missing/fail-open
// filter genuinely leaks rows and fails the test.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_tests_only';
const SECRET = process.env.JWT_SECRET;

const STATE_FILE = path.resolve(process.cwd(), 'hardware_requests_data.json');
const hadStateFile = fs.existsSync(STATE_FILE);
after(() => {
  if (!hadStateFile && fs.existsSync(STATE_FILE)) {
    fs.rmSync(STATE_FILE, { force: true });
  }
});

const dbModule = require('../dist/config/database.js');
const { authenticateToken, requireAdmin } = require('../dist/middleware/auth.middleware.js');
const {
  getBorrowHistory,
  returnItem,
  submitReturnRequestHandler,
} = require('../dist/modules/borrow/borrow.controller.js');
const { createReturnRequest } = require('../dist/modules/borrow/hardwareRequestService.js');

const fixtures = { borrows: [], inventory: null };
const captured = { or: [], eq: [], ins: [], tables: [] };

function resetFixtures() {
  fixtures.borrows = [
    {
      id: 'loan-A1', user_id: 'member-A', borrower_name: 'Alice', roll_number: 'RA1',
      borrower_email: 'a@cicr.test', inventory_id: 'item-1', quantity: 2,
      purpose: 'Bots', borrowed_at: '2026-01-01T00:00:00.000Z',
      due_date: '2026-01-08T00:00:00.000Z', status: 'BORROWED',
    },
    {
      id: 'loan-B1', user_id: 'member-B', borrower_name: 'Bob', roll_number: 'RB1',
      borrower_email: 'b@cicr.test', inventory_id: 'item-2', quantity: 1,
      purpose: 'Rover', borrowed_at: '2026-01-02T00:00:00.000Z',
      due_date: '2026-01-09T00:00:00.000Z', status: 'BORROWED',
    },
    {
      id: 'loan-A2', user_id: 'member-A', borrower_name: 'Alice', roll_number: 'RA1',
      borrower_email: 'a@cicr.test', inventory_id: 'item-1', quantity: 1,
      purpose: 'Done', borrowed_at: '2025-12-01T00:00:00.000Z',
      due_date: '2025-12-08T00:00:00.000Z', status: 'RETURNED',
      returned_at: '2025-12-05T00:00:00.000Z',
    },
    {
      id: 'loan-B2', user_id: 'member-B', borrower_name: 'Bob', roll_number: 'RB1',
      borrower_email: 'b@cicr.test', inventory_id: 'item-2', quantity: 3,
      purpose: 'Arm', borrowed_at: '2026-01-03T00:00:00.000Z',
      due_date: '2026-01-10T00:00:00.000Z', status: 'RETURN_REQUESTED',
    },
  ];
  fixtures.inventory = { id: 'item-1', quantity: 10, available_quantity: 6, name: 'Sensor' };
  captured.or.length = 0;
  captured.eq.length = 0;
  captured.ins.length = 0;
  captured.tables.length = 0;
}

function chain(table) {
  const c = { _table: table, _eq: [], _or: null, _in: [], _update: null };
  // NOTE: only single()/maybeSingle()/then() execute against the database;
  // mere query-builder construction must not count as a loan-table read.
  const markExecuted = () => { captured.tables.push(table); };
  c.select = () => c;
  c.order = () => c;
  c.limit = () => c;
  c.eq = (col, val) => { c._eq.push([col, val]); captured.eq.push(`${table}.${col}.eq.${val}`); return c; };
  c.neq = () => c;
  c.or = (s) => { c._or = s; captured.or.push(s); return c; };
  c.in = (col, vals) => { c._in.push([col, vals]); captured.ins.push(`${table}.${col}.in.${vals.join('|')}`); return c; };
  c.gte = () => c;
  c.lt = () => c;
  c.update = (data) => { c._update = data; return c; };
  c.insert = () => Promise.resolve({ error: null });
  const applyFilters = (rows) => rows.filter((r) => {
    for (const [col, val] of c._eq) {
      if (String(r[col]) !== String(val)) return false;
    }
    for (const [col, vals] of c._in) {
      if (!vals.map(String).includes(String(r[col]))) return false;
    }
    if (c._or) {
      const ok = c._or.split(',').some((br) => {
        const m = br.match(/^(\w+)\.eq\.(.*)$/);
        return m ? String(r[m[1]]) === String(m[2]) : false;
      });
      if (!ok) return false;
    }
    return true;
  });
  c.single = async () => {
    markExecuted();
    if (table === 'users') return { data: { id: 'any', token_version: 1 }, error: null };
    if (table === 'inventory') {
      if (c._update) Object.assign(fixtures.inventory, c._update);
      return { data: { ...fixtures.inventory }, error: null };
    }
    if (table === 'borrow_records') {
      const rows = applyFilters(fixtures.borrows);
      if (c._update) {
        if (!rows[0]) return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
        Object.assign(rows[0], c._update);
        return { data: { ...rows[0] }, error: null };
      }
      return rows[0]
        ? { data: { ...rows[0] }, error: null }
        : { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
    }
    return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
  };
  c.maybeSingle = async () => {
    markExecuted();
    if (table === 'borrow_records') {
      const rows = applyFilters(fixtures.borrows);
      return { data: rows[0] ? { ...rows[0] } : null };
    }
    if (table === 'inventory') return { data: { ...fixtures.inventory } };
    return { data: null };
  };
  c.then = (resolve) => {
    markExecuted();
    if (table === 'borrow_records') {
      return resolve({ data: applyFilters(fixtures.borrows).map((r) => ({ ...r })), error: null });
    }
    if (table === 'inventory') {
      if (c._update) Object.assign(fixtures.inventory, c._update);
      return resolve({ data: [{ ...fixtures.inventory }], error: null });
    }
    return resolve({ data: [], error: null });
  };
  return c;
}

dbModule.dbRead.from = (table) => chain(table);
dbModule.dbWrite.from = (table) => chain(table);

const sign = (payload) => jwt.sign(payload, SECRET, { expiresIn: '1h' });
const memberAToken = () => sign({ id: 'member-A', email: 'a@cicr.test', name: 'Alice', role: 'MEMBER', roll_number: 'RA1', tv: 1 });
const adminToken = () => sign({ id: 'admin-1', email: 'admin@cicr.test', name: 'Admin', role: 'ADMIN', tv: 1 });

const memberAUser = { id: 'member-A', email: 'a@cicr.test', name: 'Alice', role: 'MEMBER', roll_number: 'RA1' };
const adminUser = { id: 'admin-1', email: 'admin@cicr.test', name: 'Admin', role: 'ADMIN' };

function mockRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

async function authedHandler(token, handler, reqExtra) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {}, ...(reqExtra || {}) };
  const authRes = mockRes();
  let authed = false;
  await authenticateToken(req, authRes, () => { authed = true; });
  if (!authed) return { req, res: authRes, stage: 'authenticate' };
  const res = mockRes();
  await handler(req, res);
  return { req, res, stage: 'handler' };
}

const belongsToA = (r) => r.user_id === 'member-A' || r.roll_number === 'RA1';

// 1. Unauthenticated behavior remains correct.
test('M-8 unauthenticated borrow history stays 401', async () => {
  resetFixtures();
  const { res, stage } = await authedHandler(null, getBorrowHistory, { query: { force: 'true' } });
  assert.equal(stage, 'authenticate');
  assert.equal(res.statusCode, 401);
});

// 2. MEMBER receives only their own loans.
test('M-8 MEMBER history contains only own loans', async () => {
  resetFixtures();
  const res = mockRes();
  await getBorrowHistory({ user: { ...memberAUser }, query: { force: 'true' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.data.length > 0);
  for (const row of res.body.data) {
    assert.ok(belongsToA(row), `leaked row: ${JSON.stringify(row)}`);
  }
  assert.ok(!res.body.data.some((r) => r.user_id === 'member-B'));
  assert.ok(captured.or.some((s) => s.includes('member-A')));
});

// 3. MEMBER cannot see another member's loans (explicit cross-user check).
test('M-8 MEMBER history never includes another member loan ids', async () => {
  resetFixtures();
  const res = mockRes();
  await getBorrowHistory({ user: { ...memberAUser }, query: { force: 'true' } }, res);
  assert.equal(res.statusCode, 200);
  const ids = res.body.data.map((r) => r.id);
  assert.ok(!ids.includes('loan-B1') && !ids.includes('loan-B2'));
  assert.ok(ids.includes('loan-A1'));
});

// 4. Server-side active-loan selection (?status=BORROWED).
test('M-8 MEMBER ?status=BORROWED returns only own active loans', async () => {
  resetFixtures();
  const res = mockRes();
  await getBorrowHistory({ user: { ...memberAUser }, query: { force: 'true', status: 'BORROWED' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, 'loan-A1');
});

// 5. Hostile status value is rejected without querying loans.
test('M-8 hostile status value is rejected without querying loans', async () => {
  resetFixtures();
  const res = mockRes();
  await getBorrowHistory({ user: { ...memberAUser }, query: { force: 'true', status: 'BORROWED,inventory_id' } }, res);
  assert.equal(res.statusCode, 400);
  assert.ok(!captured.tables.includes('borrow_records'));
});

// 6. Identifier-less non-admin identity fails closed (never all loans).
test('M-8 identifier-less MEMBER gets empty history, not all loans', async () => {
  resetFixtures();
  const res = mockRes();
  await getBorrowHistory({ user: { role: 'MEMBER' }, query: { force: 'true' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 0);
  assert.deepEqual(res.body.data, []);
  assert.ok(!captured.tables.includes('borrow_records'), 'must not query loan rows without an owner identity');
});

// 7. MEMBER cannot pull another member's BORROWED loan via return-request.
test('M-8 MEMBER return-request for another member BORROWED loan is denied', async () => {
  resetFixtures();
  const { res, stage } = await authedHandler(memberAToken(), submitReturnRequestHandler, {
    body: { borrowId: 'loan-B1', returnQuantity: 1 },
  });
  assert.equal(stage, 'handler');
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /Access Denied/);
  assert.ok(!JSON.stringify(res.body).includes('b@cicr.test'));
});

// 8. MEMBER cannot pull another member's RETURN_REQUESTED loan via return-request.
test('M-8 MEMBER return-request for another member RETURN_REQUESTED loan is denied', async () => {
  resetFixtures();
  const direct = await createReturnRequest({
    borrowId: 'loan-B2', returnQuantity: 1,
    userId: 'member-A', userName: 'Alice', userEmail: 'a@cicr.test', userRoll: 'RA1', userRole: 'MEMBER',
  });
  assert.equal(direct.success, false);
  assert.match(direct.message, /Access Denied/);

  const { res, stage } = await authedHandler(memberAToken(), submitReturnRequestHandler, {
    body: { borrowId: 'loan-B2', returnQuantity: 1 },
  });
  assert.equal(stage, 'handler');
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /Access Denied/);
  assert.ok(!JSON.stringify(res.body).includes('b@cicr.test'));
});

// 9. ADMIN still sees active loans of multiple users.
test('M-8 ADMIN ?status=BORROWED sees active loans of multiple users', async () => {
  resetFixtures();
  const res = mockRes();
  await getBorrowHistory({ user: { ...adminUser }, query: { force: 'true', status: 'BORROWED' } }, res);
  assert.equal(res.statusCode, 200);
  const owners = new Set(res.body.data.map((r) => r.user_id));
  assert.ok(owners.has('member-A') && owners.has('member-B'));
  assert.equal(res.body.data.length, 2);
});

// 10. Existing return workflow still works (owner 202).
test('M-8 owner MEMBER return stays on 202 approval workflow', async () => {
  resetFixtures();
  const req = { headers: { authorization: `Bearer ${memberAToken()}` }, body: { borrow_id: 'loan-A1' } };
  const authRes = mockRes();
  let authed = false;
  await authenticateToken(req, authRes, () => { authed = true; });
  assert.equal(authed, true);
  const res = mockRes();
  await returnItem(req, res);
  assert.equal(res.statusCode, 202);
  assert.match(res.body.message, /Admin approval/);
});

// 11. ADMIN direct return still restocks inventory.
test('M-8 ADMIN direct return still restocks inventory', async () => {
  resetFixtures();
  const { res, stage } = await authedHandler(adminToken(), returnItem, { body: { borrow_id: 'loan-A1' } });
  assert.equal(stage, 'handler');
  assert.equal(res.statusCode, 200);
  assert.equal(fixtures.inventory.available_quantity, 8);
});

// 12. Authorization middleware behavior remains intact.
test('M-8 requireAdmin still rejects MEMBER and allows ADMIN', async () => {
  const denied = mockRes();
  requireAdmin({ user: { role: 'MEMBER' } }, denied, () => assert.fail('next should not be called'));
  assert.equal(denied.statusCode, 403);
  let called = false;
  requireAdmin({ user: { role: 'ADMIN' } }, mockRes(), () => { called = true; });
  assert.equal(called, true);
});
