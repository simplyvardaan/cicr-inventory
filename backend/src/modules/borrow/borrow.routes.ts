import { Router } from 'express';
import {
  borrowItem,
  returnItem,
  getBorrowHistory,
  getBorrowLedger,
  deleteLedgerRecord,
  getAdmins,
  requestOtp,
  verifyOtp,
  createHardwareRequestHandler,
  getHardwareRequestsHandler,
  approveHardwareRequestHandler,
  rejectHardwareRequestHandler,
  submitReturnRequestHandler,
  submitBulkReturnRequestHandler,
  submitBulkHardwareRequestHandler,
  returnAllLoansHandler
} from './borrow.controller';
import { authenticateToken, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

router.get('/admins', authenticateToken, getAdmins);
router.post('/admin/return-all-loans', authenticateToken, requireAdmin, returnAllLoansHandler);
router.post('/', authenticateToken, requireAdmin, borrowItem);
router.post('/request', authenticateToken, createHardwareRequestHandler);
router.post('/bulk-request', authenticateToken, submitBulkHardwareRequestHandler);
router.get('/requests', authenticateToken, getHardwareRequestsHandler);
router.post('/requests/:id/approve', authenticateToken, requireAdmin, approveHardwareRequestHandler);
router.post('/requests/:id/reject', authenticateToken, requireAdmin, rejectHardwareRequestHandler);
router.post('/request-otp', authenticateToken, requestOtp);
router.post('/verify-otp', authenticateToken, verifyOtp);
router.post('/return', authenticateToken, returnItem);
router.post('/return-request', authenticateToken, submitReturnRequestHandler);
router.post('/bulk-return-request', authenticateToken, submitBulkReturnRequestHandler);
router.get('/history', authenticateToken, getBorrowHistory);
router.get('/ledger', authenticateToken, requireAdmin, getBorrowLedger);
router.delete('/ledger/:id', authenticateToken, requireAdmin, deleteLedgerRecord);

export default router;

