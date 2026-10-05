import { Router } from 'express';
import { z } from 'zod';
import { createOffice, createShift, listOffices, listShifts, updateOffice, updateShift } from '../controllers/configuration-controller.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { ADMIN_ROLES } from '../constants/roles.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { env } from '../config/env.js';

const officeSchema = z.object({ name: z.string().trim().min(2).max(100), address: z.string().trim().max(500).optional(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), radiusMeters: z.number().int().positive().max(5000).default(env.DEFAULT_GEOFENCE_RADIUS_METERS), active: z.boolean().default(true) });
const officeUpdateSchema = officeSchema.partial().refine((value) => Object.keys(value).length > 0, 'Provide at least one field');
const shiftSchema = z.object({ name: z.string().trim().min(2).max(80), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), graceMinutes: z.number().int().min(0).max(240).default(15), breakMinutes: z.number().int().min(0).max(480).default(60), active: z.boolean().default(true) });
const shiftUpdateSchema = shiftSchema.partial().refine((value) => Object.keys(value).length > 0, 'Provide at least one field');

const offices = Router();
offices.use(requireAuth, allowRoles(...ADMIN_ROLES));
offices.get('/', asyncHandler(listOffices));
offices.post('/', validate(officeSchema), asyncHandler(createOffice));
offices.patch('/:id', validate(officeUpdateSchema), asyncHandler(updateOffice));

const shifts = Router();
shifts.use(requireAuth, allowRoles(...ADMIN_ROLES));
shifts.get('/', asyncHandler(listShifts));
shifts.post('/', validate(shiftSchema), asyncHandler(createShift));
shifts.patch('/:id', validate(shiftUpdateSchema), asyncHandler(updateShift));

export { offices as officeRoutes, shifts as shiftRoutes };
