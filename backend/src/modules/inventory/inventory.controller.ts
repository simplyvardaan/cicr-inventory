import { Request, Response } from 'express';
import { dbWrite, dbRead } from '../../config/database';
import { AuthRequest } from '../../middleware/auth.middleware';
import { cacheGetJSON, cacheSetJSON, cacheInvalidate, cacheInvalidatePattern } from '../../config/redis';
import { sendAdminItemCreatedNotification, sendAdminItemDeletedNotification } from '../../services/emailService';
import { logAuditEvent } from '../../services/auditService';
import { escapeLikePattern, escapeOrSegment } from '../../validators/postgrest';

const ITEMS_LIST_CACHE_TTL = 30; // seconds
const ITEMS_ITEM_CACHE_TTL = 30;

const itemsListCacheKey = (category: unknown, search: unknown): string =>
  `cicr:cache:items:list:${String(category ?? '')}:${String(search ?? '')}`;

const itemsIdCacheKey = (id: string): string => `cicr:cache:items:id:${id}`;

export const invalidateItemsCache = async (id?: string): Promise<void> => {
  await cacheInvalidatePattern('cicr:cache:items:*');
  if (id) await cacheInvalidate(itemsIdCacheKey(id));
};

// Helper function to log actions in audit_logs
async function logAudit(action: string, userId: string | undefined, itemId: string | null, description: string) {
  await logAuditEvent({ action, userId, itemId, description });
}

