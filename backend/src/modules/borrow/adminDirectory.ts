import { MASTER_ADMIN_EMAIL } from '../auth/userApprovalService';

export interface AdminDirectoryEntry {
  id: string;
  name: string;
  email: string;
}

export const ADMIN_DIRECTORY: AdminDirectoryEntry[] = [
  { id: 'cicr-admin', name: 'CICR Inventory Admin', email: process.env.DEFAULT_SENDER_EMAIL || process.env.SMTP_USER || 'cicrinventory@gmail.com' },
  { id: 'master-vardaan', name: process.env.DEFAULT_ADMIN_NAME || 'Vardaan Saxena', email: MASTER_ADMIN_EMAIL },
  { id: 'admin-vardaan-jiit', name: process.env.DEFAULT_ADMIN_NAME || 'Vardaan Saxena', email: '992501030399@mail.jiit.ac.in' },
  { id: 'admin-gunjan', name: 'Gunjan Pal', email: '992401210050@mail.jiit.ac.in' },
  { id: 'admin-dhruvi', name: 'Dhruvi Gupta', email: '992401030123@mail.jiit.ac.in' },
  { id: 'admin-aryan', name: 'Aryan Varshney', email: '992401030154@mail.jiit.ac.in' }
];

export const getAdminById = (adminId: string): AdminDirectoryEntry | undefined =>
  ADMIN_DIRECTORY.find((admin) => admin.id === adminId || admin.name.toLowerCase() === adminId.toLowerCase());

export const getAdminByEmail = (email: string): AdminDirectoryEntry | undefined =>
  ADMIN_DIRECTORY.find((admin) => admin.email.toLowerCase() === email.toLowerCase());

