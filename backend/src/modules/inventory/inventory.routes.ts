import { Router } from 'express';
import {
  getItems,
  getItemById,
  getCategories,
  createItem,
  updateItem,
  deleteItem
} from './inventory.controller';
import { authenticateToken, requireAdmin } from '../../middleware/auth.middleware';
import { itemsReadLimiter } from '../../middleware/rateLimit';

const router = Router();

// Public / Authenticated User Routes (High-Throughput Protected)
router.get('/', itemsReadLimiter, getItems);
router.get('/categories', itemsReadLimiter, getCategories);
router.get('/:id', itemsReadLimiter, getItemById);

// Admin Only Routes
router.post('/', authenticateToken, requireAdmin, createItem);
router.patch('/:id', authenticateToken, requireAdmin, updateItem);
router.delete('/:id', authenticateToken, requireAdmin, deleteItem);

export default router;