import { Request, Response } from 'express';
import { dbWrite, dbRead } from '../../config/database';
import { AuthRequest } from '../../middleware/auth.middleware';
import {
  sendBorrowConfirmation,
  sendReturnConfirmation,
  sendOtpEmail,
  sendAdminBorrowNotification,
  sendAdminReturnNotification,
  SUPER_ADMIN_EMAILS
} from '../../services/emailService';
import { ADMIN_DIRECTORY, getAdminById, getAdminByEmail } from './adminDirectory';
import { generateOtp, storeOtp, verifyOtp as verifyOtpCode, consumeOtp } from './otpService';
import { cacheGetJSON, cacheSetJSON, cacheInvalidatePattern } from '../../config/redis';
import { invalidateItemsCache } from '../inventory/inventory.controller';

const ADMIN_DIRECTORY_CACHE_TTL = 60; // seconds
const BORROW_HISTORY_CACHE_TTL = 15; // 15 seconds cache to eliminate DB connection saturation

export const invalidateBorrowHistoryCache = async (): Promise<void> => {
  await cacheInvalidatePattern('cicr:cache:borrow:*');
};

export const MIN_RENTAL_DAYS = 1;
export const MAX_RENTAL_DAYS = 30;
export const DEFAULT_RENTAL_DAYS = 5;

// Fire-and-forget wrapper: catches and logs errors without blocking the response.
import { logAuditEvent } from '../../services/auditService';
import { escapeOrSegment } from '../../validators/postgrest';

function dispatchBackground(label: string, promise: Promise<unknown>): void {
  promise.catch((err) => console.error(`[BACKGROUND] ${label} failed:`, err));
}

// Helper function to insert into audit_logs
async function logAudit(action: string, userId: string | undefined, itemId: string | null, description: string) {
  const isUUID = (str?: string | null) => Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));
  await logAuditEvent({
    action,
    userId: isUUID(userId) ? userId : null,
    itemId: isUUID(itemId) ? itemId : null,
    description
  });
}

const parseRentalDays = (value: any): number | null => {
  if (value === undefined || value === null || value === '') return DEFAULT_RENTAL_DAYS;
  const days = Number(value);
  if (!Number.isInteger(days) || days < MIN_RENTAL_DAYS || days > MAX_RENTAL_DAYS) return null;
  return days;
};

const daysErrorMessage = `duration_days must be an integer between ${MIN_RENTAL_DAYS} and ${MAX_RENTAL_DAYS}.`;

