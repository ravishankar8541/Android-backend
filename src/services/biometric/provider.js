import { env } from '../../config/env.js';
import { HttpError } from '../../utils/http-error.js';

/**
 * Replace this adapter with the licensed provider's server SDK/API.
 * The provider must verify the liveness session and 1:1 employee match on the server.
 * Client-submitted booleans or face scores must never be accepted here.
 */
export async function verifyAttendanceSession({ sessionId, employeeId }) {
  if (env.BIOMETRIC_PROVIDER === 'disabled') {
    throw new HttpError(503, 'Face verification is not configured yet', 'BIOMETRIC_PROVIDER_UNAVAILABLE');
  }
  if (!sessionId || !employeeId) {
    throw new HttpError(400, 'A verified face session is required', 'FACE_SESSION_REQUIRED');
  }
  throw new HttpError(503, 'The configured biometric provider adapter is not installed', 'BIOMETRIC_ADAPTER_UNAVAILABLE');
}
