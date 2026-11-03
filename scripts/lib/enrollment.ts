import type { Enrollment } from '@said/runtime';
import { generateCodes } from './codes.js';

export type EnrollRole = Enrollment['codes'][number]['role'];

export interface EnrollPlan {
  roomMode: 'business' | 'personal';
  /** Display labels, e.g. { developer: 'Riya', client: 'Dana' }. */
  labels: Partial<Record<EnrollRole, string>>;
}

const ROLES: Record<EnrollPlan['roomMode'], [EnrollRole, EnrollRole]> = {
  business: ['developer', 'client'],
  personal: ['partnerA', 'partnerB'],
};

/** Builds `enrollment.json` content: one fresh random code per party. */
export function buildEnrollment(roomId: string, plan: EnrollPlan, now = Date.now()): Enrollment {
  const roles = ROLES[plan.roomMode];
  const codes = generateCodes(2);
  return {
    roomId,
    createdAt: now,
    codes: roles.map((role, i) => {
      const label = plan.labels[role]?.trim();
      if (!label) throw new Error(`Missing a name for the ${role}.`);
      return { role, label, code: codes[i]! };
    }),
  };
}

/** The exact line each person types in the room. */
export function enrollLine(saidName: string, code: string): string {
  return `@${saidName} enroll ${code}`;
}
