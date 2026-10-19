import { upload } from '../../middleware/upload.js';
import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createBoardSchema, updateBoardSchema } from '@trello-clone/shared';
import * as ctrl from './boards.controller.js';

const router: RouterType = Router({ mergeParams: true });

router.use(requireAuth);

router.post('/:boardId/background', upload.single('file'), ctrl.backgroundHandler);
router.delete('/:boardId/background', ctrl.backgroundHandler);

router.post('/', validate(createBoardSchema), ctrl.createHandler);
router.get('/', ctrl.listHandler);
router.get('/:boardId', ctrl.getHandler);
router.patch('/:boardId', validate(updateBoardSchema), ctrl.updateHandler);
router.delete('/:boardId', ctrl.deleteHandler);

export { router as boardRoutes };
