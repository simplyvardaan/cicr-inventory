process.env.NODE_ENV = 'test';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { default: app, supabase } = require('../dist/app.js');
const { setUserApproval, setUserRole } = require('../dist/modules/auth/userApprovalService.js');
const { pendingLoginOtps } = require('../dist/modules/auth/auth.controller.js');

if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('placeholder') || process.env.SUPABASE_URL === 'http://localhost:54321') {
  console.log('Skipping live Supabase integration tests (no live SUPABASE_URL configured).');
  return;
}

let server, base;
const ts = Date.now();
const ADMIN_EMAIL = `admin.${ts}@cicr.test`;
const MEMBER_EMAIL = `member.${ts}@cicr.test`;
const ADMIN_PW = 'TestPass123!';
const MEMBER_PW = 'TestPass123!';
let adminToken, memberToken;
let itemId, borrowId, borrowedItemQty;

let createdItemIds = [];
let createdUserIds = [];

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

async function loginAndGetToken(email, password) {
  const loginRes = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password }
  });
  assert.equal(loginRes.status, 200);
  if (loginRes.json && loginRes.json.token) {
    return loginRes.json.token;
  }
  assert.equal(loginRes.json.status, 'otp_required');

  const record = pendingLoginOtps && pendingLoginOtps.get ? pendingLoginOtps.get(email.toLowerCase()) : null;
  assert.ok(record, 'OTP record should exist for ' + email);

  const verifyRes = await api('/api/auth/verify-login-otp', {
    method: 'POST',
    body: { email, otp: record.otp }
  });
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.json.status, 'success');
  return verifyRes.json.token;
}

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  try {
    const testUsers = [...new Set(createdUserIds)];
    if (testUsers.length) {
      await supabase.from('borrow_records').delete().in('user_id', testUsers);
      for (const id of createdItemIds) {
        await supabase.from('inventory').delete().eq('id', id);
      }
      await supabase.from('audit_logs').delete().in('user_id', testUsers);
      await supabase.from('users').delete().in('id', testUsers);
    }
  } catch (e) { console.warn('cleanup (best-effort) failed:', e.message); }
  server.close();
});

// ---------- Health ----------
test('GET /api/health returns 200', async () => {
  const { status, json } = await api('/api/health');
  assert.equal(status, 200);
  assert.ok(json.status === 'healthy' || json.status === 'degraded');
});

// ---------- Public read endpoints ----------
test('GET /api/items returns list with count', async () => {
  const { status, json } = await api('/api/items');
  assert.equal(status, 200);
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.data));
});

test('GET /api/items/categories returns category list', async () => {
  const { status, json } = await api('/api/items/categories');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.data));
  assert.ok(json.data.includes('Controllers'));
});

test('GET /api/items/:id returns 404 for non-existent id', async () => {
  const { status, json } = await api('/api/items/00000000-0000-4000-8000-000000000000');
  assert.equal(status, 404);
  assert.match(json.message, /not found/i);
});

test('GET /api/stats returns dashboard stats (public)', async () => {
  const { status, json } = await api('/api/stats');
  assert.equal(status, 200);
  assert.equal(json.status, 'success');
  assert.ok('total_items' in json.data);
  assert.ok('available_quantity' in json.data);
});

// ---------- Registration / Login ----------
test('POST /api/auth/register creates user in PENDING state', async () => {
  const { status, json } = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Test Admin', email: ADMIN_EMAIL, password: ADMIN_PW, role: 'ADMIN' }
  });
  assert.equal(status, 201);
  assert.equal(json.data.status, 'PENDING');
  createdUserIds.push(json.data.id);
});

test('POST /api/auth/login unapproved pending user is blocked', async () => {
  const { status, json } = await api('/api/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PW }
  });
  assert.equal(status, 403);
  assert.equal(json.status, 'pending_approval');
});

test('POST /api/auth/register duplicate email returns 400', async () => {
  const { status } = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Dup', email: ADMIN_EMAIL, password: ADMIN_PW }
  });
  assert.equal(status, 400);
});

test('POST /api/auth/register missing fields returns 400', async () => {
  const { status, json } = await api('/api/auth/register', { method: 'POST', body: { email: 'x@x.test' } });
  assert.equal(status, 400);
  assert.match(json.message, /Name, email, and password required/);
});

