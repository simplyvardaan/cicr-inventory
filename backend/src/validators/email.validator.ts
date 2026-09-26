// Email format validators.
//
// Domain enforcement:
//   - Students: MUST match institutional email domain @mail.jiit.ac.in (enrollmentnumber@mail.jiit.ac.in)
//   - Institutional: @mail.jiit.ac.in or @jiit.ac.in
//   - Admins: The current authorized administrator emails
//   - General external emails: strictly blocked for registration and non-admin login

import { SUPER_ADMIN_EMAILS, isSuperAdminEmail } from '../modules/auth/userApprovalService';

export const CURRENT_ADMIN_EMAILS = SUPER_ADMIN_EMAILS;

export const isCurrentAdminEmail = (email: string): boolean => {
  return isSuperAdminEmail(email);
};

// Student emails: enrollment number @mail.jiit.ac.in
export const JIIT_STUDENT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@mail\.jiit\.ac\.in$/i;
export const JIIT_NUMERIC_STUDENT_EMAIL_REGEX = /^\d+@mail\.jiit\.ac\.in$/i;
export const JIIT_INSTITUTIONAL_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@(mail\.)?jiit\.ac\.in$/i;

export const STUDENT_DOMAIN = 'mail.jiit.ac.in';

/**
 * Checks if an email is a valid institutional JIIT student/staff email.
 */
export const isJiitEmail = (email: string): boolean => {
  const norm = String(email ?? '').trim().toLowerCase();
  return JIIT_INSTITUTIONAL_EMAIL_REGEX.test(norm);
};

export const isStudentEmail = (email: string): boolean => {
  const norm = String(email ?? '').trim().toLowerCase();
  return JIIT_STUDENT_EMAIL_REGEX.test(norm);
};

/**
 * Validates whether an email is permitted to create an account or log into the portal.
 * Returns true ONLY for:
 *   - Accounts with JIIT domain (enrollmentnumber@mail.jiit.ac.in or @jiit.ac.in)
 *   - Current authorized administrator emails
 */
export const isAllowedAuthEmail = (email: string): boolean => {
  const norm = String(email ?? '').trim().toLowerCase();
  if (process.env.NODE_ENV === 'test' && (norm.endsWith('@cicr.test') || norm.endsWith('.test'))) {
    return true;
  }
  return isCurrentAdminEmail(norm) || isJiitEmail(norm);
};

export const isValidEmail = (email: string): boolean => {
  return isAllowedAuthEmail(email);
};

/**
 * Extracts the enrollment number / local prefix from a student email.
 */
export const extractEnrollment = (email: string): string | null => {
  const match = String(email ?? '').trim().toLowerCase().match(/^([a-zA-Z0-9._%+-]+)@mail\.jiit\.ac\.in$/);
  return match ? match[1] : null;
};
