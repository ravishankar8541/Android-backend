import { z } from 'zod';
import { Attendance } from '../models/Attendance.js';
import { Employee } from '../models/Employee.js';
import { AuditLog } from '../models/AuditLog.js';
import { HttpError } from '../utils/http-error.js';
import { dateKeyInTimeZone } from '../utils/date.js';
import { env } from '../config/env.js';
import { ROLES } from '../constants/roles.js';
import { markAttendance } from '../services/attendance-service.js';

export const attendanceEventSchema = z.object({
  verificationSessionId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().positive().max(10000),
  deviceId: z.string().max(120).optional(),
});

export async function checkIn(req, res) {
  const attendance = await markAttendance({ auth: req.auth, body: req.body, type: 'IN' });
  res.status(201).json({ success: true, message: 'Check-in recorded', data: { attendance } });
}

export async function checkOut(req, res) {
  const attendance = await markAttendance({ auth: req.auth, body: req.body, type: 'OUT' });
  res.json({ success: true, message: 'Check-out recorded', data: { attendance } });
}

export async function getToday(req, res) {
  if (!req.auth.employeeId) throw new HttpError(403, 'Employee profile required', 'EMPLOYEE_PROFILE_REQUIRED');
  const dateKey = dateKeyInTimeZone(new Date(), env.OFFICE_TIME_ZONE);
  const attendance = await Attendance.findOne({ employee: req.auth.employeeId, dateKey }).select('-events.verification.providerReference');
  res.json({ success: true, message: 'Today\'s attendance', data: { attendance } });
}

export async function listAttendance(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter = {};
  if (req.query.date) filter.dateKey = req.query.date;
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.office) filter.office = req.query.office;
  let allowedEmployeeIds = null;
  if (req.query.employee) {
    const escaped = req.query.employee.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = await Employee.find({ employeeId: { $regex: escaped, $options: 'i' } }).select('_id');
    allowedEmployeeIds = matches.map(({ _id }) => _id.toString());
  }
  if (req.auth.role === ROLES.MANAGER) {
    const team = req.auth.employeeId ? await Employee.find({ manager: req.auth.employeeId }).select('_id') : [];
    const teamIds = [...team.map(({ _id }) => _id.toString()), ...(req.auth.employeeId ? [req.auth.employeeId] : [])];
    allowedEmployeeIds = allowedEmployeeIds === null ? teamIds : allowedEmployeeIds.filter((id) => teamIds.includes(id));
  }
  if (allowedEmployeeIds !== null) filter.employee = { $in: allowedEmployeeIds };
  if (req.query.from || req.query.to) {
    filter.dateKey = { ...(req.query.from ? { $gte: req.query.from } : {}), ...(req.query.to ? { $lte: req.query.to } : {}) };
  }
  const [items, total] = await Promise.all([
    Attendance.find(filter).select('-events.verification.providerReference').populate('employee', 'employeeId firstName lastName department').populate('office', 'name').sort({ dateKey: -1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Attendance.countDocuments(filter),
  ]);
  res.json({ success: true, message: 'Attendance records', data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}

export async function listMyAttendance(req, res) {
  if (!req.auth.employeeId) throw new HttpError(403, 'Employee profile required', 'EMPLOYEE_PROFILE_REQUIRED');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const [items, total] = await Promise.all([
    Attendance.find({ employee: req.auth.employeeId }).select('-events.verification.providerReference').sort({ dateKey: -1 }).skip((page - 1) * limit).limit(limit),
    Attendance.countDocuments({ employee: req.auth.employeeId }),
  ]);
  res.json({ success: true, message: 'Your attendance history', data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}

export const correctionSchema = z.object({
  type: z.enum(['IN', 'OUT']),
  occurredAt: z.coerce.date(),
  reason: z.string().trim().min(8).max(1000),
});

export async function correctAttendance(req, res) {
  const attendance = await Attendance.findById(req.params.id);
  if (!attendance) throw new HttpError(404, 'Attendance record not found', 'ATTENDANCE_NOT_FOUND');
  const employee = await Employee.findById(attendance.employee).populate('office');
  attendance.events.push({
    type: req.body.type,
    occurredAt: req.body.occurredAt,
    method: 'manual',
    verification: { faceMatched: false, livenessPassed: false },
    location: {
      latitude: employee.office?.latitude ?? 0,
      longitude: employee.office?.longitude ?? 0,
      accuracyMeters: 0,
      distanceMeters: 0,
    },
    correctedBy: req.auth.userId,
    correctionReason: req.body.reason,
  });
  attendance.events.sort((a, b) => a.occurredAt - b.occurredAt);
  attendance.status = 'manual_review';
  await attendance.save();
  await AuditLog.create({ actor: req.auth.userId, action: 'attendance.corrected', entityType: 'Attendance', entityId: attendance.id, reason: req.body.reason, ipAddress: req.ip });
  res.json({ success: true, message: 'Attendance corrected', data: { attendance } });
}
