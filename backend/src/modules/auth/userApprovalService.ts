import fs from 'fs';
import path from 'path';
import { dbRead } from '../../config/database';

export interface DesignatedAdminInfo {
  email: string;
  name: string;
  username: string;
  roll_number?: string;
  batch?: string;
}

export const DEFAULT_DESIGNATED_ADMINS: DesignatedAdminInfo[] = [
  {
    email: 'vardaansaxena096@gmail.com',
    name: 'Vardaan Saxena',
    username: 'vardaan'
  },
  {
    email: 'cicrinventory@gmail.com',
    name: 'CICR Admin',
    username: 'cicradmin'
  },
  {
    email: '992501030399@mail.jiit.ac.in',
    name: 'Vardaan Saxena',
    username: 'srvkiller09',
    roll_number: '992501030399'
  },
  {
    email: '992401210050@mail.jiit.ac.in',
    name: 'Gunjan Pal',
    username: 'gunjanpal',
    roll_number: '992401210050',
    batch: 'Management Head'
  },
  {
    email: '992401030123@mail.jiit.ac.in',
    name: 'Dhruvi Gupta',
    username: 'dhruvi',
    roll_number: '992401030123',
    batch: 'Management Head'
  },
  {
    email: '992401030154@mail.jiit.ac.in',
    name: 'Aryan Varshney',
    username: 'aryanvarshney',
    roll_number: '992401030154',
    batch: 'COORDINATOR'
  }
];

export const MASTER_ADMIN_EMAIL = (process.env.MASTER_ADMIN_EMAIL || 'vardaansaxena096@gmail.com').trim().toLowerCase();

export const SUPER_ADMIN_EMAILS: string[] = process.env.SUPER_ADMIN_EMAILS
  ? process.env.SUPER_ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  : DEFAULT_DESIGNATED_ADMINS.map((a) => a.email.toLowerCase());

export const isSuperAdminEmail = (email: string): boolean => {
  const norm = email.trim().toLowerCase();
  return SUPER_ADMIN_EMAILS.some((admin) => admin.toLowerCase() === norm);
};

export const isDesignatedAdmin = (email: string, _name?: string): boolean => {
  const norm = (email || '').trim().toLowerCase();
  if (norm === '992501210090@mail.jiit.ac.in' || norm.includes('divyam')) return false;
  // H-1 FIX: exact normalized email allow-list only. The display name,
  // roll number, or any email substring must NEVER grant ADMIN.
  // _name is accepted for backward compatibility and intentionally ignored.
  void _name;
  return isSuperAdminEmail(email);
};

export interface UserApprovalRecord {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  role: 'ADMIN' | 'MEMBER';
  approvedAt?: string;
  approvedBy?: string;
  username?: string | null;
  batch?: string | null;
  name?: string | null;
  roll_number?: string | null;
  avatar_url?: string | null;
}

const resolveStoragePath = (fileName: string) => {
  const localPath = path.resolve(process.cwd(), fileName);
  if (fs.existsSync(localPath)) return localPath;
  const backendPath = path.resolve(process.cwd(), 'backend', fileName);
  if (fs.existsSync(backendPath)) return backendPath;
  return path.resolve(__dirname, '..', '..', '..', fileName);
};

const STORAGE_FILE = resolveStoragePath('user_approval_data.json');

let approvalState: Record<string, UserApprovalRecord> = {};
let purgedEmails: Set<string> = new Set();

// Load persisted approval state
try {
  if (fs.existsSync(STORAGE_FILE)) {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.approvalState) {
      approvalState = parsed.approvalState;
      purgedEmails = new Set(parsed.purgedEmails || []);
    } else {
      approvalState = parsed;
    }
  }
} catch (err) {
  console.warn('[USER APPROVAL] Failed to load user approval file, using memory:', err);
}

