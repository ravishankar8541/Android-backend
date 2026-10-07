import crypto from 'node:crypto';
import { BiometricSession } from '../../models/BiometricSession.js';
import { Employee } from '../../models/Employee.js';
import { FaceTemplate } from '../../models/FaceTemplate.js';
import { env } from '../../config/env.js';
import { HttpError } from '../../utils/http-error.js';
import { decryptFaceTemplate, embeddingDistance, encryptFaceTemplate } from './template-crypto.js';

function requireEmployeeId(employeeId) {
  if (!employeeId) throw new HttpError(403, 'This account is not linked to an employee profile', 'EMPLOYEE_PROFILE_REQUIRED');
  return employeeId;
}

export async function getMyFaceEnrollment(employeeId) {
  requireEmployeeId(employeeId);
  const [template, employee] = await Promise.all([
    FaceTemplate.findOne({ employee: employeeId }).select('enrolledAt'),
    Employee.findById(employeeId).select('faceEnrollmentStatus'),
  ]);
  const disabled = employee?.faceEnrollmentStatus === 'disabled';
  return { enrolled: Boolean(template) && !disabled, disabled, enrolledAt: template && !disabled ? template.enrolledAt : null };
}

export async function saveMyFaceEnrollment(employeeId, embedding, consent) {
  requireEmployeeId(employeeId);
  if (consent !== true) throw new HttpError(400, 'Consent is required before face enrollment', 'FACE_CONSENT_REQUIRED');
  const employee = await Employee.findById(employeeId);
  if (!employee || employee.employmentStatus !== 'active') throw new HttpError(403, 'Your employee profile is inactive', 'EMPLOYEE_INACTIVE');
  if (employee.faceEnrollmentStatus === 'disabled') throw new HttpError(403, 'Face attendance is disabled for this employee. Contact HR.', 'FACE_ENROLLMENT_DISABLED');
  const encrypted = encryptFaceTemplate(embedding);
  const template = await FaceTemplate.findOneAndUpdate(
    { employee: employeeId },
    { $set: { ...encrypted, enrolledAt: new Date(), consentAt: new Date(), consentVersion: 'attendance-face-v1' } },
    { upsert: true, new: true, runValidators: true },
  ).select('enrolledAt');
  employee.faceEnrollmentStatus = 'enrolled';
  await employee.save();
  return { enrolled: true, enrolledAt: template.enrolledAt };
}

export async function removeMyFaceEnrollment(employeeId) {
  requireEmployeeId(employeeId);
  const employee = await Employee.findById(employeeId).select('faceEnrollmentStatus');
  if (employee?.faceEnrollmentStatus === 'disabled') throw new HttpError(403, 'Face attendance is disabled by HR. Contact HR to change this setting.', 'FACE_ENROLLMENT_DISABLED');
  await FaceTemplate.deleteOne({ employee: employeeId });
  await BiometricSession.deleteMany({ employee: employeeId, usedAt: null });
  await Employee.updateOne({ _id: employeeId }, { $set: { faceEnrollmentStatus: 'not_enrolled' } });
  return { enrolled: false };
}

export async function createLocalVerification({ employeeId, eventType, embedding, livenessPassed, livenessScore }) {
  requireEmployeeId(employeeId);
  const employee = await Employee.findById(employeeId);
  if (!employee || employee.employmentStatus !== 'active') throw new HttpError(403, 'Your employee profile is inactive', 'EMPLOYEE_INACTIVE');
  if (employee.faceEnrollmentStatus === 'disabled') throw new HttpError(403, 'Face attendance is disabled for this employee. Contact HR.', 'FACE_ENROLLMENT_DISABLED');
  const template = await FaceTemplate.findOne({ employee: employeeId }).select('+ciphertext +iv +authTag');
  if (!template) throw new HttpError(409, 'Enroll your face before recording attendance', 'FACE_NOT_ENROLLED');
  if (!livenessPassed || livenessScore > env.BIOMETRIC_LIVENESS_MAX_SCORE) {
    throw new HttpError(403, 'Liveness check did not pass. Hold the camera steady and try again.', 'LIVENESS_CHECK_FAILED');
  }

  const distance = embeddingDistance(embedding, decryptFaceTemplate(template));
  if (!Number.isFinite(distance) || distance > env.BIOMETRIC_FACE_DISTANCE_THRESHOLD) {
    throw new HttpError(403, 'The face does not match this employee profile', 'FACE_MATCH_FAILED');
  }

  const session = await BiometricSession.create({
    _id: crypto.randomUUID(),
    employee: employeeId,
    eventType,
    faceDistance: distance,
    livenessScore,
    expiresAt: new Date(Date.now() + 2 * 60 * 1000),
  });
  return { verificationSessionId: session.id, expiresAt: session.expiresAt };
}

export async function verifyAttendanceSession({ sessionId, employeeId, eventType }) {
  if (env.BIOMETRIC_PROVIDER !== 'local') {
    throw new HttpError(503, 'Local face verification is disabled by the server', 'BIOMETRIC_PROVIDER_UNAVAILABLE');
  }
  if (!sessionId || !employeeId) throw new HttpError(400, 'A verified face session is required', 'FACE_SESSION_REQUIRED');
  const session = await BiometricSession.findOne({
    _id: sessionId,
    employee: employeeId,
    eventType,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session) throw new HttpError(403, 'Face verification expired or was already used. Verify again.', 'FACE_SESSION_INVALID');
  return {
    session,
    faceMatched: session.faceDistance <= env.BIOMETRIC_FACE_DISTANCE_THRESHOLD,
    livenessPassed: session.livenessScore <= env.BIOMETRIC_LIVENESS_MAX_SCORE,
    reference: `local:${session.id}`,
  };
}

export async function consumeAttendanceSession(session) {
  const result = await BiometricSession.updateOne(
    { _id: session.id, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  );
  if (result.modifiedCount !== 1) throw new HttpError(409, 'Face verification was already used. Verify again.', 'FACE_SESSION_ALREADY_USED');
}
