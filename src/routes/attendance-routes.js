import { Router } from 'express';
import { z } from 'zod';
import { checkIn, checkOut, correctAttendance, getToday, listAttendance, listMyAttendance, attendanceEventSchema, correctionSchema } from '../controllers/attendance-controller.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { ADMIN_ROLES, MANAGER_ROLES, ROLES } from '../constants/roles.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
const filtersSchema = z.object({ page: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().positive().max(100).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), status: z.string().optional(), office: z.string().optional(), employee: z.string().optional() }).passthrough();

router.use(requireAuth);
router.post('/check-in', allowRoles(ROLES.EMPLOYEE, ROLES.MANAGER), validate(attendanceEventSchema), asyncHandler(checkIn));
router.post('/check-out', allowRoles(ROLES.EMPLOYEE, ROLES.MANAGER), validate(attendanceEventSchema), asyncHandler(checkOut));
router.get('/today', allowRoles(ROLES.EMPLOYEE, ROLES.MANAGER), asyncHandler(getToday));
router.get('/my', allowRoles(ROLES.EMPLOYEE, ROLES.MANAGER), asyncHandler(listMyAttendance));
router.get('/', allowRoles(...MANAGER_ROLES), validate(filtersSchema, 'query'), asyncHandler(listAttendance));
router.patch('/:id/correction', allowRoles(...ADMIN_ROLES), validate(correctionSchema), asyncHandler(correctAttendance));

export default router;