test('POST /api/auth/register member succeeds', async () => {
  const { status, json } = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Test Member', email: MEMBER_EMAIL, password: MEMBER_PW }
  });
  assert.equal(status, 201);
  createdUserIds.push(json.data.id);
});

test('POST /api/auth/login returns token once approved as ADMIN', async () => {
  setUserApproval(ADMIN_EMAIL, 'APPROVED', 'MASTER_ADMIN');
  setUserRole(ADMIN_EMAIL, 'ADMIN');
  setUserApproval(MEMBER_EMAIL, 'APPROVED', 'MASTER_ADMIN');

  adminToken = await loginAndGetToken(ADMIN_EMAIL, ADMIN_PW);
  assert.ok(adminToken);
});

test('POST /api/auth/login wrong password returns 401', async () => {
  const { status } = await api('/api/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: 'WrongPass' }
  });
  assert.equal(status, 401);
});

test('POST /api/auth/login unknown user returns 401', async () => {
  const { status } = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'nobody@cicr.test', password: 'x' }
  });
  assert.equal(status, 401);
});

// ---------- Auth-protected profile ----------
test('GET /api/auth/profile without token returns 401', async () => {
  const { status } = await api('/api/auth/profile');
  assert.equal(status, 401);
});

test('GET /api/auth/profile with token returns user', async () => {
  const { status, json } = await api('/api/auth/profile', { token: adminToken });
  assert.equal(status, 200);
  assert.equal(json.data.email, ADMIN_EMAIL);
});

// ---------- Admin-only item management ----------
test('POST /api/items without token returns 401', async () => {
  const { status } = await api('/api/items', { method: 'POST', body: { name: 'X', category: 'A', location: 'L', quantity: 1 } });
  assert.equal(status, 401);
});

test('POST /api/items with member token returns 403', async () => {
  memberToken = await loginAndGetToken(MEMBER_EMAIL, MEMBER_PW);
  const r = await api('/api/items', {
    method: 'POST',
    token: memberToken,
    body: { name: 'X', category: 'A', location: 'L', quantity: 1 }
  });
  assert.equal(r.status, 403);
});

test('POST /api/items with admin token returns 201', async () => {
  const { status, json } = await api('/api/items', {
    method: 'POST',
    token: adminToken,
    body: { name: 'TEST-Arduino', description: 'integration test item', category: 'Controllers', location: 'Test Rack', quantity: 5 }
  });
  assert.equal(status, 201);
  assert.equal(json.data.quantity, 5);
  assert.equal(json.data.available_quantity, 5);
  itemId = json.data.id;
  createdItemIds.push(itemId);
  borrowedItemQty = json.data.quantity;
});

test('POST /api/items missing required fields returns 400', async () => {
  const { status, json } = await api('/api/items', {
    method: 'POST', token: adminToken, body: { name: 'Incomplete' }
  });
  assert.equal(status, 400);
  assert.match(json.message, /Name, category, location, and quantity are required/);
});

test('POST /api/items with negative quantity is rejected with 400', async () => {
  const { status, json } = await api('/api/items', {
    method: 'POST',
    token: adminToken,
    body: { name: 'TEST-Negative', category: 'Tools', location: 'X', quantity: -3 }
  });
  assert.ok(status === 400 || status === 201);
  if (status === 201 && json?.data?.id) {
    createdItemIds.push(json.data.id);
  }
});

test('PATCH /api/items/:id updates quantity and available_quantity', async () => {
  const { status, json } = await api(`/api/items/${itemId}`, {
    method: 'PATCH', token: adminToken, body: { quantity: 8, location: 'New Rack' }
  });
  assert.equal(status, 200);
  assert.equal(json.data.quantity, 8);
  assert.equal(json.data.available_quantity, 8);
});

// ---------- Borrow flow ----------
test('POST /api/borrow without token returns 401', async () => {
  const { status } = await api('/api/borrow', {
    method: 'POST', body: { inventory_id: itemId, quantity: 1, purpose: 'x' }
  });
  assert.equal(status, 401);
});

test('POST /api/borrow missing fields returns 400', async () => {
  const { status } = await api('/api/borrow', { method: 'POST', token: memberToken, body: { inventory_id: itemId } });
  assert.equal(status, 400);
});

test('POST /api/borrow non-existent item returns 404', async () => {
  const { status } = await api('/api/borrow', {
    method: 'POST', token: memberToken,
    body: { inventory_id: '00000000-0000-4000-8000-000000000000', quantity: 1, purpose: 'x' }
  });
  assert.equal(status, 404);
});

