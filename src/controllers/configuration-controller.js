import { Office } from '../models/Office.js';
import { Shift } from '../models/Shift.js';
import { AuditLog } from '../models/AuditLog.js';
import { HttpError } from '../utils/http-error.js';

export async function listOffices(_req, res) {
  const items = await Office.find().sort({ name: 1 });
  res.json({ success: true, message: 'Offices', data: { items } });
}

export async function createOffice(req, res) {
  const office = await Office.create(req.body);
  await AuditLog.create({ actor: req.auth.userId, action: 'office.created', entityType: 'Office', entityId: office.id, ipAddress: req.ip });
  res.status(201).json({ success: true, message: 'Office created', data: { office } });
}

export async function updateOffice(req, res) {
  const office = await Office.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!office) throw new HttpError(404, 'Office not found', 'OFFICE_NOT_FOUND');
  await AuditLog.create({ actor: req.auth.userId, action: 'office.updated', entityType: 'Office', entityId: office.id, ipAddress: req.ip });
  res.json({ success: true, message: 'Office updated', data: { office } });
}

export async function listShifts(_req, res) {
  const items = await Shift.find().sort({ name: 1 });
  res.json({ success: true, message: 'Shifts', data: { items } });
}

export async function createShift(req, res) {
  const shift = await Shift.create(req.body);
  await AuditLog.create({ actor: req.auth.userId, action: 'shift.created', entityType: 'Shift', entityId: shift.id, ipAddress: req.ip });
  res.status(201).json({ success: true, message: 'Shift created', data: { shift } });
}

export async function updateShift(req, res) {
  const shift = await Shift.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!shift) throw new HttpError(404, 'Shift not found', 'SHIFT_NOT_FOUND');
  await AuditLog.create({ actor: req.auth.userId, action: 'shift.updated', entityType: 'Shift', entityId: shift.id, ipAddress: req.ip });
  res.json({ success: true, message: 'Shift updated', data: { shift } });
}
