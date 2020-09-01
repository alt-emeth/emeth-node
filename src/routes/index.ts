import { Router } from 'express';

import * as frontendController from '../controllers/frontend';

const router = Router();

router.get('/', frontendController.index);
router.get('/dashboard', frontendController.dashboard);
router.get('/transactions', frontendController.transactions);
router.get('/blocks', frontendController.blocks);
router.get('/transactions/:id', frontendController.getTransaction);
router.get('/blocks/:id', frontendController.getBlock);

export default router;
