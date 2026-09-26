import { MASTER_ADMIN_EMAIL } from '../auth/userApprovalService';

export interface AdminDirectoryEntry {
  id: string;
  name: string;
  email: string;
}

export const ADMIN_DIRECTORY: AdminDirectoryEntry[] = [
  {
    id: 'cicr-admin',
    name: process.env.DEFAULT_ADMIN_NAME || 'CICR Lab Admin',
    email: process.env.DEFAULT_SENDER_EMAIL || process.env.SMTP_USER || MASTER_ADMIN_EMAIL
  }
];

export const getAdminById = (adminId: string): AdminDirectoryEntry | undefined =>
  ADMIN_DIRECTORY.find((admin) => admin.id === adminId || admin.name.toLowerCase() === adminId.toLowerCase());

export const getAdminByEmail = (email: string): AdminDirectoryEntry | undefined =>
  ADMIN_DIRECTORY.find((admin) => admin.email.toLowerCase() === email.toLowerCase());
