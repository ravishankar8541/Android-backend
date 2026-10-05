import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { login, logout, refresh, getCurrentUser } from '../controllers/auth-controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, message: 'Too many sign-in attempts. Try again later.', code: 'RATE_LIMITED' } });
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(login));
router.post('/refresh', asyncHandler(refresh));
router.post('/logout', asyncHandler(logout));
router.get('/me', requireAuth, asyncHandler(getCurrentUser));

export default router;