// GET /api/items (Search, Filter by Category, Get All) — cached 30s, read pool
export const getItems = async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const { category, search } = req.query;
    const cacheKey = itemsListCacheKey(category, search);

    const cached = await cacheGetJSON(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    let query = dbRead.from('inventory').select('*').order('created_at', { ascending: false });

    if (category) {
      const catStr = String(category).trim();
      if (catStr.toLowerCase() === 'microcontrollers' || catStr.toLowerCase() === 'mcu') {
        query = query.ilike('category', '%controller%');
      } else {
        query = query.ilike('category', `%${escapeLikePattern(catStr)}%`);
      }
    }

    if (search) {
      query = query.or(`name.ilike.%${escapeOrSegment(search)}%,description.ilike.%${escapeOrSegment(search)}%,location.ilike.%${escapeOrSegment(search)}%`);
    }

    const { data: items, error } = await query;
    if (error) throw error;

    const payload = { status: 'success', count: items.length, data: items };
    await cacheSetJSON(cacheKey, payload, ITEMS_LIST_CACHE_TTL);
    return res.status(200).json(payload);
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /api/items/categories (List distinct categories)
export const getCategories = async (req: Request, res: Response) => {
  try {
    const { data, error } = await dbRead.from('inventory').select('category');
    if (!error && data && data.length > 0) {
      const distinct = Array.from(new Set(data.map((i: any) => i.category))).filter(Boolean);
      return res.status(200).json({ status: 'success', data: distinct });
    }
    const categories = ['Sensors', 'Controllers', 'Actuators', 'Power', 'Tools'];
    return res.status(200).json({ status: 'success', data: categories });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /api/items/:id — cached 30s, read pool
export const getItemById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cacheKey = itemsIdCacheKey(id);

    const cached = await cacheGetJSON(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const { data: item, error } = await dbRead.from('inventory').select('*').eq('id', id).single();

    if (error || !item) {
      return res.status(404).json({ status: 'error', message: 'Item not found.' });
    }

    const payload = { status: 'success', data: item };
    await cacheSetJSON(cacheKey, payload, ITEMS_ITEM_CACHE_TTL);
    return res.status(200).json(payload);
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// POST /api/items (Add Item - Admin Only)
export const createItem = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, category, location, quantity, image, tags } = req.body;

    if (!name || !category || !location || quantity === undefined) {
      return res.status(400).json({ status: 'error', message: 'Name, category, location, and quantity are required.' });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ status: 'error', message: 'Quantity must be a positive number of at least 1.' });
    }

    const MAX_ITEM_QUANTITY = 500;
    if (qty > MAX_ITEM_QUANTITY) {
      return res.status(400).json({ status: 'error', message: `Quantity cannot exceed upper limit of ${MAX_ITEM_QUANTITY} units per entry.` });
    }

    const { data: newItem, error } = await dbWrite
      .from('inventory')
      .insert([
        {
          name,
          description,
          category,
          location,
          quantity: qty,
          available_quantity: qty,
          image: image || null,
          tags: tags || []
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Log to Audit
    await logAudit('Item Added', req.user?.id, newItem.id, `Added "${newItem.name}" with quantity ${qty}`);
    await invalidateItemsCache(newItem.id);

    // Dispatch autogenerated telemetry email to creator admin with CC to other admins
    sendAdminItemCreatedNotification({
      itemName: newItem.name,
      category: newItem.category,
      quantity: qty,
      location: newItem.location,
      description: newItem.description || undefined,
      tags: newItem.tags,
      createdByAdminName: req.user?.name || 'Admin',
      createdByAdminEmail: req.user?.email || process.env.DEFAULT_SENDER_EMAIL || process.env.SMTP_USER || 'cicrinventory@gmail.com',
      createdAt: newItem.created_at || new Date().toISOString()
    }).catch((e) => console.error('[EMAIL ERROR] Failed to send item creation email:', e));

    return res.status(201).json({ status: 'success', message: 'Item created successfully!', data: newItem });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// PATCH /api/items/:id (Edit Item - Admin Only)
export const updateItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    // M-3: explicit allow-list — only the documented PATCH fields are ever
    // written. Unknown/protected fields (id, created_at, client updated_at,
    // image, tags, arbitrary keys) are ignored, never rejected, never stored.
    // Each field is added only when actually supplied (partial PATCH intact).
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.category !== undefined) updates.category = body.category;
    if (body.location !== undefined) updates.location = body.location;

    // M-3: strict numeric coercion — numeric strings ("8") are accepted when
    // they convert cleanly; null, booleans, objects, "", "abc", NaN and
    // Infinity are invalid and never reach the database.
    const toValidInteger = (value: unknown): number | null => {
      if (typeof value === 'number') {
        return Number.isFinite(value) && Number.isInteger(value) ? value : null;
      }
      if (typeof value === 'string' && value.trim() !== '') {
        const num = Number(value);
        return Number.isFinite(num) && Number.isInteger(num) ? num : null;
      }
      return null;
    };

    let newQuantity: number | null = null;
    if (body.quantity !== undefined) {
      const qty = toValidInteger(body.quantity);
      if (qty === null || qty < 1 || qty > 10000) {
        return res.status(400).json({ status: 'error', message: 'Quantity must be a whole number between 1 and 10000.' });
      }
      newQuantity = qty;
      updates.quantity = qty;
    }

    let explicitAvailable: number | null = null;
    if (body.available_quantity !== undefined) {
      const avail = toValidInteger(body.available_quantity);
      if (avail === null || avail < 0 || avail > 10000) {
        return res.status(400).json({ status: 'error', message: 'Available quantity must be a whole number between 0 and 10000.' });
      }
      explicitAvailable = avail;
    }

    // Fetch existing item to calculate available quantity if total quantity changed
    const { data: existingItem, error: fetchErr } = await dbRead
      .from('inventory')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !existingItem) {
      return res.status(404).json({ status: 'error', message: 'Item not found.' });
    }

    if (newQuantity !== null && explicitAvailable === null) {
      // Preserve the established quantity-difference recalculation behavior.
      const diff = newQuantity - existingItem.quantity;
      updates.available_quantity = existingItem.available_quantity + diff;
      if ((updates.available_quantity as number) < 0) updates.available_quantity = 0;
    } else if (explicitAvailable !== null) {
      // M-3: documented field, honored but clamped to the invariant
      // 0 <= available_quantity <= quantity, using the new quantity when
      // supplied, otherwise the existing row quantity.
      const upperBound = newQuantity !== null ? newQuantity : existingItem.quantity;
      updates.available_quantity = Math.min(explicitAvailable, upperBound);
    }

    updates.updated_at = new Date().toISOString();

    const { data: updatedItem, error } = await dbWrite
      .from('inventory')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log to Audit
    await logAudit('Item Edited', req.user?.id, id, `Updated details for item "${updatedItem.name}"`);
    await invalidateItemsCache(id);

    return res.status(200).json({ status: 'success', message: 'Item updated successfully!', data: updatedItem });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// DELETE /api/items/:id (Delete Item - Admin Only)
export const deleteItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: item, error: fetchErr } = await dbRead.from('inventory').select('*').eq('id', id).single();
    if (fetchErr || !item) {
      return res.status(404).json({ status: 'error', message: 'Item not found in inventory.' });
    }

    // Clean up any historical borrow records referencing this item so foreign key won't fail
    await dbWrite.from('borrow_records').delete().eq('inventory_id', id);

    const { error } = await dbWrite.from('inventory').delete().eq('id', id);
    if (error) throw error;

    await invalidateItemsCache(id);

    const adminName = req.user?.name || req.user?.email || 'Admin';
    const adminEmail = req.user?.email || process.env.DEFAULT_SENDER_EMAIL || process.env.SMTP_USER || 'cicrinventory@gmail.com';

    // Log to Audit
    await logAuditEvent({
      action: 'Item Deleted',
      userId: req.user?.id,
      itemId: null,
      description: `Admin ${adminName} permanently deleted item "${item.name}" [${(item.category || 'General').toUpperCase()}] (Removed ${item.quantity} units)`
    });

    // Send email alert to Superadmins
    sendAdminItemDeletedNotification({
      itemName: item.name,
      category: item.category || 'General',
      quantity: item.quantity || 0,
      location: item.location || 'Unknown',
      deletedByAdminName: adminName,
      deletedByAdminEmail: adminEmail,
      deletedAt: new Date().toISOString()
    }).catch((e) => console.error('[EMAIL ERROR] Failed to send item deletion email:', e));

    return res.status(200).json({ status: 'success', message: `Item "${item.name}" deleted successfully!` });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};