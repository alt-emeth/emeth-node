import { Router } from 'express';

import * as frontendController from '../controllers/frontend';

const router = Router();

router.get('/', frontendController.index);
router.get('/dashboard', frontendController.dashboard);

export default router;