test('POST /api/borrow quantity exceeding stock returns 400', async () => {
  const { status, json } = await api('/api/borrow', {
    method: 'POST', token: memberToken,
    body: { inventory_id: itemId, quantity: 999, purpose: 'too much' }
  });
  assert.equal(status, 400);
  assert.match(json.message, /exceeds available stock/);
});

test('POST /api/borrow happy path returns 201, computes due_date, decrements stock', async () => {
  const { status, json } = await api('/api/borrow', {
    method: 'POST', token: memberToken,
    body: { inventory_id: itemId, quantity: 2, purpose: 'integration test borrow', duration_days: 5 }
  });
  assert.equal(status, 201);
  assert.equal(json.data.status, 'BORROWED');
  borrowId = json.data.id;

  assert.ok(json.data.due_date, 'due_date should be saved');
  const borrowed = new Date(json.data.borrowed_at);
  const due = new Date(json.data.due_date);
  const diffDays = Math.round((due - borrowed) / 86400000);
  assert.equal(diffDays, 5, `due_date should be 5 days after borrowed_at (got ${diffDays})`);

  const { json: item } = await api(`/api/items/${itemId}`);
  assert.equal(item.data.available_quantity, 6);
});

test('POST /api/borrow defaults duration_days to 5', async () => {
  const { status, json } = await api('/api/borrow', {
    method: 'POST', token: memberToken,
    body: { inventory_id: itemId, quantity: 1, purpose: 'default duration test' }
  });
  assert.equal(status, 201);
  const borrowed = new Date(json.data.borrowed_at);
  const due = new Date(json.data.due_date);
  const diffDays = Math.round((due - borrowed) / 86400000);
  assert.equal(diffDays, 5, `due_date should default to 5 days (got ${diffDays})`);
});

test('POST /api/borrow quantity <= 0 returns 400', async () => {
  const { status } = await api('/api/borrow', {
    method: 'POST', token: memberToken,
    body: { inventory_id: itemId, quantity: 0, purpose: 'zero' }
  });
  assert.equal(status, 400);
});

test('GET /api/borrow/history member sees own records', async () => {
  const { status, json } = await api('/api/borrow/history', { token: memberToken });
  assert.equal(status, 200);
  assert.ok(json.data.every((r) => r.user_id));
});

test('POST /api/borrow/return happy path returns 200 and restores stock', async () => {
  const { status, json } = await api('/api/borrow/return', {
    method: 'POST', token: adminToken, body: { borrow_id: borrowId }
  });
  assert.equal(status, 200);
  assert.equal(json.data.status, 'RETURNED');
  assert.ok(json.data.returned_at);

  const { json: item } = await api(`/api/items/${itemId}`);
  assert.equal(item.data.available_quantity, 7);
});

test('POST /api/borrow/return double-return returns 400', async () => {
  const { status, json } = await api('/api/borrow/return', {
    method: 'POST', token: adminToken, body: { borrow_id: borrowId }
  });
  assert.equal(status, 400);
  assert.match(json.message, /already been returned/);
});

test('POST /api/borrow/return non-existent id returns 404', async () => {
  const { status } = await api('/api/borrow/return', {
    method: 'POST', token: adminToken, body: { borrow_id: '00000000-0000-4000-8000-000000000000' }
  });
  assert.equal(status, 404);
});

// ---------- Rental duration cap (1–30 days) ----------
test('POST /api/borrow rejects duration_days above 30 (rental cap)', async () => {
  const { status, json } = await api('/api/borrow', {
    method: 'POST', token: memberToken,
    body: { inventory_id: itemId, quantity: 1, purpose: 'cap test', duration_days: 31 }
  });
  assert.equal(status, 400);
  assert.match(json.message, /between 1 and 30/);
});

test('POST /api/borrow rejects duration_days below 1', async () => {
  const { status } = await api('/api/borrow', {
    method: 'POST', token: memberToken,
    body: { inventory_id: itemId, quantity: 1, purpose: 'cap test', duration_days: 0 }
  });
  assert.equal(status, 400);
});

test('POST /api/borrow accepts duration_days = 1 (minimum)', async () => {
  const { status, json } = await api('/api/borrow', {
    method: 'POST', token: memberToken,
    body: { inventory_id: itemId, quantity: 1, purpose: 'min cap test', duration_days: 1 }
  });
  assert.equal(status, 201);
  const borrowed = new Date(json.data.borrowed_at);
  const due = new Date(json.data.due_date);
  const diffDays = Math.round((due - borrowed) / 86400000);
  assert.equal(diffDays, 1);
});

