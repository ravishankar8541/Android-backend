import { Attendance } from '../models/Attendance.js';
import { Employee } from '../models/Employee.js';
import { Office } from '../models/Office.js';
import { Shift } from '../models/Shift.js';
import { env } from '../config/env.js';
import { dateKeyInTimeZone } from '../utils/date.js';
import { HttpError } from '../utils/http-error.js';
import { assertInsideOffice } from './geofence.js';
import { verifyAttendanceSession } from './biometric/provider.js';

function minuteOfDay(date) {
  const pieces = new Intl.DateTimeFormat('en-GB', { timeZone: env.OFFICE_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date).split(':');
  return Number(pieces[0]) * 60 + Number(pieces[1]);
}

export async function markAttendance({ auth, body, type }) {
  if (!auth.employeeId) throw new HttpError(403, 'This account is not linked to an employee profile', 'EMPLOYEE_PROFILE_REQUIRED');
  const employee = await Employee.findById(auth.employeeId).populate('office').populate('shift');
  if (!employee || employee.employmentStatus !== 'active') throw new HttpError(403, 'Your employee profile is inactive', 'EMPLOYEE_INACTIVE');
  if (!employee.office?.active) throw new HttpError(409, 'No active office is assigned to your profile', 'OFFICE_NOT_ASSIGNED');

  // Provider verification is server-to-server and deliberately happens before recording an event.
  const biometric = await verifyAttendanceSession({ sessionId: body.verificationSessionId, employeeId: employee.id });
  if (!biometric.livenessPassed || !biometric.faceMatched) throw new HttpError(403, 'Face verification failed', 'FACE_VERIFICATION_FAILED');

  const location = { latitude: body.latitude, longitude: body.longitude, accuracyMeters: body.accuracyMeters };
  const distanceMeters = assertInsideOffice(location, employee.office);
  const occurredAt = new Date();
  const dateKey = dateKeyInTimeZone(occurredAt, env.OFFICE_TIME_ZONE);
  let attendance = await Attendance.findOne({ employee: employee.id, dateKey });
  const lastEvent = attendance?.events.at(-1);
  if ((type === 'IN' && lastEvent?.type === 'IN') || (type === 'OUT' && (!lastEvent || lastEvent.type === 'OUT'))) {
    throw new HttpError(409, type === 'IN' ? 'You are already checked in' : 'You need to check in before checking out', 'INVALID_ATTENDANCE_SEQUENCE');
  }

  if (!attendance) {
    if (type !== 'IN') throw new HttpError(409, 'You need to check in before checking out', 'INVALID_ATTENDANCE_SEQUENCE');
    const shift = employee.shift || await Shift.findOne({ active: true });
    let status = 'present';
    if (shift) {
      const [hour, minute] = shift.startTime.split(':').map(Number);
      if (minuteOfDay(occurredAt) > hour * 60 + minute + shift.graceMinutes) status = 'late';
    }
    attendance = new Attendance({ employee: employee.id, office: employee.office.id, dateKey, status, events: [] });
  }

  attendance.events.push({
    type,
    occurredAt,
    method: 'face_liveness',
    verification: { faceMatched: true, livenessPassed: true, providerReference: biometric.reference },
    location: { ...location, distanceMeters },
    deviceId: body.deviceId || null,
  });
  if (type === 'OUT') {
    const inEvents = attendance.events.filter((event) => event.type === 'IN');
    const minutes = inEvents.reduce((total, event, index) => {
      const nextOut = attendance.events.find((candidate, candidateIndex) => candidate.type === 'OUT' && candidateIndex > attendance.events.indexOf(event));
      return total + (nextOut ? Math.max(0, Math.round((nextOut.occurredAt - event.occurredAt) / 60000)) : 0);
    }, 0);
    attendance.netWorkingMinutes = minutes;
  }
  await attendance.save();
  return attendance;
}
