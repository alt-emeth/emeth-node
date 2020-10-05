import { Router } from 'express';

import * as frontendController from '../controllers/frontend';

const router = Router();

router.get('/', frontendController.index);
router.get('/dashboard', frontendController.dashboard);
router.get('/transactions', frontendController.transactions);
router.get('/blocks', frontendController.blocks);
router.get('/tx/:id', frontendController.getTransaction);
router.get('/blocks/:id', frontendController.getBlock);
router.get('/tokens', frontendController.tokens);
router.get('/tokens/:id', frontendController.getToken);
router.get('/tokens/transfers/:id', frontendController.getToken);

export default router;
