import { Router } from 'express';
import {
  getBoteMetrics,
  getSimulateScale,
  getReplicationStatusHandler,
  runReplicationSyncHandler,
  runReconcileHandler,
  simulateFailoverHandler,
  recoverPrimaryHandler,
} from '../modules/system/system.controller';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// System metrics & simulation endpoints (protected)
router.get('/bote-metrics', authenticateToken, getBoteMetrics);
router.get('/simulate-scale', authenticateToken, requireAdmin, getSimulateScale);

// Protected (admin-only) replication / failover operations
router.get('/replication/status', authenticateToken, requireAdmin, getReplicationStatusHandler);
router.post('/replication/sync', authenticateToken, requireAdmin, runReplicationSyncHandler);
router.post('/replication/reconcile', authenticateToken, requireAdmin, runReconcileHandler);
router.post('/failover/simulate', authenticateToken, requireAdmin, simulateFailoverHandler);
router.post('/failover/recover', authenticateToken, requireAdmin, recoverPrimaryHandler);

export default router;