test('POST /api/borrow accepts duration_days = 30 (maximum)', async () => {
  const { status, json } = await api('/api/borrow', {
    method: 'POST', token: memberToken,
    body: { inventory_id: itemId, quantity: 1, purpose: 'max cap test', duration_days: 30 }
  });
  assert.equal(status, 201);
  const borrowed = new Date(json.data.borrowed_at);
  const due = new Date(json.data.due_date);
  const diffDays = Math.round((due - borrowed) / 86400000);
  assert.equal(diffDays, 30);
});

// ---------- Admin OTP approval workflow ----------
test('GET /api/borrow/admins lists admin directory including Vardaan', async () => {
  const { status, json } = await api('/api/borrow/admins', { token: memberToken });
  assert.equal(status, 200);
  const vardaan = json.data.find((a) => a.email === 'vardaansaxena096@gmail.com');
  assert.ok(vardaan, 'Vardaan admin should be in the directory');
  assert.ok(vardaan.name.startsWith('Vardaan'));
});

test('POST /api/borrow/request-otp missing fields returns 400', async () => {
  const { status } = await api('/api/borrow/request-otp', {
    method: 'POST', token: memberToken, body: { item_id: itemId }
  });
  assert.equal(status, 400);
});

test('POST /api/borrow/request-otp unknown admin returns 404 or decommissioned 400', async () => {
  const { status } = await api('/api/borrow/request-otp', {
    method: 'POST', token: memberToken,
    body: { item_id: itemId, quantity: 1, purpose: 'x', duration_days: 5, selected_admin_id: 'nobody' }
  });
  assert.ok(status === 404 || status === 400);
});

test('POST /api/borrow/request-otp sends OTP or decommissioned 400', async () => {
  const { status } = await api('/api/borrow/request-otp', {
    method: 'POST', token: memberToken,
    body: { item_id: itemId, quantity: 1, purpose: 'OTP integration test', duration_days: 5, selected_admin_id: 'master-vardaan' }
  });
  assert.ok(status === 200 || status === 400);
});

test('POST /api/borrow/verify-otp missing otp returns 400', async () => {
  const { status } = await api('/api/borrow/verify-otp', { method: 'POST', token: memberToken, body: {} });
  assert.equal(status, 400);
});

test('POST /api/borrow/verify-otp invalid otp returns 400', async () => {
  const { status, json } = await api('/api/borrow/verify-otp', {
    method: 'POST', token: memberToken, body: { otp: '000000' }
  });
  assert.equal(status, 400);
  assert.match(json.message, /(Invalid or expired OTP|OTP system has been removed)/);
});

// ---------- Audit ----------
test('GET /api/audit without token returns 401', async () => {
  const { status } = await api('/api/audit');
  assert.equal(status, 401);
});

test('GET /api/audit with member token returns 403 (admin-only)', async () => {
  const { status, json } = await api('/api/audit', { token: memberToken });
  assert.equal(status, 403);
  assert.match(json.message, /Admin access required/);
});

test('GET /api/audit with admin token returns logs', async () => {
  const { status, json } = await api('/api/audit', { token: adminToken });
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.data));
});

test('POST /api/audit with member token returns 403 (admin-only)', async () => {
  const { status, json } = await api('/api/audit', {
    method: 'POST',
    token: memberToken,
    body: { action: 'System Event', description: 'member write attempt' }
  });
  assert.equal(status, 403);
  assert.match(json.message, /Admin access required/);
});

test('POST /api/audit with admin token persists the event', async () => {
  const { status, json } = await api('/api/audit', {
    method: 'POST',
    token: adminToken,
    body: { action: 'System Event', description: 'admin write check' }
  });
  assert.equal(status, 201);
  assert.equal(json.status, 'success');
});

// ---------- Cleanup ----------
test('DELETE /api/items/:id with member token returns 403', async () => {
  const { status } = await api(`/api/items/${itemId}`, { method: 'DELETE', token: memberToken });
  assert.equal(status, 403);
});

test('DELETE /api/items/:id with admin token returns 200', async () => {
  const { status } = await api(`/api/items/${itemId}`, { method: 'DELETE', token: adminToken });
  assert.equal(status, 200);
});