const saveState = () => {
  try {
    fs.writeFileSync(
      STORAGE_FILE,
      JSON.stringify(
        {
          approvalState,
          purgedEmails: Array.from(purgedEmails)
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch (err) {
    console.warn('[USER APPROVAL] Failed to save user approval file:', err);
  }
};

export const isTestOrPurgedEmail = (email: string): boolean => {
  const normEmail = email.trim().toLowerCase();
  if (isSuperAdminEmail(normEmail)) return false;
  if (purgedEmails.has(normEmail)) return true;
  if (process.env.NODE_ENV !== 'test' && (normEmail.endsWith('.test') || normEmail.includes('cicr.test'))) {
    return true;
  }
  return false;
};

export const isManagedUser = (email: string): boolean => {
  const normEmail = email.trim().toLowerCase();
  if (isSuperAdminEmail(normEmail)) return true;
  if (isTestOrPurgedEmail(normEmail)) return false;
  return Boolean(approvalState[normEmail]);
};

export const isPurgedUser = (email: string): boolean => {
  const normEmail = email.trim().toLowerCase();
  if (isSuperAdminEmail(normEmail)) return false;
  return purgedEmails.has(normEmail);
};

export const unpurgeEmail = (email: string) => {
  purgedEmails.delete(email.trim().toLowerCase());
  saveState();
};

export const getUserApproval = (email: string, initialRole: 'ADMIN' | 'MEMBER' = 'MEMBER'): UserApprovalRecord => {
  const normEmail = email.trim().toLowerCase();
  
  if (isSuperAdminEmail(normEmail)) {
    return {
      status: 'APPROVED',
      role: 'ADMIN',
      approvedAt: new Date().toISOString(),
      approvedBy: 'SYSTEM'
    };
  }


  const isDesignated = isDesignatedAdmin(normEmail);
  const isCollege = normEmail.endsWith('@mail.jiit.ac.in') || normEmail.endsWith('@jiit.ac.in');

  if (!approvalState[normEmail]) {
    approvalState[normEmail] = {
      // Auto-approve college IDs and designated administrators
      status: isCollege || isDesignated ? 'APPROVED' : 'PENDING',
      role: isDesignated ? 'ADMIN' : (isCollege ? 'MEMBER' : (initialRole === 'ADMIN' ? 'ADMIN' : 'MEMBER')),
      approvedAt: (isCollege || isDesignated) ? new Date().toISOString() : undefined,
      approvedBy: (isCollege || isDesignated) ? 'SYSTEM (AUTO-APPROVE)' : undefined
    };
    saveState();
  } else if (isDesignated && approvalState[normEmail].role !== 'ADMIN') {
    approvalState[normEmail].role = 'ADMIN';
    approvalState[normEmail].status = 'APPROVED';
    saveState();
  }

  return approvalState[normEmail];
};

export const setUserApproval = (
  email: string,
  status: 'PENDING' | 'APPROVED' | 'REJECTED',
  approvedBy?: string,
  metadata?: { username?: string | null; batch?: string | null; name?: string | null; roll_number?: string | null }
): UserApprovalRecord => {
  const normEmail = email.trim().toLowerCase();
  // H-1 FIX: role derives from the exact allow-list email only; metadata.name is never consulted.
  const isDesignated = isDesignatedAdmin(normEmail);

  if (isSuperAdminEmail(normEmail)) {
    const match = DEFAULT_DESIGNATED_ADMINS.find((a) => a.email.toLowerCase() === normEmail);
    return {
      status: 'APPROVED',
      role: 'ADMIN',
      approvedAt: new Date().toISOString(),
      approvedBy: 'SYSTEM',
      username: match?.username || (normEmail === MASTER_ADMIN_EMAIL ? 'vardaan' : 'cicradmin'),
      name: match?.name || (normEmail === MASTER_ADMIN_EMAIL ? 'Vardaan' : 'CICR Admin')
    };
  }

  purgedEmails.delete(normEmail);

  const current = approvalState[normEmail] || { 
    status: isDesignated ? 'APPROVED' : status, 
    role: isDesignated ? 'ADMIN' : 'MEMBER' 
  };
  
  current.status = isDesignated ? 'APPROVED' : status;
  if (isDesignated) {
    current.role = 'ADMIN';
  }
  
  if (current.status === 'APPROVED') {
    current.approvedAt = new Date().toISOString();
    current.approvedBy = approvedBy || 'SYSTEM';
  } else {
    current.approvedAt = undefined;
    current.approvedBy = undefined;
  }

  if (metadata) {
    if (metadata.username) current.username = metadata.username.trim();
    if (metadata.batch) current.batch = metadata.batch.trim();
    if (metadata.name) current.name = metadata.name.trim();
    if (metadata.roll_number) current.roll_number = metadata.roll_number.trim();
    if ((metadata as any).avatar_url !== undefined) current.avatar_url = (metadata as any).avatar_url;
  }

  approvalState[normEmail] = current;
  saveState();
  return current;
};

export const updateUserMetadata = (
  email: string,
  metadata: { name?: string; username?: string; batch?: string; avatar_url?: string | null }
): void => {
  const normEmail = email.trim().toLowerCase();
  if (approvalState[normEmail]) {
    if (metadata.name !== undefined) approvalState[normEmail].name = metadata.name ? metadata.name.trim() : null;
    if (metadata.username !== undefined) approvalState[normEmail].username = metadata.username ? metadata.username.trim() : null;
    if (metadata.batch !== undefined) approvalState[normEmail].batch = metadata.batch ? metadata.batch.trim() : null;
    if (metadata.avatar_url !== undefined) approvalState[normEmail].avatar_url = metadata.avatar_url;
    saveState();
  }
};

export const setUserRole = (
  email: string,
  role: 'ADMIN' | 'MEMBER'
): UserApprovalRecord => {
  const normEmail = email.trim().toLowerCase();
  
  if (isSuperAdminEmail(normEmail)) {
    return {
      status: 'APPROVED',
      role: 'ADMIN',
      approvedAt: new Date().toISOString(),
      approvedBy: 'SYSTEM'
    };
  }

  purgedEmails.delete(normEmail);

  if (normEmail === 'mahakkatahara.mk@gmail.com' || normEmail === '992501210090@mail.jiit.ac.in' || normEmail.includes('divyam')) {
    role = 'MEMBER';
  }

  const current = approvalState[normEmail] || { status: 'APPROVED', role: 'MEMBER' };
  current.role = role;
  approvalState[normEmail] = current;
  saveState();
  return current;
};

export const deleteUserApproval = (email: string): void => {
  const normEmail = email.trim().toLowerCase();
  if (isSuperAdminEmail(normEmail)) return;
  
  delete approvalState[normEmail];
  purgedEmails.add(normEmail);
  saveState();
};

export const getAllUserApprovals = (): Record<string, UserApprovalRecord> => {
  const base: Record<string, UserApprovalRecord> = {};
  DEFAULT_DESIGNATED_ADMINS.forEach((adm) => {
    const existing = approvalState[adm.email.toLowerCase()];
    base[adm.email.toLowerCase()] = {
      status: 'APPROVED',
      role: 'ADMIN',
      approvedAt: existing?.approvedAt || '2026-09-08T00:00:00.000Z',
      approvedBy: existing?.approvedBy || 'SYSTEM',
      username: existing?.username || adm.username,
      name: existing?.name || adm.name,
      roll_number: existing?.roll_number || adm.roll_number,
      batch: existing?.batch || adm.batch
    };
  });
  const filtered: Record<string, UserApprovalRecord> = {};
  for (const [em, rec] of Object.entries(approvalState)) {
    if (!isTestOrPurgedEmail(em)) {
      filtered[em] = rec;
    }
  }
  return {
    ...filtered,
    ...base
  };
};

export const findUserApprovalByIdentifier = (identifier: string): { email: string; record: UserApprovalRecord } | null => {
  const norm = identifier.trim().toLowerCase();
  
  const designatedMatch = DEFAULT_DESIGNATED_ADMINS.find(
    (a) =>
      a.email.toLowerCase() === norm ||
      a.username.toLowerCase() === norm ||
      a.name.toLowerCase() === norm ||
      (a.roll_number && a.roll_number.toLowerCase() === norm)
  );
  if (designatedMatch) {
    const existing = approvalState[designatedMatch.email.toLowerCase()];
    return {
      email: designatedMatch.email,
      record: {
        status: 'APPROVED',
        role: 'ADMIN',
        username: existing?.username || designatedMatch.username,
        name: existing?.name || designatedMatch.name,
        roll_number: existing?.roll_number || designatedMatch.roll_number,
        batch: existing?.batch || designatedMatch.batch
      }
    };
  }

  for (const [email, rec] of Object.entries(approvalState)) {
    if (purgedEmails.has(email.toLowerCase())) continue;
    if (
      email.toLowerCase() === norm ||
      rec.username?.toLowerCase() === norm ||
      rec.name?.toLowerCase() === norm ||
      rec.roll_number?.toLowerCase() === norm
    ) {
      return { email, record: rec };
    }
  }

  return null;
};

export const getAllAdminEmails = async (): Promise<string[]> => {
  const adminSet = new Set<string>(SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase()));
  try {
    const { data: dbAdmins } = await dbRead.from('users').select('email').eq('role', 'ADMIN');
    if (dbAdmins) {
      dbAdmins.forEach((u: any) => {
        if (u.email && !u.email.endsWith('.test')) {
          adminSet.add(u.email.toLowerCase());
        }
      });
    }
  } catch (err: any) {
    console.warn('[USER APPROVAL] Could not fetch DB admins:', err?.message || err);
  }
  return Array.from(adminSet);
};

let lastApprovalSyncTime = 0;
const APPROVAL_SYNC_COOLDOWN_MS = 60 * 1000; // 60-second cooldown between audit log DB syncs

export const syncApprovalsFromDatabase = async (force = false): Promise<void> => {
  const now = Date.now();
  if (!force && now - lastApprovalSyncTime < APPROVAL_SYNC_COOLDOWN_MS) {
    return;
  }
  lastApprovalSyncTime = now;

  try {
    const { data: logs, error } = await dbRead
      .from('audit_logs')
      .select('action, description, timestamp')
      .in('action', ['Sign Up', 'User Approved', 'User Rejected', 'User Deleted'])
      .order('timestamp', { ascending: true });

    if (error) {
      console.warn('[USER APPROVAL] Could not sync from audit_logs:', error.message);
      return;
    }

    if (logs && logs.length > 0) {
      for (const log of logs) {
        const match = log.description?.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        if (match) {
          const email = match[1].trim().toLowerCase();
          if (isSuperAdminEmail(email) || isTestOrPurgedEmail(email)) continue;

          if (log.action === 'User Deleted') {
            delete approvalState[email];
            purgedEmails.add(email);
            continue;
          }

          if (log.action === 'Sign Up') {
            purgedEmails.delete(email);
            const current = approvalState[email] || { status: 'PENDING', role: 'MEMBER' };
            current.status = 'PENDING';
            current.approvedAt = undefined;
            current.approvedBy = undefined;

            const nameMatch = log.description?.match(/New Student registration:\s*([^(@]+)/i);
            if (nameMatch) current.name = nameMatch[1].trim();
            const usernameMatch = log.description?.match(/@([a-zA-Z0-9_.-]+)/);
            if (usernameMatch) current.username = usernameMatch[1].trim();
            const batchMatch = log.description?.match(/\[Batch:\s*([^,\]]+)/i);
            if (batchMatch) current.batch = batchMatch[1].trim();

            approvalState[email] = current;
          } else if (log.action === 'User Approved') {
            purgedEmails.delete(email);
            const current = approvalState[email] || { status: 'APPROVED', role: 'MEMBER' };
            current.status = 'APPROVED';
            current.approvedAt = log.timestamp;
            current.approvedBy = 'ADMIN';
            approvalState[email] = current;
          } else if (log.action === 'User Rejected') {
            purgedEmails.delete(email);
            const current = approvalState[email] || { status: 'REJECTED', role: 'MEMBER' };
            current.status = 'REJECTED';
            current.approvedAt = undefined;
            current.approvedBy = undefined;
            approvalState[email] = current;
          }
        }
      }
      saveState();
      console.log(`[USER APPROVAL] Synced ${logs.length} approval log(s) from database.`);
    }
  } catch (err: any) {
    console.warn('[USER APPROVAL] Failed to sync approvals from DB:', err?.message || err);
  }
};

export const checkUserApprovalInDatabase = async (email: string): Promise<'APPROVED' | 'REJECTED' | 'PENDING'> => {
  const normEmail = email.trim().toLowerCase();
  if (isSuperAdminEmail(normEmail)) return 'APPROVED';

  try {
    const { data: logs } = await dbRead
      .from('audit_logs')
      .select('action, description, timestamp')
      .in('action', ['Sign Up', 'User Approved', 'User Rejected', 'User Deleted'])
      .ilike('description', `%${normEmail}%`)
      .order('timestamp', { ascending: false })
      .limit(1);

    if (logs && logs.length > 0) {
      const latest = logs[0];
      const status: 'APPROVED' | 'REJECTED' | 'PENDING' =
        latest.action === 'User Approved' ? 'APPROVED'
        : latest.action === 'User Rejected' ? 'REJECTED'
        : 'PENDING';

      const current = approvalState[normEmail] || { status, role: 'MEMBER' };
      current.status = status;
      if (status === 'APPROVED') {
        current.approvedAt = latest.timestamp;
        current.approvedBy = 'ADMIN';
      } else {
        current.approvedAt = undefined;
        current.approvedBy = undefined;
      }
      approvalState[normEmail] = current;
      saveState();
      return status;
    }
  } catch (err: any) {
    console.warn('[USER APPROVAL] Live DB approval check error:', err?.message || err);
  }

  return approvalState[normEmail]?.status || 'PENDING';
};