export const finalizeBorrow = async (
  payload: {
    userId: string;
    userName: string;
    roll_number?: string | null;
    itemId: string;
    quantity: number;
    purpose: string;
    durationDays: number;
    dueDate?: string;
  }
) => {
  const { userId, userName, roll_number, itemId, quantity, purpose, durationDays, dueDate: customDueDate } = payload;

  // 1. Fetch item details (name, category, etc.)
  const { data: initialItem, error: itemErr } = await dbRead
    .from('inventory')
    .select('*')
    .eq('id', itemId)
    .single();

  if (itemErr || !initialItem) {
    return { error: { status: 404, message: 'Item not found.' } };
  }

  let item = initialItem;
  let newAvailableQty = 0;
  let grantedQuantity = quantity;

  // 2. Concurrency-safe atomic CAS loop: guarantees multiple parallel checkout/approvals don't overwrite each other
  let attempts = 0;
  const maxAttempts = 5;
  let updateSuccess = false;

  while (attempts < maxAttempts) {
    attempts++;
    const { data: freshItem, error: freshErr } = await dbRead
      .from('inventory')
      .select('*')
      .eq('id', itemId)
      .single();

    if (freshErr || !freshItem) {
      return { error: { status: 404, message: 'Item not found.' } };
    }
    item = freshItem;

    const currAvail = Number(freshItem.available_quantity) || 0;
    if (currAvail <= 0) {
      return {
        error: {
          status: 400,
          message: `Requested component "${freshItem.name}" has 0 available units in stock. Please wait for active loans to be returned.`
        }
      };
    }

    if (quantity > currAvail) {
      return {
        error: {
          status: 400,
          message: `Requested quantity (${quantity}) exceeds available stock (${currAvail}) for "${freshItem.name}".`
        }
      };
    }

    const actualQuantity = quantity;
    const calculatedRemaining = currAvail - actualQuantity;
    const { data: updatedRows, error: updateErr } = await dbWrite
      .from('inventory')
      .update({
        available_quantity: calculatedRemaining,
        updated_at: new Date().toISOString()
      })
      .eq('id', itemId)
      .eq('available_quantity', currAvail)
      .select('available_quantity');

    if (updateErr) return { error: { status: 500, message: updateErr.message } };

    if (updatedRows && updatedRows.length > 0) {
      newAvailableQty = updatedRows[0].available_quantity;
      grantedQuantity = actualQuantity;
      updateSuccess = true;
      break;
    }

    // Brief jitter backoff before retrying CAS
    await new Promise(res => setTimeout(res, 15 + Math.random() * 25));
  }

  if (!updateSuccess) {
    return {
      error: {
        status: 409,
        message: 'High inventory contention detected. Please retry request authorization.'
      }
    };
  }

  // 3. Create the borrow record.
  const borrowedAt = new Date();
  let dueDate: Date;
  if (customDueDate) {
    const parsed = new Date(customDueDate);
    if (!isNaN(parsed.getTime())) {
      dueDate = parsed;
    } else {
      dueDate = new Date(borrowedAt);
      dueDate.setDate(dueDate.getDate() + durationDays);
    }
  } else {
    dueDate = new Date(borrowedAt);
    dueDate.setDate(dueDate.getDate() + durationDays);
  }

  const isUUID = (str?: string) => Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));
  const safeUserId = isUUID(userId) ? userId : null;

  const { data: borrowRecord, error: borrowErr } = await dbWrite
    .from('borrow_records')
    .insert([
      {
        user_id: safeUserId,
        borrower_name: userName,
        roll_number: roll_number || null,
        inventory_id: itemId,
        quantity: Math.max(1, grantedQuantity),
        purpose,
        borrowed_at: borrowedAt.toISOString(),
        due_date: dueDate.toISOString(),
        status: 'BORROWED'
      }
    ])
    .select()
    .single();

  if (borrowErr) return { error: { status: 500, message: borrowErr.message } };

  await invalidateItemsCache(itemId);

  await logAudit('Borrowed', userId, itemId, `Borrowed ${Math.max(1, grantedQuantity)} units of "${item.name}" for purpose: ${purpose}${grantedQuantity < quantity ? ` (Queue auto-adjusted from ${quantity} requested)` : ''}`);

  return { borrowRecord, item, newAvailableQty, dueDate, grantedQuantity: Math.max(1, grantedQuantity), requestedQuantity: quantity };
};

// GET /api/borrow/admins (Admin directory) — cached 60s
export const getAdmins = async (req: Request, res: Response) => {
  const cacheKey = 'cicr:cache:admins';

  const cached = await cacheGetJSON(cacheKey);
  if (cached) {
    return res.status(200).json(cached);
  }

  const payload = {
    status: 'success',
    count: ADMIN_DIRECTORY.length,
    data: ADMIN_DIRECTORY
  };
  await cacheSetJSON(cacheKey, payload, ADMIN_DIRECTORY_CACHE_TTL);
  return res.status(200).json(payload);
};

