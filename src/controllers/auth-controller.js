import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { HttpError } from '../utils/http-error.js';
import { env } from '../config/env.js';

const COOKIE_NAME = 'vam_refresh';
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function setRefreshCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/api/auth' });
}

function createAccessToken(user) {
  return jwt.sign({ role: user.role, employeeId: user.employee?.toString() ?? null }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: 'vam-hrms-api',
    audience: 'vam-hrms-apps',
  });
}

async function rotateRefreshToken(user, res) {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  user.refreshTokenHash = sha256(refreshToken);
  await user.save({ validateBeforeSave: false });
  setRefreshCookie(res, refreshToken);
  return createAccessToken(user);
}

export async function login(req, res) {
  const email = req.body.email.toLowerCase();
  const user = await User.findOne({ email }).select('+passwordHash +refreshTokenHash');
  if (!user || !(await user.verifyPassword(req.body.password))) throw new HttpError(401, 'Email or password is incorrect', 'INVALID_CREDENTIALS');
  if (!user.active) throw new HttpError(403, 'This account is inactive', 'ACCOUNT_INACTIVE');
  const accessToken = await rotateRefreshToken(user, res);
  const employeeProfile = user.employee ? (await user.populate('employee')).employee : null;
  res.json({ success: true, message: 'Signed in successfully', data: {
    accessToken,
    user: { id: user.id, email: user.email, role: user.role, employee: employeeProfile ? {
      id: employeeProfile.id,
      employeeId: employeeProfile.employeeId,
      firstName: employeeProfile.firstName,
      lastName: employeeProfile.lastName,
    } : null },
  } });
}

export async function refresh(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw new HttpError(401, 'Sign in to continue', 'REFRESH_TOKEN_MISSING');
  const hash = sha256(token);
  const user = await User.findOne({ refreshTokenHash: hash }).select('+refreshTokenHash');
  if (!user?.active) {
    clearRefreshCookie(res);
    throw new HttpError(401, 'Your session has expired. Sign in again.', 'INVALID_REFRESH_TOKEN');
  }
  const accessToken = await rotateRefreshToken(user, res);
  res.json({ success: true, message: 'Session refreshed', data: { accessToken } });
}

export async function logout(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) await User.updateOne({ refreshTokenHash: sha256(token) }, { $set: { refreshTokenHash: null } });
  clearRefreshCookie(res);
  res.json({ success: true, message: 'Signed out successfully', data: null });
}

export async function getCurrentUser(req, res) {
  const user = await User.findById(req.auth.userId).populate('employee');
  res.json({ success: true, message: 'Current user', data: { user: {
    id: user.id,
    email: user.email,
    role: user.role,
    employee: user.employee ? {
      id: user.employee.id,
      employeeId: user.employee.employeeId,
      firstName: user.employee.firstName,
      lastName: user.employee.lastName,
      department: user.employee.department,
    } : null,
  } } });
}