// POST /api/borrow (Borrow Item)
export const borrowItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.body.borrower_email || req.user?.email || process.env.DEFAULT_SENDER_EMAIL || process.env.SMTP_USER || 'cicrinventory@gmail.com';
    const userName = req.body.borrower_name || req.user?.name || 'Borrower';
    const userRoll = req.body.roll_number || req.user?.roll_number || null;
    const inventory_id = req.body.inventory_id || req.body.itemId || req.body.item_id;
    const { quantity, purpose } = req.body;

    if (!inventory_id || !quantity || !purpose) {
      return res.status(400).json({ status: 'error', message: 'inventory_id, quantity, and purpose are required.' });
    }

    const qty = Number(quantity);
    if (qty <= 0) {
      return res.status(400).json({ status: 'error', message: 'Quantity must be greater than 0.' });
    }

    const days = parseRentalDays(req.body.duration_days);
    if (days === null) {
      return res.status(400).json({ status: 'error', message: daysErrorMessage });
    }

    const result = await finalizeBorrow({
      userId: userId || '',
      userName,
      roll_number: userRoll,
      itemId: inventory_id,
      quantity: qty,
      purpose,
      durationDays: days,
      dueDate: req.body.dueDate || req.body.due_date
    });
    if (result.error) {
      return res.status(result.error.status).json({ status: 'error', message: result.error.message });
    }

    const { borrowRecord, item, newAvailableQty, dueDate } = result;

    if (userEmail) {
      const { data: activeHolders } = await dbRead
        .from('borrow_records')
        .select('borrower_name, roll_number, quantity, borrowed_at')
        .eq('inventory_id', inventory_id)
        .eq('status', 'BORROWED')
        .neq('id', borrowRecord.id);

      dispatchBackground('borrow-confirmation', sendBorrowConfirmation(userEmail, userName, {
        itemName: item.name,
        category: item.category,
        quantity: qty,
        remainingStock: newAvailableQty,
        holders: activeHolders || [],
        durationDays: days,
        dueDate
      }));
    }

    // Instant notification to all superadmins
    dispatchBackground('admin-borrow-alert', sendAdminBorrowNotification(SUPER_ADMIN_EMAILS, {
      borrowerName: userName,
      borrowerEmail: userEmail || 'N/A',
      rollNumber: userRoll,
      itemName: item.name,
      category: item.category,
      quantity: qty,
      remainingStock: newAvailableQty,
      purpose,
      durationDays: days,
      dueDate
    }));

    return res.status(201).json({
      status: 'success',
      message: 'Item borrowed successfully!',
      data: borrowRecord
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/borrow/request-otp (DECOMMISSIONED - NO OTP SYSTEM)
export const requestOtp = async (req: AuthRequest, res: Response) => {
  return res.status(400).json({
    status: 'error',
    message: 'OTP system has been removed. Issue requests are submitted directly and authorized by Admins in the portal.'
  });
};

// POST /api/borrow/verify-otp (DECOMMISSIONED - NO OTP SYSTEM)
export const verifyOtp = async (req: AuthRequest, res: Response) => {
  return res.status(400).json({
    status: 'error',
    message: 'OTP system has been removed. Issue requests are submitted directly and authorized by Admins in the portal.'
  });
};

// POST /api/borrow/return (Return Item)
// POST /api/borrow/return-request (Member submits a return request for admin approval)
export const submitReturnRequestHandler = async (req: AuthRequest, res: Response) => {
  try {
    const borrowId = req.body.borrow_id || req.body.borrowId || req.body.id;
    const itemId = req.body.itemId || req.body.item_id || req.body.inventory_id;
    const returnQuantity = Number(req.body.returnQuantity || req.body.return_quantity || req.body.quantity) || 1;

    if (!borrowId && !itemId) {
      return res.status(400).json({ status: 'error', message: 'borrowId or itemId is required.' });
    }

    const { createReturnRequest } = await import('./hardwareRequestService');
    const result = await createReturnRequest({
      borrowId,
      itemId,
      returnQuantity,
      userId: req.user?.id,
      userName: req.user?.name,
      userEmail: req.user?.email,
      userRoll: req.user?.roll_number || undefined,
      userRole: req.user?.role || undefined
    });

    if (!result.success) {
      const isForbidden = result.message?.includes('Access Denied');
      return res.status(isForbidden ? 403 : 400).json({ status: 'error', message: result.message || 'Failed to submit return request.' });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Return request submitted successfully. Awaiting Administrator verification.',
      data: result.request
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/borrow/bulk-return-request (Return multiple components in 1 go)
export const submitBulkReturnRequestHandler = async (req: AuthRequest, res: Response) => {
  try {
    const rawItems = req.body.items || req.body.returns;
    if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({ status: 'error', message: 'An array of items to return is required.' });
    }

    const { createBulkReturnRequest } = await import('./hardwareRequestService');
    const result = await createBulkReturnRequest({
      userId: req.user?.id,
      userName: req.user?.name,
      userEmail: req.user?.email,
      userRoll: req.user?.roll_number || undefined,
      userRole: req.user?.role || undefined,
      items: rawItems
    });

    if (!result.success) {
      return res.status(400).json({ status: 'error', message: result.message || 'Failed to submit consolidated return.' });
    }

    return res.status(201).json({
      status: 'success',
      message: result.message || 'Consolidated return requests submitted for administrator approval.',
      count: result.count,
      data: result.requests
    });
  } catch (err: any) {
    console.error('Error in bulk return request:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/borrow/return (Return Item - Admin direct return or automatic routing)
export const returnItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const borrow_id = req.body.borrow_id || req.body.borrowId || req.body.id;
    const itemId = req.body.itemId || req.body.item_id || req.body.inventory_id;

    if (!borrow_id && !itemId) {
      return res.status(400).json({ status: 'error', message: 'borrow_id or itemId is required.' });
    }

    // If the request comes from a regular MEMBER, route to return approval workflow!
    if (userRole !== 'ADMIN') {
      const { createReturnRequest } = await import('./hardwareRequestService');
      const result = await createReturnRequest({
        borrowId: borrow_id,
        itemId,
        returnQuantity: Number(req.body.returnQuantity || req.body.return_quantity || req.body.quantity) || 1,
        userId,
        userName: req.user?.name,
        userEmail: req.user?.email,
        userRoll: req.user?.roll_number || undefined,
        userRole: userRole
      });

      if (!result.success) {
        return res.status(400).json({ status: 'error', message: result.message || 'Failed to submit return request.' });
      }

      return res.status(202).json({
        status: 'success',
        message: 'Return request submitted for Admin approval. An administrator will inspect and confirm the return.',
        data: result.request
      });
    }

    // 1. Fetch borrow record (read pool)
    const { data: record, error: recordErr } = await dbRead
      .from('borrow_records')
      .select('*, inventory(name, available_quantity)')
      .eq('id', borrow_id)
      .single();

    if (recordErr || !record) {
      return res.status(404).json({ status: 'error', message: 'Borrow record not found.' });
    }

    if (record.status === 'RETURNED') {
      return res.status(400).json({ status: 'error', message: 'Item has already been returned.' });
    }

    const returnTimestamp = new Date();
    const qtyToReturn = Math.max(1, Math.min(Number(req.body.returnQuantity || req.body.return_quantity) || record.quantity, record.quantity));
    const isFullReturn = qtyToReturn >= record.quantity;

    let updatedRecord: any = null;

    if (isFullReturn) {
      // Full return: mark status as RETURNED
      const { data: updated, error: updateRecordErr } = await dbWrite
        .from('borrow_records')
        .update({
          status: 'RETURNED',
          returned_at: returnTimestamp.toISOString()
        })
        .eq('id', borrow_id)
        .eq('status', 'BORROWED')
        .select()
        .single();

      if (updateRecordErr) throw updateRecordErr;
      updatedRecord = updated;
    } else {
      // Partial return: decrement active borrowed quantity
      const { data: updated, error: updateRecordErr } = await dbWrite
        .from('borrow_records')
        .update({
          quantity: record.quantity - qtyToReturn
        })
        .eq('id', borrow_id)
        .eq('status', 'BORROWED')
        .select()
        .single();

      if (updateRecordErr) throw updateRecordErr;
      updatedRecord = updated;
    }

    if (!updatedRecord) {
      return res.status(400).json({ status: 'error', message: 'Item has already been returned or modified.' });
    }

    // 3. Restore available_quantity with the same concurrency-safe CAS retry
    // loop used by finalizeBorrow: re-read the row, recompute the restore,
    // and only write when available_quantity still equals the value read.
    // This prevents concurrent returns/borrows from overwriting each other.
    let restockAttempts = 0;
    const maxRestockAttempts = 5;
    let restockSuccess = false;

    while (restockAttempts < maxRestockAttempts && !restockSuccess) {
      restockAttempts++;
      const { data: currentItem, error: itemErr } = await dbRead
        .from('inventory')
        .select('quantity, available_quantity')
        .eq('id', record.inventory_id)
        .single();

      if (itemErr || !currentItem) {
        return res.status(404).json({ status: 'error', message: 'Item not found.' });
      }

      const totalStock = Number(currentItem.quantity) || 1;
      const currentAvail = Number(currentItem.available_quantity) || 0;
      const restoredQty = Math.min(totalStock, currentAvail + qtyToReturn);

      const { data: restoredRows, error: restoreErr } = await dbWrite
        .from('inventory')
        .update({ available_quantity: restoredQty, updated_at: new Date().toISOString() })
        .eq('id', record.inventory_id)
        .eq('available_quantity', currentAvail)
        .select('available_quantity');

      if (restoreErr) throw restoreErr;

      if (restoredRows && restoredRows.length > 0) {
        restockSuccess = true;
        break;
      }

      // Brief jitter backoff before retrying CAS
      await new Promise((restockRes) => setTimeout(restockRes, 15 + Math.random() * 25));
    }

    if (!restockSuccess) {
      return res.status(409).json({
        status: 'error',
        message: 'High inventory contention detected. Please retry the return.'
      });
    }

    await invalidateItemsCache(record.inventory_id);

    // 4. Audit Log
    const itemName = record.inventory?.name || record.inventory_id;
    await logAudit('Returned', userId, record.inventory_id, `Returned ${qtyToReturn} units of "${itemName}"`);

    // 5. Send Return Confirmation Receipt Email to actual borrower
    let borrowerEmail = '';
    let borrowerName = record.borrower_name || 'Borrower';
    if (record.user_id) {
      try {
        const { data: u } = await dbRead.from('users').select('email, name, roll_number').eq('id', record.user_id).maybeSingle();
        if (u) {
          if (u.email && !u.email.toLowerCase().startsWith('student@')) borrowerEmail = u.email;
          if (u.name) borrowerName = u.name;
          if (!borrowerEmail && u.roll_number) borrowerEmail = `${u.roll_number}@mail.jiit.ac.in`;
        }
      } catch {}
    }
    if (!borrowerEmail && record.roll_number) {
      borrowerEmail = `${record.roll_number}@mail.jiit.ac.in`;
    }
    if (!borrowerEmail && req.user?.email && req.user?.role !== 'ADMIN') {
      borrowerEmail = req.user.email;
      borrowerName = req.user.name || borrowerName;
    }

    if (borrowerEmail) {
      dispatchBackground('return-confirmation', sendReturnConfirmation(borrowerEmail, borrowerName, itemName, returnTimestamp));
    }

    // 6. Instant notification to all superadmins
    dispatchBackground('admin-return-alert', sendAdminReturnNotification(SUPER_ADMIN_EMAILS, {
      borrowerName,
      borrowerEmail: borrowerEmail || 'N/A',
      itemName,
      quantity: qtyToReturn,
      returnedAt: returnTimestamp
    }));

    invalidateBorrowHistoryCache().catch(() => {});

    return res.status(200).json({
      status: 'success',
      message: `Successfully returned ${qtyToReturn} units of "${itemName}".`,
      data: updatedRecord
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /api/borrow/history (Borrow History with caching)
export const getBorrowHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const force = req.query.force === 'true';

    const cacheKey = `cicr:cache:borrow:history:${userRole === 'ADMIN' ? 'all' : (userId || 'anon')}`;
    if (!force) {
      const cached = await cacheGetJSON<{ status: string; count: number; data: any[] }>(cacheKey);
      if (cached) {
        return res.status(200).json(cached);
      }
    }

    let query = dbRead
      .from('borrow_records')
      .select('*')
      .order('borrowed_at', { ascending: false });

    // Members see only their own history; Admins see all
    if (userRole !== 'ADMIN') {
      const userRoll = req.user?.roll_number;
      const userName = req.user?.name;
      if (userId && userRoll) {
        query = query.or(`user_id.eq.${escapeOrSegment(userId)},roll_number.eq.${escapeOrSegment(userRoll)}`);
      } else if (userId) {
        query = query.eq('user_id', userId);
      } else if (userRoll) {
        query = query.eq('roll_number', userRoll);
      } else if (userName) {
        query = query.eq('borrower_name', userName);
      }
    }

    const { data: records, error } = await query;
    if (error) throw error;

    // Resolve related users and items manually
    const userIds = [...new Set((records || []).map((r: any) => r.user_id).filter(Boolean))];
    const itemIds = [...new Set((records || []).map((r: any) => r.inventory_id).filter(Boolean))];

    const [usersRes, itemsRes] = await Promise.all([
      userIds.length
        ? dbRead.from('users').select('id, name, email, roll_number').in('id', userIds)
        : Promise.resolve({ data: [] }),
      itemIds.length
        ? dbRead.from('inventory').select('id, name, category, image').in('id', itemIds)
        : Promise.resolve({ data: [] })
    ]);

    const userMap = Object.fromEntries((usersRes.data || []).map((u: any) => [u.id, u]));
    const itemMap = Object.fromEntries((itemsRes.data || []).map((i: any) => [i.id, i]));

    const history = (records || []).map((r: any) => ({
      ...r,
      users: userMap[r.user_id] || null,
      inventory: itemMap[r.inventory_id] || null
    }));

    const payload = { status: 'success', count: history.length, data: history };
    await cacheSetJSON(cacheKey, payload, BORROW_HISTORY_CACHE_TTL);

    return res.status(200).json(payload);
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const getBorrowLedger = async (req: AuthRequest, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const cacheKey = 'cicr:cache:borrow:ledger:all';

    if (!force) {
      const cached = await cacheGetJSON<{ status: string; count: number; data: any[] }>(cacheKey);
      if (cached) {
        return res.status(200).json(cached);
      }
    }

    const { data: records, error } = await dbRead
      .from('borrow_records')
      .select('*')
      .order('borrowed_at', { ascending: false });

    if (error) throw error;

    const userIds = [...new Set((records || []).map((r: any) => r.user_id).filter(Boolean))];
    const itemIds = [...new Set((records || []).map((r: any) => r.inventory_id).filter(Boolean))];

    // Query audit logs to accurately determine the admin who authorized each issue / return
    const { data: auditLogs } = await dbRead
      .from('audit_logs')
      .select('action, user_id, item_id, description, timestamp')
      .in('action', ['Hardware Approved', 'Approved Return'])
      .order('timestamp', { ascending: false });

    const auditUserIds = [...new Set((auditLogs || []).map((a: any) => a.user_id).filter(Boolean))];
    const allUserIds = [...new Set([...userIds, ...auditUserIds])];

    const [usersRes, itemsRes] = await Promise.all([
      allUserIds.length
        ? dbRead.from('users').select('id, name, email, roll_number').in('id', allUserIds)
        : Promise.resolve({ data: [] }),
      itemIds.length
        ? dbRead.from('inventory').select('id, name, category, image').in('id', itemIds)
        : Promise.resolve({ data: [] })
    ]);

    const userMap = Object.fromEntries((usersRes.data || []).map((u: any) => [u.id, u]));
    const itemMap = Object.fromEntries((itemsRes.data || []).map((i: any) => [i.id, i]));

    const { getRequestByBorrowIdOrItem } = await import('./hardwareRequestService');
    const { getAdminByEmail } = await import('./adminDirectory');

    const ledger = (records || []).map((r: any) => {
      let adminApprover: string | null = null;
      const borrowerEmail = userMap[r.user_id]?.email || (r.roll_number ? `${r.roll_number}@mail.jiit.ac.in` : undefined);
      const matchedReq = getRequestByBorrowIdOrItem(r.id, r.inventory_id, r.borrower_name, borrowerEmail);

      if (matchedReq?.reviewedBy && matchedReq.reviewedBy !== 'ADMIN' && matchedReq.reviewedBy !== 'SYSTEM_MASTER' && matchedReq.reviewedBy !== 'User') {
        adminApprover = matchedReq.reviewedBy;
      }

      if (!adminApprover && auditLogs) {
        const matchingLog = auditLogs.find((al: any) => {
          if (r.status === 'RETURNED' && (al.action === 'Approved Return' || al.action === 'Return Approved') && al.item_id === r.inventory_id) {
            if (r.borrower_name && al.description?.includes(r.borrower_name)) return true;
            return true;
          }
          if ((al.action === 'Hardware Approved' || al.action === 'Approved Request') && al.item_id === r.inventory_id) {
            if (r.borrower_name && al.description?.includes(r.borrower_name)) return true;
          }
          return false;
        });

        if (matchingLog) {
          const nameMatch = matchingLog.description?.match(/Admin\s+([^,]+?)\s+(approved|rejected|authorized|verified)/i);
          if (nameMatch && nameMatch[1] && nameMatch[1].trim() !== 'ADMIN' && nameMatch[1].trim() !== 'Admin Team') {
            adminApprover = nameMatch[1].trim();
          } else if (matchingLog.user_id && userMap[matchingLog.user_id]?.name) {
            adminApprover = userMap[matchingLog.user_id].name;
          }
        }
      }

      // If still missing or generic, attribute to verified lab administrator
      if (!adminApprover || adminApprover === 'ADMIN' || adminApprover === 'Admin Team' || adminApprover === 'Admin') {
        adminApprover = process.env.DEFAULT_ADMIN_NAME || 'Lab Administrator';
      }

      return {
        ...r,
        admin_approved_by: adminApprover,
        users: userMap[r.user_id] || null,
        inventory: itemMap[r.inventory_id] || null
      };
    });

    const payload = { status: 'success', count: ledger.length, data: ledger };
    await cacheSetJSON(cacheKey, payload, BORROW_HISTORY_CACHE_TTL);

    return res.status(200).json(payload);
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// DELETE /api/borrow/ledger/:id (Admin permanently deletes a ledger log entry)
export const deleteLedgerRecord = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const adminName = (req.user as any)?.username || req.user?.name || req.user?.email || 'ADMIN';

    if (!id) {
      return res.status(400).json({ status: 'error', message: 'Record ID is required.' });
    }

    // 1. Fetch the record details for audit logging
    const { data: record } = await dbRead
      .from('borrow_records')
      .select('*, inventory(name)')
      .eq('id', id)
      .maybeSingle();

    // 2. Permanently delete from borrow_records
    const { error: deleteErr } = await dbWrite
      .from('borrow_records')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      return res.status(500).json({ status: 'error', message: deleteErr.message });
    }

    // 3. Invalidate caches
    await invalidateBorrowHistoryCache();

    // 4. Record audit log
    const itemName = record?.inventory?.name || record?.inventory_id || 'Hardware Component';
    const borrower = record?.borrower_name || 'Borrower';
    await logAudit(
      'Ledger Record Deleted',
      userId,
      record?.inventory_id || null,
      `Admin ${adminName} permanently deleted ledger log entry #${id} for ${borrower} ("${itemName}")`
    );

    return res.status(200).json({
      status: 'success',
      message: 'Ledger record permanently deleted from database.'
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// ==========================================
// HARDWARE ISSUE REQUEST HANDLERS (ADMIN PORTAL QUEUE)
// ==========================================

export const createHardwareRequestHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email || req.body.email || req.body.borrowerEmail;
    const userName = req.user?.name || req.body.name || req.body.borrowerName;
    const rollNumber = req.user?.roll_number || req.body.roll || req.body.roll_number;
    const itemId = req.body.itemId || req.body.inventory_id || req.body.item_id;
    const itemName = req.body.itemName;
    const quantity = Number(req.body.quantity || req.body.qty || 1);
    const purpose = req.body.purpose;
    const durationDays = req.body.duration_days || req.body.durationDays || 7;
    const dueDate = req.body.dueDate || req.body.due_date;

    if (!itemId || !quantity || !purpose) {
      return res.status(400).json({ status: 'error', message: 'itemId, quantity, and purpose are required.' });
    }

    if (quantity <= 0 || isNaN(quantity)) {
      return res.status(400).json({ status: 'error', message: 'Quantity must be greater than zero.' });
    }

    if (!userName || !userEmail) {
      return res.status(400).json({ status: 'error', message: 'Borrower name and email are required.' });
    }

    const { createHardwareRequest } = await import('./hardwareRequestService');
    const requestRecord = await createHardwareRequest({
      itemId,
      itemName,
      borrowerName: userName,
      borrowerEmail: userEmail,
      rollNumber,
      userId,
      quantity,
      purpose,
      durationDays,
      dueDate
    });

    logAudit(
      'Hardware Requested',
      userId,
      itemId,
      `${userName} (${userEmail}) requested ${quantity}x "${requestRecord.itemName || 'hardware'}" for purpose: ${purpose}`
    );

    return res.status(201).json({
      status: 'success',
      message: 'Component issue request queued for Admin approval.',
      data: requestRecord
    });
  } catch (err: any) {
    console.error('Error creating hardware request:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const submitBulkHardwareRequestHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email || req.body.email || req.body.borrowerEmail;
    const userName = req.user?.name || req.body.name || req.body.borrowerName;
    const rollNumber = req.user?.roll_number || req.body.roll || req.body.roll_number;
    const purpose = req.body.purpose || 'Project Work';
    const durationDays = Number(req.body.duration_days || req.body.durationDays) || 7;
    const dueDate = req.body.dueDate || req.body.due_date;
    const items = req.body.items || req.body.cart || [];

    if (!userName || !userEmail) {
      return res.status(400).json({ status: 'error', message: 'Borrower name and email are required.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No items provided in request cart.' });
    }

    const { createBulkHardwareRequest } = await import('./hardwareRequestService');
    const result = await createBulkHardwareRequest({
      userId,
      userName,
      userEmail,
      rollNumber,
      purpose,
      durationDays,
      dueDate,
      items: items.map((it: any) => ({
        itemId: it.itemId || it.inventory_id || it.item_id || it.id,
        itemName: it.itemName || it.name,
        quantity: Number(it.quantity || it.qty || 1)
      }))
    });

    if (!result.success) {
      return res.status(400).json({ status: 'error', message: result.message || 'Failed to submit hardware requests.' });
    }

    logAudit(
      'Bulk Hardware Requested',
      userId,
      null,
      `${userName} (${userEmail}) checked out cart with ${result.count} items for purpose: ${purpose}`
    );

    return res.status(201).json({
      status: 'success',
      message: result.message,
      count: result.count,
      data: result.requests
    });
  } catch (err: any) {
    console.error('Error submitting bulk hardware request:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const getHardwareRequestsHandler = async (req: AuthRequest, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const userRole = req.user?.role;

    // Admins see the full pending queue. Members see ONLY their own requests,
    // across every status (PENDING / APPROVED / REJECTED) so they get in-app
    // feedback when an administrator approves or rejects their request.
    if (userRole !== 'ADMIN') {
      const { getUserHardwareRequests } = await import('./hardwareRequestService');
      const ownRequests = await getUserHardwareRequests({
        userId: req.user?.id,
        email: req.user?.email,
        rollNumber: req.user?.roll_number
      });
      return res.status(200).json({
        status: 'success',
        count: ownRequests.length,
        data: ownRequests
      });
    }

    const { getAllHardwareRequests } = await import('./hardwareRequestService');
    const requests = await getAllHardwareRequests(force);
    return res.status(200).json({
      status: 'success',
      count: requests.length,
      data: requests
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const approveHardwareRequestHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const adminName = req.body?.adminName || req.body?.reviewedBy || (req.user?.name && req.user.name !== 'User' && req.user.name !== 'ADMIN' ? req.user.name : null) || (req.user?.email ? getAdminByEmail(req.user.email)?.name : null) || process.env.DEFAULT_ADMIN_NAME || 'Lab Administrator';
    const adminEmail = req.user?.email || process.env.DEFAULT_SENDER_EMAIL || process.env.SMTP_USER || 'cicrinventory@gmail.com';

    const { approveHardwareRequest } = await import('./hardwareRequestService');
    const result = await approveHardwareRequest(id, adminName, adminEmail, req.body);

    if (!result.success) {
      return res.status(400).json({ status: 'error', message: result.error });
    }

    invalidateBorrowHistoryCache().catch(() => {});

    logAudit(
      'Hardware Approved',
      req.user?.id,
      result.request?.itemId || null,
      `Admin ${adminName} approved hardware issue for ${result.request?.borrowerName} (${result.request?.itemName || 'item'} x${result.request?.quantity})`
    );

    return res.status(200).json({
      status: 'success',
      message: `Hardware request ${id} approved and checked out.`,
      data: result.request
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const rejectHardwareRequestHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminName = req.body?.adminName || req.body?.reviewedBy || (req.user?.name && req.user.name !== 'User' && req.user.name !== 'ADMIN' ? req.user.name : null) || (req.user?.email ? getAdminByEmail(req.user.email)?.name : null) || process.env.DEFAULT_ADMIN_NAME || 'Lab Administrator';
    const adminEmail = req.user?.email || process.env.DEFAULT_SENDER_EMAIL || process.env.SMTP_USER || 'cicrinventory@gmail.com';

    const { rejectHardwareRequest } = await import('./hardwareRequestService');
    const result = await rejectHardwareRequest(id, adminName, adminEmail, reason, req.body);

    if (!result.success) {
      return res.status(400).json({ status: 'error', message: result.error });
    }

    invalidateBorrowHistoryCache().catch(() => {});

    logAudit(
      'Hardware Rejected',
      req.user?.id,
      result.request?.itemId || null,
      `Admin ${adminName} rejected hardware request for ${result.request?.borrowerName} (${result.request?.itemName || 'item'}): ${reason || 'Declined by Administrator.'}`
    );

    return res.status(200).json({
      status: 'success',
      message: `Hardware request ${id} rejected.`,
      data: result.request
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

export const returnAllLoansHandler = async (req: AuthRequest, res: Response) => {
  try {
    const nowIso = new Date().toISOString();
    // 1. Mark all active borrow records as RETURNED
    await dbWrite
      .from('borrow_records')
      .update({ status: 'RETURNED', returned_at: nowIso })
      .neq('status', 'RETURNED');

    // 2. Restock all items in inventory table
    const { data: allItems } = await dbRead
      .from('inventory')
      .select('id, quantity, available_quantity');

    if (allItems) {
      for (const item of allItems) {
        const total = Number(item.quantity) || 0;
        if (Number(item.available_quantity) !== total) {
          await dbWrite
            .from('inventory')
            .update({ available_quantity: total, updated_at: nowIso })
            .eq('id', item.id);
        }
      }
    }

    // 3. Update active requests
    try {
      const { getAllHardwareRequests, invalidateHardwareRequestsCache } = await import('./hardwareRequestService');
      const allReqs = await getAllHardwareRequests(true);
      for (const r of allReqs) {
        if (r.status === 'PENDING') {
          (r as any).status = 'APPROVED';
          r.reviewedAt = nowIso;
          r.reviewedBy = req.user?.name || 'Administrator';
        }
      }
      invalidateHardwareRequestsCache();
    } catch {}

    logAudit(
      'All Loans Returned',
      req.user?.id,
      null,
      `Admin ${req.user?.name || 'Administrator'} returned all active loans and restocked all components in Vault.`
    );

    invalidateBorrowHistoryCache().catch(() => {});

    return res.status(200).json({
      status: 'success',
      message: 'All loans have been returned and all inventory components are 100% restocked.'
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

