import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import dns from 'dns';
import { enqueueEmail } from '../config/emailQueue';

// Force IPv4 in Node 18/20/24 on Docker/Render to prevent hanging on IPv6 blackholes
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

dotenv.config();

// Verified sender + default admin recipients
import { SUPER_ADMIN_EMAILS, MASTER_ADMIN_EMAIL } from '../modules/auth/userApprovalService';

export const SENDER_NAME = process.env.SMTP_SENDER_NAME || 'CICR Inventory';
export const DEFAULT_TEST_RECIPIENT_EMAIL = process.env.TEST_RECIPIENT_EMAIL || 'cicrinventory@gmail.com';
export const DEFAULT_SENDER_EMAIL = process.env.DEFAULT_SENDER_EMAIL || process.env.SMTP_USER || 'cicrinventory@gmail.com';
export const NO_REPLY_HEADER = process.env.SMTP_NO_REPLY_HEADER || `"${SENDER_NAME}" <${DEFAULT_SENDER_EMAIL}>`;

export { SUPER_ADMIN_EMAILS };

export const getAdminNotificationRecipients = async (): Promise<string[]> => {
  const adminSet = new Set<string>(SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase()));
  try {
    const { getAllAdminEmails } = await import('../modules/auth/userApprovalService');
    const dbEmails = await getAllAdminEmails();
    if (dbEmails && dbEmails.length > 0) {
      dbEmails.forEach((e) => adminSet.add(e.toLowerCase()));
    }
  } catch (err) {
    console.warn('[EMAIL SERVICE] Falling back to default super admin emails:', err);
  }
  return Array.from(adminSet);
};


export const getFromAddress = () => {
  const envFrom = process.env.SMTP_FROM;
  if (envFrom) {
    return envFrom;
  }
  return `"${SENDER_NAME}" <${DEFAULT_SENDER_EMAIL}>`;
};

export const getReplyToAddress = () => {
  const envReply = process.env.SMTP_REPLY_TO;
  if (envReply) {
    return envReply;
  }
  return NO_REPLY_HEADER;
};

export const DEFAULT_SMTP_USER = process.env.SMTP_USER || DEFAULT_SENDER_EMAIL;
export const DEFAULT_SMTP_PASS = process.env.SMTP_PASS || '';

export const getSmtpUser = (): string => {
  return process.env.SMTP_USER || DEFAULT_SMTP_USER;
};

export const getSmtpPass = (): string => {
  return (process.env.SMTP_PASS || '').replace(/\s+/g, '');
};

export const EMAILS_ENABLED = true;

export const isSmtpConfigured = (): boolean => {
  if (!EMAILS_ENABLED || process.env.DISABLE_ALL_EMAILS === 'true') {
    return false;
  }
  return Boolean(getSmtpUser() && getSmtpPass());
};

let cachedTransporter: nodemailer.Transporter | null = null;
let lastTransporterUser = '';
let lastTransporterPass = '';
let lastTransporterPort = 0;

export const getTransporter = () => {
  const user = getSmtpUser();
  const pass = getSmtpPass();
  const port = Number(process.env.SMTP_PORT) || 587;

  if (cachedTransporter && user === lastTransporterUser && pass === lastTransporterPass && port === lastTransporterPort) {
    return cachedTransporter;
  }

  lastTransporterUser = user;
  lastTransporterPass = pass;
  lastTransporterPort = port;

  const isSecure = port === 465;

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: isSecure,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    family: 4, // Force IPv4 to prevent ENETUNREACH on platforms without IPv6 routing (e.g. Render)
    auth: {
      user,
      pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: false
    }
  } as any);

  return cachedTransporter;
};

// Testing override target per user requirement
export const TESTING_TEST_EMAIL = process.env.TESTING_TEST_EMAIL || DEFAULT_TEST_RECIPIENT_EMAIL;

// Transporter proxy with hard safety suppression switch and testing routing override
const transporter = {
  sendMail: async (options: nodemailer.SendMailOptions) => {
    if (!EMAILS_ENABLED || process.env.DISABLE_ALL_EMAILS === 'true') {
      console.log(`[EMAIL DISPATCH SUPPRESSED] Outgoing mail to ${JSON.stringify(options.to)} blocked (all emails disabled).`);
      return { messageId: '<suppressed@cicr.internal>', accepted: [], rejected: [], response: '250 Mock/Suppressed OK' } as any;
    }

    return getTransporter().sendMail(options);
  },
  verify: (callback?: any) => {
    if (!EMAILS_ENABLED || process.env.DISABLE_ALL_EMAILS === 'true') {
      if (typeof callback === 'function') callback(null, true);
      return Promise.resolve(true);
    }
    return getTransporter().verify(callback);
  }
};

export interface HolderSummary {
  borrower_name: string;
  roll_number?: string | null;
  quantity: number;
  borrowed_at?: string | null;
}

export interface BorrowEmailContext {
  itemName: string;
  category?: string | null;
  quantity: number;
  remainingStock: number;
  holders: HolderSummary[];
  durationDays: number;
  dueDate: Date | string;
}

const formatDueDate = (dueDate: Date | string): string => {
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return String(dueDate);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const formatSmtpError = (error: any): string => {
  const parts: string[] = [];
  if (error?.message) parts.push(`message=${JSON.stringify(error.message)}`);
  if (error?.code !== undefined && error?.code !== null) parts.push(`code=${JSON.stringify(error.code)}`);
  if (error?.response) parts.push(`response=${JSON.stringify(error.response)}`);
  if (error?.responseCode !== undefined && error?.responseCode !== null) parts.push(`responseCode=${JSON.stringify(error.responseCode)}`);
  return parts.length ? parts.join(' ') : 'Unknown SMTP error';
};

// Allow Nodemailer and the authenticated SMTP relay to generate the official,
// DKIM-signed RFC 2822 Message-ID to ensure zero spoofing/quarantine penalties.
const generateMessageId = (): undefined => undefined;

// Shared delivery headers for authentic system appearance
const buildHeaders = (kind: string, priority: 'high' | 'normal' = 'normal') => ({
  'X-CICR-Mailer': 'CICR-Inventory/v2.0-Core',
  'X-Mailer-Type': kind,
  'X-Priority': priority === 'high' ? '1 (Highest)' : '3 (Normal)',
  'Importance': priority === 'high' ? 'High' : 'Normal',
});

const logDelivery = (kind: string, info: any): void => {
  console.log(
    `[EMAIL SERVICE] ${kind} accepted by SMTP | messageId=${info?.messageId} | ` +
    `response="${info?.response}" | accepted=${JSON.stringify(info?.accepted || [])} | ` +
    `rejected=${JSON.stringify(info?.rejected || [])}`
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// AESTHETIC CYBER DARK EMAIL TEMPLATE ENGINE (ZERO EMOJIS)
// ──────────────────────────────────────────────────────────────────────────────

interface CyberEmailOptions {
  badgeText: string;
  badgeType?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  title: string;
  subtitle?: string;
  contentHtml: string;
  actionButton?: {
    text: string;
    url: string;
  };
}

const renderCyberEmail = (options: CyberEmailOptions): string => {
  const badgeColors: Record<string, { bg: string; text: string; border: string }> = {
    primary: { bg: 'rgba(0, 240, 255, 0.08)', text: '#00f0ff', border: 'rgba(0, 240, 255, 0.25)' },
    success: { bg: 'rgba(57, 255, 20, 0.08)', text: '#39ff14', border: 'rgba(57, 255, 20, 0.25)' },
    warning: { bg: 'rgba(250, 204, 21, 0.08)', text: '#facc15', border: 'rgba(250, 204, 21, 0.25)' },
    danger: { bg: 'rgba(239, 68, 68, 0.08)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.25)' },
    info: { bg: 'rgba(168, 85, 247, 0.08)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.25)' }
  };

  const badge = badgeColors[options.badgeType || 'primary'];
  const btnHtml = options.actionButton
    ? `
      <div style="text-align: center; margin: 28px 0 6px 0;">
        <a href="${options.actionButton.url}" style="display: inline-block; background: #00f0ff; color: #080b11; text-decoration: none; font-weight: 700; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; padding: 12px 28px; border-radius: 4px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;">
          ${options.actionButton.text}
        </a>
      </div>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#07090e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;-webkit-font-smoothing:antialiased;">
      <div style="background-color:#07090e;padding:36px 12px;">
        <div style="max-width:560px;margin:0 auto;background:#0d111a;border:1px solid #1e293b;border-radius:6px;overflow:hidden;">
          
          <!-- System Header -->
          <div style="padding:22px 28px;border-bottom:1px solid #1e293b;background:#0f1422;">
            <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:15px;font-weight:700;color:#f8fafc;letter-spacing:1.5px;">
              CICR <span style="color:#00f0ff;">//</span> INVENTORY
            </div>
            <div style="font-size:11px;color:#64748b;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;letter-spacing:0.5px;margin-top:2px;">
              CENTRE FOR INNOVATION, CONTROL & ROBOTICS
            </div>
          </div>

          <!-- Body Content -->
          <div style="padding:28px;">
            
            <!-- Category Badge -->
            <div style="margin-bottom:16px;">
              <span style="display:inline-block;padding:4px 10px;font-size:10px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:3px;background:${badge.bg};color:${badge.text};border:1px solid ${badge.border};">
                ${options.badgeText}
              </span>
            </div>

            <!-- Title -->
            <h1 style="margin:0 0 8px 0;font-size:19px;font-weight:600;color:#ffffff;line-height:1.3;">
              ${options.title}
            </h1>
            ${options.subtitle ? `<p style="margin:0 0 20px 0;font-size:13px;color:#94a3b8;line-height:1.5;">${options.subtitle}</p>` : '<div style="margin-bottom:18px;"></div>'}

            <!-- Main Content -->
            ${options.contentHtml}

            <!-- Action Button -->
            ${btnHtml}

          </div>

          <!-- Authentic System Footer -->
          <div style="padding:18px 28px;background:#080b12;border-top:1px solid #1e293b;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:10px;color:#64748b;line-height:1.6;">
            <div style="color:#94a3b8;font-weight:600;margin-bottom:2px;letter-spacing:0.5px;">
              AUTOMATED TRANSMISSION // NO-REPLY
            </div>
            <div>
              Centre for Innovation, Control & Robotics (CICR) &bull; JIIT Sector 128
            </div>
            <div style="color:#475569;margin-top:4px;">
              This is an authenticated system transmission. Do not reply to this email address.
            </div>
          </div>

        </div>
      </div>
    </body>
    </html>
  `;
};

const buildHoldersTable = (holders: HolderSummary[]): string => {
  if (!holders.length) {
    return '<p style="color:#64748b;font-size:12px;margin:8px 0 0 0;font-family:\'SFMono-Regular\',Consolas,monospace;">Active holders: None (Sole Holder)</p>';
  }
  const rows = holders
    .map((h) => {
      const who = `${h.borrower_name}${h.roll_number ? ` (${h.roll_number})` : ''}`;
      const when = h.borrowed_at ? new Date(h.borrowed_at).toLocaleDateString('en-GB') : 'N/A';
      return `
        <tr>
          <td style="padding:8px 12px;border:1px solid #1e293b;color:#e2e8f0;">${who}</td>
          <td style="padding:8px 12px;border:1px solid #1e293b;color:#00f0ff;text-align:center;font-family:'SFMono-Regular',Consolas,monospace;">${h.quantity}</td>
          <td style="padding:8px 12px;border:1px solid #1e293b;color:#94a3b8;font-family:'SFMono-Regular',Consolas,monospace;">${when}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <div style="margin-top:16px;">
      <div style="font-family:'SFMono-Regular',Consolas,monospace;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Current Item Holders</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;background:#090c13;">
        <thead>
          <tr style="background:#0f1422;">
            <th style="padding:8px 12px;border:1px solid #1e293b;text-align:left;color:#94a3b8;font-weight:600;">Borrower</th>
            <th style="padding:8px 12px;border:1px solid #1e293b;text-align:center;color:#94a3b8;font-weight:600;">Units</th>
            <th style="padding:8px 12px;border:1px solid #1e293b;text-align:left;color:#94a3b8;font-weight:600;">Issue Date</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;
};

// ──────────────────────────────────────────────────────────────────────────────
// 1. BORROW CONFIRMATION EMAIL (STUDENT)
// ──────────────────────────────────────────────────────────────────────────────

export const sendBorrowConfirmation = async (
  recipientEmail: string,
  borrowerName: string,
  context: BorrowEmailContext
) => {
  try {
    const formattedDueDate = formatDueDate(context.dueDate);
    const holdersTable = buildHoldersTable(context.holders);
    const categoryLine = context.category ? ` [${context.category}]` : '';

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:130px;font-family:'SFMono-Regular',Consolas,monospace;">ITEM:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.itemName}${categoryLine}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">QUANTITY:</td>
            <td style="padding:6px 0;color:#00f0ff;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${context.quantity} unit(s)</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">DUE DATE:</td>
            <td style="padding:6px 0;color:#facc15;font-weight:600;">${formattedDueDate} (${context.durationDays} days)</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">LAB STOCK LEFT:</td>
            <td style="padding:6px 0;color:#39ff14;font-family:'SFMono-Regular',Consolas,monospace;">${context.remainingStock} units</td>
          </tr>
        </table>
      </div>
      ${holdersTable}
      <div style="background:rgba(250,204,21,0.05);border-left:3px solid #facc15;padding:12px;border-radius:2px;font-size:12px;color:#cbd5e1;margin-top:18px;line-height:1.5;">
        <strong style="color:#facc15;">Return Policy:</strong> Please return all components on or before <strong>${formattedDueDate}</strong> to maintain lab eligibility.
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      cc: SUPER_ADMIN_EMAILS.join(', '),
      subject: `[CICR Inventory] Hardware Issue Confirmation: ${context.itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('borrow-confirmation'),
      priority: 'normal' as const,
      text: [
        `CICR INVENTORY // HARDWARE ISSUE CONFIRMATION`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `You have checked out ${context.quantity} unit(s) of ${context.itemName}${categoryLine}.`,
        ``,
        `Due Date: ${formattedDueDate} (${context.durationDays} day(s))`,
        `Remaining Available Stock: ${context.remainingStock}`,
        ``,
        `Return Policy: Please return all components on or before the due date.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'TRANSACTION // HARDWARE ISSUED',
        badgeType: 'primary',
        title: `Hardware Issued: ${context.itemName}`,
        subtitle: `Hello ${borrowerName}, your component checkout request has been registered.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Borrow confirmation dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('borrow-confirmation', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Borrow confirmation email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send borrow email to ${recipientEmail}: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 2. ADMIN BORROW APPROVAL OTP EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendOtpEmail = async (
  adminEmail: string,
  adminName: string,
  studentName: string,
  otp: string,
  itemName: string,
  durationDays: number
) => {
  try {
    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">REQUESTER:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${studentName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ITEM:</td>
            <td style="padding:6px 0;color:#00f0ff;font-weight:600;">${itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">DURATION:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${durationDays} day(s)</td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:8px;color:#00f0ff;background:#030712;padding:16px 24px;border:1px solid #1e293b;border-radius:4px;display:inline-block;">
          ${otp}
        </div>
      </div>
      <p style="font-size:12px;color:#94a3b8;line-height:1.5;margin:0;text-align:center;">
        This single-use OTP expires in <strong>10 minutes</strong>. Provide this code to the student to authorize checkout.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: adminEmail,
      subject: `[CICR Inventory] Authorization OTP: ${otp}`,
      messageId: generateMessageId(),
      headers: buildHeaders('borrow-otp', 'high'),
      priority: 'high' as const,
      text: [
        `CICR INVENTORY // AUTHORIZATION OTP`,
        `================================================`,
        `Hello ${adminName},`,
        ``,
        `${studentName} has requested authorization to borrow: ${itemName} (${durationDays} days).`,
        ``,
        `APPROVAL OTP: ${otp}`,
        ``,
        `Valid for 10 minutes. Share only after verifying the request.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'SECURITY // APPROVAL AUTHORIZATION',
        badgeType: 'warning',
        title: 'Borrow Approval Request',
        subtitle: `Hello ${adminName}, an issuance verification code has been generated.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] OTP dispatched to admin ${adminEmail}`);
      return { success: true, mocked: true, otp };
    }

    if (await enqueueEmail('borrow-otp', mailOptions)) {
      return { success: true, queued: true, otp };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('OTP email', info);
    return {
      success: true,
      messageId: info.messageId,
      info: {
        envelope: info.envelope,
        accepted: info.accepted,
        rejected: info.rejected,
        pending: info.pending,
        response: info.response,
        messageId: info.messageId,
        headers: mailOptions.headers,
        replyTo: mailOptions.replyTo
      }
    };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send OTP email to ${adminEmail}: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 3. LOGIN OTP EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendLoginOtpEmail = async (
  recipientEmail: string,
  recipientName: string,
  otp: string
) => {
  try {
    const contentHtml = `
      <div style="text-align:center;margin:24px 0;">
        <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:8px;color:#00f0ff;background:#030712;padding:16px 24px;border:1px solid #1e293b;border-radius:4px;display:inline-block;">
          ${otp}
        </div>
      </div>
      <p style="font-size:12px;color:#94a3b8;line-height:1.5;margin:0;text-align:center;">
        This verification code is valid for <strong>10 minutes</strong>. If you did not initiate this login attempt, please disregard this transmission.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Inventory] Login Verification: ${otp}`,
      messageId: generateMessageId(),
      headers: buildHeaders('login-otp', 'high'),
      priority: 'high' as const,
      text: [
        `CICR INVENTORY // PORTAL ACCESS VERIFICATION`,
        `================================================`,
        `Hello ${recipientName},`,
        ``,
        `Your login verification OTP is: ${otp}`,
        ``,
        `Valid for 10 minutes. Do not share this code.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'SECURITY // AUTHENTICATION',
        badgeType: 'primary',
        title: 'Portal Access Verification',
        subtitle: `Hello ${recipientName}, use the single-use code below to complete your sign-in.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Login OTP dispatched to ${recipientEmail}`);
      return { success: true, mocked: true, otp };
    }

    if (await enqueueEmail('login-otp', mailOptions)) {
      return { success: true, queued: true, otp };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Login OTP email', info);
    return { success: true, messageId: info.messageId, otp };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send login OTP to ${recipientEmail}: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 4. RETURN CONFIRMATION EMAIL (STUDENT)
// ──────────────────────────────────────────────────────────────────────────────

export const sendReturnConfirmation = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  returnedAt: Date
) => {
  try {
    const formattedReturnedAt = returnedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">ITEM:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">RESTOCKED AT:</td>
            <td style="padding:6px 0;color:#39ff14;font-family:'SFMono-Regular',Consolas,monospace;">${formattedReturnedAt} IST</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">STATUS:</td>
            <td style="padding:6px 0;color:#39ff14;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">VERIFIED & CLOSED</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        Thank you for returning the hardware on schedule. Your account loan record has been updated and cleared.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      cc: SUPER_ADMIN_EMAILS.join(', '),
      subject: `[CICR Inventory] Return Receipt: ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('return-confirmation'),
      priority: 'normal' as const,
      text: [
        `CICR INVENTORY // RETURN RECEIPT`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `Your borrowed item "${itemName}" has been successfully returned and restocked in the lab.`,
        ``,
        `Timestamp: ${formattedReturnedAt} IST`,
        `Status: VERIFIED & CLOSED`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'TRANSACTION // RESTOCKED & CLEARED',
        badgeType: 'success',
        title: `Hardware Returned: ${itemName}`,
        subtitle: `Hello ${borrowerName}, your hardware return has been logged successfully.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Return email dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('return-confirmation', mailOptions)) {
      return { success: true, queued: true };
    }

    try {
      const info = await transporter.sendMail(mailOptions);
      logDelivery('Return email', info);
      return { success: true, messageId: info.messageId };
    } catch (directErr: any) {
      console.warn('[EMAIL SERVICE] Return email failed with CC, retrying direct to student:', directErr?.message);
      const fallbackOptions = { ...mailOptions, cc: undefined };
      const info2 = await transporter.sendMail(fallbackOptions);
      logDelivery('Return email fallback', info2);
      return { success: true, messageId: info2.messageId };
    }
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send return email to ${recipientEmail}: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 5. ADMIN REGISTRATION REQUEST ALERT
// ──────────────────────────────────────────────────────────────────────────────

export interface NewUserAlertContext {
  userName: string;
  userEmail: string;
  rollNumber?: string | null;
  username?: string | null;
  batch?: string | null;
  registeredAt?: string;
}

export const sendAdminNewUserRegistrationAlert = async (
  adminEmails: string[],
  userContext: NewUserAlertContext
) => {
  try {
    if (!adminEmails || adminEmails.length === 0) return { success: false, message: 'No admin recipients provided' };

    const regTime = userContext.registeredAt
      ? new Date(userContext.registeredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
      : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:130px;font-family:'SFMono-Regular',Consolas,monospace;">NAME:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${userContext.userName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">${userContext.userEmail}</td>
          </tr>
          ${userContext.username ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">USERNAME:</td>
            <td style="padding:6px 0;color:#ff007a;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">@${userContext.username}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ENROLLMENT:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${userContext.rollNumber || 'N/A'}</td>
          </tr>
          ${userContext.batch ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">BATCH:</td>
            <td style="padding:6px 0;color:#facc15;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${userContext.batch}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">REGISTERED:</td>
            <td style="padding:6px 0;color:#94a3b8;font-family:'SFMono-Regular',Consolas,monospace;">${regTime} IST</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        This account is pending review in the Admin Portal and cannot checkout hardware until approved.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: adminEmails.join(', '),
      subject: `[CICR Admin] Account Access Request: ${userContext.userName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('admin-registration-alert', 'high'),
      priority: 'high' as const,
      text: [
        `CICR ADMIN // NEW ACCOUNT REQUEST`,
        `================================================`,
        `Name: ${userContext.userName}`,
        `Email: ${userContext.userEmail}`,
        `Roll Number: ${userContext.rollNumber || 'Not Specified'}`,
        `Timestamp: ${regTime} IST`,
        `Status: PENDING ADMIN REVIEW`,
        ``,
        `Please log in to the CICR Admin Portal to approve or reject this request.`,
        ``,
        `Regards,`,
        `CICR Automated Security Service`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'QUEUE // APPROVAL PENDING',
        badgeType: 'warning',
        title: 'New Member Registration Request',
        subtitle: 'A student has registered on the portal and requires access approval.',
        contentHtml,
        actionButton: {
          text: 'Review in Admin Portal',
          url: 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Admin registration alert sent to ${adminEmails.join(', ')}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('admin-registration-alert', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Admin Registration Alert email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send admin registration alert: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 6. USER APPROVAL CONFIRMATION EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendUserApprovalSuccessEmail = async (
  recipientEmail: string,
  recipientName: string
) => {
  try {
    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <p style="color:#ffffff;font-size:14px;line-height:1.6;margin:0 0 12px 0;">
          Your account request has been verified and <strong style="color:#39ff14;">APPROVED</strong> by the CICR Admin Team.
        </p>
        <div style="font-size:12px;color:#94a3b8;font-family:'SFMono-Regular',Consolas,monospace;line-height:1.6;">
          &bull; Full access to lab hardware catalog<br/>
          &bull; Borrow microcontrollers, sensors, and robotics modules<br/>
          &bull; Live loan tracking and return scheduling
        </div>
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Inventory] Access Approved: Welcome to CICR Portal`,
      messageId: generateMessageId(),
      headers: buildHeaders('user-approval-success', 'normal'),
      priority: 'normal' as const,
      text: [
        `CICR INVENTORY // ACCESS APPROVED`,
        `================================================`,
        `Hello ${recipientName},`,
        ``,
        `Your account registration for the CICR Robotics Inventory Portal has been APPROVED by the Admin team.`,
        ``,
        `Log in at: https://cicr-inventory.vercel.app/`,
        ``,
        `Best regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'STATUS // ACCESS GRANTED',
        badgeType: 'success',
        title: 'Account Approved',
        subtitle: `Hello ${recipientName}, you now have full access to the CICR Hardware Vault.`,
        contentHtml,
        actionButton: {
          text: 'Log In to Portal',
          url: 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] User approval email dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('user-approval-success', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('User Approval email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send user approval email to ${recipientEmail}: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 7. USER REJECTION NOTIFICATION EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendUserRejectionNotificationEmail = async (
  recipientEmail: string,
  recipientName: string
) => {
  try {
    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <p style="color:#e2e8f0;font-size:13px;line-height:1.6;margin:0;">
          Your account access request for the CICR Robotics Inventory Portal was reviewed by the Admin team and could not be approved at this time.
        </p>
      </div>
      <p style="font-size:12px;color:#64748b;line-height:1.6;margin:0;">
        If you require access for an active JIIT-128 robotics project or competition, please reach out directly to the CICR Admin at <span style="color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">cicrinventory@gmail.com</span>.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Inventory] Registration Status Update`,
      messageId: generateMessageId(),
      headers: buildHeaders('user-rejection', 'normal'),
      priority: 'normal' as const,
      text: [
        `CICR INVENTORY // REGISTRATION STATUS UPDATE`,
        `================================================`,
        `Hello ${recipientName},`,
        ``,
        `Your account registration request for the CICR Robotics Inventory Portal could not be approved at this time.`,
        ``,
        `Contact Admin: cicrinventory@gmail.com`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'STATUS // REQUEST NOT APPROVED',
        badgeType: 'danger',
        title: 'Registration Status Update',
        subtitle: `Hello ${recipientName}, an update regarding your access request.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] User rejection email dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('user-rejection', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('User Rejection email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send user rejection email to ${recipientEmail}: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 8. REAL-TIME ADMIN AUDIT & TRANSACTION NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────────────

export interface AdminBorrowAlertContext {
  borrowerName: string;
  borrowerEmail: string;
  rollNumber?: string | null;
  itemName: string;
  category?: string | null;
  quantity: number;
  remainingStock: number;
  purpose: string;
  durationDays: number;
  dueDate: Date | string;
}

export const sendAdminBorrowNotification = async (
  adminEmails: string[],
  context: AdminBorrowAlertContext
) => {
  try {
    const allAdmins = await getAdminNotificationRecipients();
    const recipients = Array.from(new Set([...(adminEmails || []), ...allAdmins])).filter(Boolean);
    if (!recipients.length) return { success: false, message: 'No admin recipients' };
    const formattedDueDate = formatDueDate(context.dueDate);
    const categoryLine = context.category ? ` [${context.category}]` : '';

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:6px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:130px;font-family:'SFMono-Regular',Consolas,monospace;">BORROWER:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.borrowerName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">${context.borrowerEmail}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ROLL NUMBER:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${context.rollNumber || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">COMPONENT:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.quantity}x ${context.itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">PURPOSE:</td>
            <td style="padding:6px 0;color:#cbd5e1;">${context.purpose}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">RETURN DUE:</td>
            <td style="padding:6px 0;color:#facc15;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${formattedDueDate} (${context.durationDays} days)</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">REMAINING STOCK:</td>
            <td style="padding:6px 0;color:#39ff14;font-family:'SFMono-Regular',Consolas,monospace;">${context.remainingStock} units</td>
          </tr>
        </table>
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipients.join(', '),
      subject: `[CICR Admin Alert] Hardware Issued: ${context.quantity}x ${context.itemName} (${context.borrowerName})`,
      messageId: generateMessageId(),
      headers: buildHeaders('admin-borrow-alert', 'high'),
      priority: 'high' as const,
      text: [
        `CICR ADMIN // LIVE HARDWARE ISSUANCE TELEMETRY`,
        `================================================`,
        `Item: ${context.itemName}${categoryLine}`,
        `Quantity Borrowed: ${context.quantity}`,
        `Remaining Stock: ${context.remainingStock}`,
        `Borrower: ${context.borrowerName} (${context.borrowerEmail})`,
        `Roll Number: ${context.rollNumber || 'N/A'}`,
        `Purpose: ${context.purpose}`,
        `Due Date: ${formattedDueDate} (${context.durationDays} days)`,
        ``,
        `Regards,`,
        `CICR Automated Inventory System`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'TELEMETRY // HARDWARE ISSUED',
        badgeType: 'primary',
        title: `${context.quantity}x ${context.itemName}${categoryLine}`,
        subtitle: `Hardware component issued to ${context.borrowerName}.`,
        contentHtml,
        actionButton: {
          text: 'Open Admin Vault',
          url: 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Admin borrow notification sent to ${recipients.join(', ')}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('admin-borrow-alert', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Admin borrow notification', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send admin borrow notification: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

export interface AdminReturnAlertContext {
  borrowerName: string;
  borrowerEmail?: string;
  itemName: string;
  quantity?: number;
  returnedAt: Date | string;
}

export const sendAdminReturnNotification = async (
  adminEmails: string[],
  context: AdminReturnAlertContext
) => {
  try {
    const allAdmins = await getAdminNotificationRecipients();
    const recipients = Array.from(new Set([...(adminEmails || []), ...allAdmins])).filter(Boolean);
    if (!recipients.length) return { success: false, message: 'No admin recipients' };
    const retTime = new Date(context.returnedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:6px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:130px;font-family:'SFMono-Regular',Consolas,monospace;">COMPONENT:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.quantity ? `${context.quantity}x ` : ''}${context.itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">RETURNED BY:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.borrowerName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">${context.borrowerEmail || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TIMESTAMP:</td>
            <td style="padding:6px 0;color:#39ff14;font-family:'SFMono-Regular',Consolas,monospace;">${retTime} IST</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">STATUS:</td>
            <td style="padding:6px 0;color:#39ff14;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">RESTOCKED & VERIFIED IN VAULT</td>
          </tr>
        </table>
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipients.join(', '),
      subject: `[CICR Admin Alert] Item Restocked: ${context.quantity ? `${context.quantity}x ` : ''}${context.itemName} (${context.borrowerName})`,
      messageId: generateMessageId(),
      headers: buildHeaders('admin-return-alert', 'normal'),
      priority: 'normal' as const,
      text: [
        `CICR ADMIN // HARDWARE RETURN TELEMETRY`,
        `================================================`,
        `Item: ${context.itemName}`,
        `Quantity: ${context.quantity || 1}`,
        `Borrower: ${context.borrowerName} (${context.borrowerEmail || 'N/A'})`,
        `Restocked At: ${retTime} IST`,
        `Status: RESTOCKED & VERIFIED`,
        ``,
        `Regards,`,
        `CICR Automated Inventory System`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'TELEMETRY // ITEM RESTOCKED',
        badgeType: 'success',
        title: `Component Restocked: ${context.quantity ? `${context.quantity}x ` : ''}${context.itemName}`,
        subtitle: `Hardware returned and verified by admin for ${context.borrowerName}.`,
        contentHtml,
        actionButton: {
          text: 'Open Admin Vault',
          url: 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Admin return notification sent to ${adminEmails.join(', ')}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('admin-return-alert', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Admin return notification', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send admin return notification: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

export const sendAdminUserStatusAlert = async (
  adminEmails: string[],
  userName: string,
  userEmail: string,
  status: 'APPROVED' | 'REJECTED',
  performedBy: string
) => {
  try {
    if (!adminEmails || !adminEmails.length) return { success: false, message: 'No admin recipients' };
    const isApproved = status === 'APPROVED';
    const nowTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">USER:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${userName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">${userEmail}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ACTION:</td>
            <td style="padding:6px 0;color:${isApproved ? '#39ff14' : '#ef4444'};font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${status}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">PROCESSED BY:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-weight:600;">${performedBy}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TIMESTAMP:</td>
            <td style="padding:6px 0;color:#94a3b8;font-family:'SFMono-Regular',Consolas,monospace;">${nowTime} IST</td>
          </tr>
        </table>
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: adminEmails.join(', '),
      subject: `[CICR Admin Log] Member ${status}: ${userName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('admin-user-status-log', 'normal'),
      priority: 'normal' as const,
      text: [
        `CICR ADMIN // ACCESS AUDIT LOG`,
        `================================================`,
        `User: ${userName} (${userEmail})`,
        `Action: ${status}`,
        `Processed By: ${performedBy}`,
        `Timestamp: ${nowTime} IST`,
        ``,
        `Regards,`,
        `CICR Automated Inventory System`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: `AUDIT // MEMBER ${status}`,
        badgeType: isApproved ? 'success' : 'danger',
        title: `Member Request ${status}`,
        subtitle: `Access permission processed by ${performedBy}.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Admin user status alert sent to ${adminEmails.join(', ')}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('admin-user-status-log', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Admin user status alert', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send admin user status alert: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 9. UPCOMING & DUE REMINDERS
// ──────────────────────────────────────────────────────────────────────────────

export const sendUpcomingReminder = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  dueDate: Date | string
) => {
  try {
    const formattedDueDate = formatDueDate(dueDate);
    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">ITEM:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">DUE DATE:</td>
            <td style="padding:6px 0;color:#facc15;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">TOMORROW (${formattedDueDate})</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        Please return the item to the CICR lab tomorrow on or before the due date to avoid overdue penalties.
      </p>
    `;

    const recipients = Array.from(new Set([recipientEmail, ...SUPER_ADMIN_EMAILS]));

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipients.join(', '),
      subject: `[CICR Inventory] Return Due Tomorrow: ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('upcoming-reminder'),
      priority: 'normal' as const,
      text: [
        `CICR INVENTORY // RETURN REMINDER`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `Your borrowed item "${itemName}" is due TOMORROW (${formattedDueDate}).`,
        ``,
        `Please return it to the lab on or before the due date.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'SCHEDULE // DUE TOMORROW',
        badgeType: 'warning',
        title: `Return Deadline Tomorrow: ${itemName}`,
        subtitle: `Hello ${borrowerName}, this is an automated schedule reminder.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Upcoming reminder dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('upcoming-reminder', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Upcoming reminder', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send upcoming reminder: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

export const sendReturnReminder = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  dueDate: Date | string,
  daysOverdue: number
) => {
  try {
    const formattedDueDate = formatDueDate(dueDate);
    const overdueNotice = daysOverdue > 0
      ? `This return is ${daysOverdue} day(s) OVERDUE.`
      : 'This item is due TODAY.';

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">ITEM:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ORIGINAL DUE:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${formattedDueDate}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">OVERDUE STATUS:</td>
            <td style="padding:6px 0;color:#ef4444;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${daysOverdue > 0 ? `${daysOverdue} DAYS OVERDUE` : 'DUE TODAY'}</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        Please return the component to the lab immediately to prevent account suspension.
      </p>
    `;

    const recipients = Array.from(new Set([recipientEmail, ...SUPER_ADMIN_EMAILS]));

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipients.join(', '),
      subject: daysOverdue > 0
        ? `[CICR Inventory] OVERDUE Notice: ${itemName}`
        : `[CICR Inventory] Return Due Today: ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('return-reminder', 'high'),
      priority: 'high' as const,
      text: [
        `CICR INVENTORY // OVERDUE RETURN NOTICE`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `${overdueNotice}`,
        `Item: ${itemName}`,
        `Due Date: ${formattedDueDate}`,
        ``,
        `Please return it to the lab at your earliest convenience.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: daysOverdue > 0 ? 'ALERT // OVERDUE NOTICE' : 'SCHEDULE // DUE TODAY',
        badgeType: 'danger',
        title: daysOverdue > 0 ? `Overdue Return Notice: ${itemName}` : `Return Due Today: ${itemName}`,
        subtitle: `Hello ${borrowerName}, urgent return notice for checked-out hardware.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Return reminder dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('return-reminder', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Return reminder', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send return reminder: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

export const sendDueReminder = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  quantity: number,
  dueDate: Date | string,
  dueWindowLabel: string
) => {
  try {
    const formattedDueDate = formatDueDate(dueDate);
    const isOverdue = dueWindowLabel.startsWith('overdue');

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">ITEM:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${quantity}x ${itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">SCHEDULE:</td>
            <td style="padding:6px 0;color:${isOverdue ? '#ef4444' : '#facc15'};font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${dueWindowLabel.toUpperCase()}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">DUE DATE:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${formattedDueDate}</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        Please return the component to the CICR lab${isOverdue ? ' as soon as possible' : ' on or before the due date'}.
      </p>
    `;

    const recipients = Array.from(new Set([recipientEmail, ...SUPER_ADMIN_EMAILS]));

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipients.join(', '),
      subject: `[CICR Inventory] ${isOverdue ? 'OVERDUE' : 'Return Reminder'}: ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('due-reminder'),
      priority: isOverdue ? ('high' as const) : ('normal' as const),
      text: [
        `CICR INVENTORY // RETURN NOTICE`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `${quantity}x ${itemName} is ${dueWindowLabel}.`,
        `Due Date: ${formattedDueDate}`,
        ``,
        `Please return it to the lab on or before the due date.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: isOverdue ? 'ALERT // OVERDUE NOTICE' : 'SCHEDULE // RETURN REMINDER',
        badgeType: isOverdue ? 'danger' : 'warning',
        title: isOverdue ? `Overdue Return: ${itemName}` : `Return Reminder: ${itemName}`,
        subtitle: `Hello ${borrowerName}, please review your component return timeline.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Reminder dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send reminder:`, error.message);
    return { success: false, error: error.message };
  }
};

export interface HardwareRequestEmailContext {
  requestId: string;
  itemName: string;
  category?: string;
  quantity: number;
  borrowerName: string;
  borrowerEmail: string;
  rollNumber?: string | null;
  purpose: string;
  durationDays?: number;
  dueDate?: string;
  requestedAt?: string;
}

export const sendAdminHardwareRequestAlert = async (
  adminEmails: string | string[],
  context: HardwareRequestEmailContext
) => {
  try {
    const allAdmins = await getAdminNotificationRecipients();
    const passed = Array.isArray(adminEmails) ? adminEmails : [adminEmails];
    const recipients = Array.from(new Set([...passed, ...allAdmins])).filter(Boolean);
    if (!recipients.length) return { success: false, message: 'No admin recipients' };

    const requestedDateStr = context.requestedAt
      ? new Date(context.requestedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
      : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:6px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:140px;font-family:'SFMono-Regular',Consolas,monospace;">REQUEST ID:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;font-weight:600;">#${context.requestId.slice(0, 8)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">COMPONENT:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.quantity}x ${context.itemName}</td>
          </tr>
          ${context.category ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">CATEGORY:</td>
            <td style="padding:6px 0;color:#94a3b8;">${context.category.toUpperCase()}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">REQUESTER:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.borrowerName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">${context.borrowerEmail}</td>
          </tr>
          ${context.rollNumber ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ROLL NUMBER:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${context.rollNumber}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">PURPOSE:</td>
            <td style="padding:6px 0;color:#e2e8f0;line-height:1.4;">${context.purpose}</td>
          </tr>
          ${context.dueDate ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EST. DUE DATE:</td>
            <td style="padding:6px 0;color:#facc15;font-family:'SFMono-Regular',Consolas,monospace;">${context.dueDate}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TIMESTAMP:</td>
            <td style="padding:6px 0;color:#94a3b8;font-family:'SFMono-Regular',Consolas,monospace;">${requestedDateStr} IST</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        This request is queued in the Admin Dashboard. Please log in to approve or reject this hardware issue request.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipients.join(', '),
      subject: `[CICR Admin Alert] New Hardware Request: ${context.quantity}x ${context.itemName} (${context.borrowerName})`,
      messageId: generateMessageId(),
      headers: buildHeaders('admin-hardware-request', 'high'),
      priority: 'high' as const,
      text: [
        `CICR INVENTORY // HARDWARE ISSUE REQUEST`,
        `================================================`,
        `A member has submitted an item issue request.`,
        ``,
        `Item: ${context.quantity}x ${context.itemName}`,
        `Requester: ${context.borrowerName} (${context.borrowerEmail})`,
        context.rollNumber ? `Roll Number: ${context.rollNumber}` : '',
        `Purpose: ${context.purpose}`,
        context.dueDate ? `Est. Due Date: ${context.dueDate}` : '',
        `Timestamp: ${requestedDateStr} IST`,
        ``,
        `Please log in to the CICR Admin Portal to review and approve/reject this request.`,
        ``,
        `CICR Inventory System Core`
      ].filter(Boolean).join('\n'),
      html: renderCyberEmail({
        badgeText: 'VAULT // HARDWARE REQUEST',
        badgeType: 'warning',
        title: `Hardware Issue Request: ${context.itemName}`,
        subtitle: `Action required: ${context.borrowerName} has requested ${context.quantity}x ${context.itemName}.`,
        contentHtml,
        actionButton: {
          text: 'Review in Admin Portal',
          url: 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Admin hardware alert dispatched to ${recipients.join(', ')}`);
      return { success: true, mocked: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('admin-hardware-alert', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send admin hardware request alert:`, formatSmtpError(error));
    return { success: false, error: error.message };
  }
};

export const sendHardwareRequestStatusEmail = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  quantity: number,
  status: 'APPROVED' | 'REJECTED',
  reviewedBy: string,
  reason?: string
) => {
  try {
    const isApproved = status === 'APPROVED';

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:130px;font-family:'SFMono-Regular',Consolas,monospace;">COMPONENT:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${quantity}x ${itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">STATUS:</td>
            <td style="padding:6px 0;color:${isApproved ? '#00f0ff' : '#ff007a'};font-weight:700;font-family:'SFMono-Regular',Consolas,monospace;">${status}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">REVIEWED BY:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${reviewedBy}</td>
          </tr>
          ${reason ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">NOTE:</td>
            <td style="padding:6px 0;color:#94a3b8;line-height:1.4;">${reason}</td>
          </tr>` : ''}
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        ${isApproved
          ? 'Your component issue request has been authorized. You may pick up the hardware from the CICR lab.'
          : 'Your component issue request was declined by the administrator. Contact lab management if you need clarification.'}
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      cc: SUPER_ADMIN_EMAILS.join(', '),
      subject: `[CICR Inventory] Request ${status}: ${quantity}x ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('hardware-status-update'),
      priority: isApproved ? ('normal' as const) : ('high' as const),
      text: [
        `CICR INVENTORY // HARDWARE REQUEST UPDATE`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `Your request for ${quantity}x ${itemName} has been ${status}.`,
        `Reviewed By: ${reviewedBy}`,
        reason ? `Note: ${reason}` : '',
        ``,
        isApproved
          ? `Your component issue has been authorized. Please collect your hardware from the lab.`
          : `Your request was declined by the lab administrator.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].filter(Boolean).join('\n'),
      html: renderCyberEmail({
        badgeText: isApproved ? 'DECISION // REQUEST APPROVED' : 'DECISION // REQUEST DECLINED',
        badgeType: isApproved ? 'success' : 'danger',
        title: `Hardware Request ${isApproved ? 'Approved' : 'Declined'}: ${itemName}`,
        subtitle: `Hello ${borrowerName}, your hardware issue request status has been updated.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Hardware status email dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    try {
      const info = await transporter.sendMail(mailOptions);
      logDelivery('hardware-status-update', info);
      return { success: true, messageId: info.messageId };
    } catch (directErr: any) {
      console.warn('[EMAIL SERVICE] Direct send failed with CC, retrying direct to borrower:', directErr?.message);
      const fallbackOptions = { ...mailOptions, cc: undefined };
      const info2 = await transporter.sendMail(fallbackOptions);
      logDelivery('hardware-status-update-fallback', info2);
      return { success: true, messageId: info2.messageId };
    }
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send hardware status email:`, formatSmtpError(error));
    return { success: false, error: error.message };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 14.1 STUDENT HARDWARE ISSUE REQUEST SUBMISSION RECEIPT
// ──────────────────────────────────────────────────────────────────────────────

export const sendStudentHardwareRequestSubmittedEmail = async (
  recipientEmail: string,
  borrowerName: string,
  context: {
    itemName: string;
    quantity: number;
    purpose: string;
    durationDays: number;
    dueDate?: string;
    requestedAt?: string;
  }
) => {
  try {
    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:140px;font-family:'SFMono-Regular',Consolas,monospace;">COMPONENT:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.quantity}x ${context.itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">PURPOSE:</td>
            <td style="padding:6px 0;color:#e2e8f0;line-height:1.4;">${context.purpose}</td>
          </tr>
          ${context.dueDate ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EST. DUE DATE:</td>
            <td style="padding:6px 0;color:#facc15;font-family:'SFMono-Regular',Consolas,monospace;">${context.dueDate}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">STATUS:</td>
            <td style="padding:6px 0;color:#f59e0b;font-weight:700;font-family:'SFMono-Regular',Consolas,monospace;">PENDING ADMIN APPROVAL</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        Your component issue request has been submitted successfully and sent to CICR lab administrators for verification. You will receive an email once your request is reviewed.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Inventory] Request Received: ${context.quantity}x ${context.itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('student-request-submitted'),
      priority: 'normal' as const,
      text: [
        `CICR INVENTORY // HARDWARE REQUEST SUBMITTED`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `Your request for ${context.quantity}x ${context.itemName} has been received and queued for admin review.`,
        `Purpose: ${context.purpose}`,
        context.dueDate ? `Est. Due Date: ${context.dueDate}` : '',
        `Status: PENDING ADMIN APPROVAL`,
        ``,
        `You will receive an update once an administrator reviews your request.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].filter(Boolean).join('\n'),
      html: renderCyberEmail({
        badgeText: 'QUEUE // REQUEST SUBMITTED',
        badgeType: 'warning',
        title: `Hardware Issue Request Queued: ${context.itemName}`,
        subtitle: `Hello ${borrowerName}, your request for ${context.quantity}x ${context.itemName} is under review.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Student request submission receipt sent to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('student-request-submitted', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send student request submission receipt:`, formatSmtpError(error));
    return { success: false, error: error.message };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 14.2 STUDENT RETURN REQUEST SUBMITTED EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendStudentReturnRequestSubmittedEmail = async (
  recipientEmail: string,
  borrowerName: string,
  context: {
    itemName: string;
    quantity: number;
    requestedAt?: string;
  }
) => {
  try {
    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:140px;font-family:'SFMono-Regular',Consolas,monospace;">RETURNING:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.quantity}x ${context.itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">STATUS:</td>
            <td style="padding:6px 0;color:#f59e0b;font-weight:700;font-family:'SFMono-Regular',Consolas,monospace;">PENDING ADMIN APPROVAL</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        Your component return request has been submitted. Please return the hardware in person to the CICR lab. An administrator will inspect the item and approve the return in the portal.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Inventory] Return Request Submitted: ${context.quantity}x ${context.itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('student-return-submitted'),
      priority: 'normal' as const,
      text: [
        `CICR INVENTORY // RETURN REQUEST SUBMITTED`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `Your return request for ${context.quantity}x ${context.itemName} has been submitted for admin approval.`,
        `Please present the hardware in person at the CICR lab for inspection.`,
        ``,
        `Status: PENDING ADMIN APPROVAL`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'RETURN // PENDING VERIFICATION',
        badgeType: 'warning',
        title: `Return Request Submitted: ${context.itemName}`,
        subtitle: `Hello ${borrowerName}, please present ${context.quantity}x ${context.itemName} at the lab for check-in.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Student return request submitted email sent to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('student-return-submitted', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send student return request submitted email:`, formatSmtpError(error));
    return { success: false, error: error.message };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 14.3 ADMIN RETURN REQUEST ALERT EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendAdminReturnRequestAlert = async (
  adminEmails: string | string[],
  context: {
    requestId: string;
    borrowerName: string;
    borrowerEmail?: string;
    rollNumber?: string | null;
    itemName: string;
    quantity: number;
    requestedAt?: string;
  }
) => {
  try {
    const allAdmins = await getAdminNotificationRecipients();
    const passed = Array.isArray(adminEmails) ? adminEmails : [adminEmails];
    const recipients = Array.from(new Set([...passed, ...allAdmins])).filter(Boolean);
    if (!recipients.length) return { success: false, message: 'No admin recipients' };

    const requestedDateStr = context.requestedAt
      ? new Date(context.requestedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
      : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:6px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:140px;font-family:'SFMono-Regular',Consolas,monospace;">REQUEST ID:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;font-weight:600;">#${context.requestId.slice(0, 8)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TYPE:</td>
            <td style="padding:6px 0;color:#f59e0b;font-weight:700;font-family:'SFMono-Regular',Consolas,monospace;">ITEM RETURN VERIFICATION</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">RETURNING:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.quantity}x ${context.itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">MEMBER:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.borrowerName}</td>
          </tr>
          ${context.borrowerEmail ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">${context.borrowerEmail}</td>
          </tr>` : ''}
          ${context.rollNumber ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ROLL NUMBER:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${context.rollNumber}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TIMESTAMP:</td>
            <td style="padding:6px 0;color:#94a3b8;font-family:'SFMono-Regular',Consolas,monospace;">${requestedDateStr} IST</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        A member has submitted a return request. Please inspect the hardware component and approve the return in the Admin Dashboard to restock inventory.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipients.join(', '),
      subject: `[CICR Admin Alert] Return Verification Needed: ${context.quantity}x ${context.itemName} (${context.borrowerName})`,
      messageId: generateMessageId(),
      headers: buildHeaders('admin-return-approval-alert', 'high'),
      priority: 'high' as const,
      text: [
        `CICR INVENTORY // RETURN APPROVAL REQUIRED`,
        `================================================`,
        `A member has requested to return hardware.`,
        ``,
        `Item: ${context.quantity}x ${context.itemName}`,
        `Member: ${context.borrowerName} (${context.borrowerEmail || 'N/A'})`,
        context.rollNumber ? `Roll: ${context.rollNumber}` : '',
        `Timestamp: ${requestedDateStr} IST`,
        ``,
        `Please inspect the item and log in to the CICR Admin Portal to verify the return.`,
        ``,
        `CICR Inventory System Core`
      ].filter(Boolean).join('\n'),
      html: renderCyberEmail({
        badgeText: 'VAULT // RETURN VERIFICATION',
        badgeType: 'warning',
        title: `Return Verification Required: ${context.itemName}`,
        subtitle: `Action required: ${context.borrowerName} has submitted a return request for ${context.quantity}x ${context.itemName}.`,
        contentHtml,
        actionButton: {
          text: 'Verify Return in Portal',
          url: 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Admin return alert dispatched to ${recipients.join(', ')}`);
      return { success: true, mocked: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('admin-return-alert', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send admin return request alert:`, formatSmtpError(error));
    return { success: false, error: error.message };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 15. LOGIN SECURITY ALERT EMAIL (DISPATCHED ON USER/ADMIN LOGIN)
// ──────────────────────────────────────────────────────────────────────────────

export interface LoginSecurityAlertContext {
  userEmail: string;
  userName: string;
  role: string;
  ip?: string;
  userAgent?: string;
  loginTime?: Date | string;
}

export const sendLoginSecurityAlertEmail = async (
  context: LoginSecurityAlertContext
) => {
  try {
    const loginDate = new Date(context.loginTime || new Date());
    const dateStr = loginDate.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const timeStr = loginDate.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }) + ' IST';

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:6px;padding:20px;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#e2e8f0;">
          <tr>
            <td style="padding:8px 0;color:#64748b;width:140px;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;">NAME:</td>
            <td style="padding:8px 0;color:#ffffff;font-weight:600;">${context.userName}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;">EMAIL:</td>
            <td style="padding:8px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;font-weight:600;">${context.userEmail}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;">ROLE:</td>
            <td style="padding:8px 0;color:#ff007a;font-weight:700;font-family:'SFMono-Regular',Consolas,monospace;">${context.role}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;">DATE:</td>
            <td style="padding:8px 0;color:#facc15;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;">TIMESTAMP:</td>
            <td style="padding:8px 0;color:#38bdf8;font-family:'SFMono-Regular',Consolas,monospace;">${timeStr}</td>
          </tr>
          ${context.ip ? `
          <tr>
            <td style="padding:8px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;">IP ADDRESS:</td>
            <td style="padding:8px 0;color:#cbd5e1;font-family:'SFMono-Regular',Consolas,monospace;">${context.ip}</td>
          </tr>` : ''}
        </table>
      </div>
      <p style="font-size:12.5px;color:#94a3b8;line-height:1.6;margin:0 0 14px 0;">
        An autogenerated security notification has detected a new sign-in to your CICR Inventory account.
      </p>
      <p style="font-size:11.5px;color:#64748b;line-height:1.5;margin:0;">
        If you initiated this sign-in, you may safely ignore this message. If you did not perform this login, please update your account password immediately.
      </p>
    `;

    // Strictly dispatch to the user logging in. BCC primary admin for audit visibility.
    const recipients = [context.userEmail];

    const mailOptions: any = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipients.join(', '),
      ...(context.userEmail.toLowerCase() !== MASTER_ADMIN_EMAIL
        ? (process.env.SECURITY_AUDIT_BCC ? { bcc: process.env.SECURITY_AUDIT_BCC } : (MASTER_ADMIN_EMAIL ? { bcc: MASTER_ADMIN_EMAIL } : {}))
        : {}),
      subject: `[CICR Security Alert] New Login Detected: ${context.userName}`,
      headers: buildHeaders('login-security-alert', 'normal'),
      priority: 'normal' as const,
      text: [
        `CICR SECURITY // NEW LOGIN DETECTED`,
        `================================================`,
        `User: ${context.userName}`,
        `Email: ${context.userEmail}`,
        `Role: ${context.role}`,
        `Date: ${dateStr}`,
        `Time: ${timeStr}`,
        context.ip ? `IP: ${context.ip}` : '',
        ``,
        `An autogenerated notification that a new login has been found for your account.`,
        `If you did not perform this sign-in, please change your password immediately.`,
        ``,
        `Regards,`,
        `CICR Security Monitor`
      ].filter(Boolean).join('\n'),
      html: renderCyberEmail({
        badgeText: `SECURITY // ACCESS AUTHORIZED`,
        badgeType: 'success',
        title: `New Login Detected: ${context.userName}`,
        subtitle: `An autogenerated notification for your CICR account.`,
        contentHtml,
        actionButton: {
          text: 'Open CICR Vault',
          url: 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Login alert dispatched to ${recipients.join(', ')}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('login-security-alert', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Login security alert email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send login alert:`, formatSmtpError(error));
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 16. NEW ITEM CREATED TELEMETRY EMAIL (ADMIN CREATION EVENT)
// ──────────────────────────────────────────────────────────────────────────────

export interface ItemCreatedEmailContext {
  itemName: string;
  category: string;
  quantity: number;
  location: string;
  description?: string;
  tags?: string[];
  createdByAdminName: string;
  createdByAdminEmail: string;
  createdAt?: Date | string;
}

export const sendAdminItemCreatedNotification = async (
  context: ItemCreatedEmailContext
) => {
  try {
    const createdTimeStr = new Date(context.createdAt || new Date()).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const rawTags: any = context.tags;
    const tagsArray: string[] = Array.isArray(rawTags)
      ? rawTags
      : (typeof rawTags === 'string' && rawTags.trim()
          ? (rawTags.startsWith('[') ? (() => { try { return JSON.parse(rawTags); } catch { return []; } })() : rawTags.split(',').map((s: string) => s.trim()))
          : []);
    const tagsHtml = (tagsArray && tagsArray.length)
      ? tagsArray.map((t: string) => `<span style="display:inline-block;padding:2px 8px;margin:2px;background:#0d1527;border:1px solid #00f0ff;border-radius:3px;color:#00f0ff;font-size:11px;font-family:'SFMono-Regular',Consolas,monospace;">#${t}</span>`).join(' ')
      : '<span style="color:#64748b;">None</span>';

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:130px;font-family:'SFMono-Regular',Consolas,monospace;">ITEM NAME:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:700;font-size:14px;">${context.itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">CATEGORY:</td>
            <td style="padding:6px 0;color:#00f0ff;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${context.category.toUpperCase()}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">INITIAL STOCK:</td>
            <td style="padding:6px 0;color:#39ff14;font-weight:700;font-family:'SFMono-Regular',Consolas,monospace;">${context.quantity} unit(s)</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">STORAGE LOCATION:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${context.location}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">REGISTERED BY:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.createdByAdminName} <span style="color:#00f0ff;font-size:12px;">(${context.createdByAdminEmail})</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TIMESTAMP:</td>
            <td style="padding:6px 0;color:#facc15;font-family:'SFMono-Regular',Consolas,monospace;">${createdTimeStr} IST</td>
          </tr>
          ${context.description ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;vertical-align:top;">SPECIFICATIONS:</td>
            <td style="padding:6px 0;color:#cbd5e1;line-height:1.4;">${context.description}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;vertical-align:top;">TAGS:</td>
            <td style="padding:6px 0;">${tagsHtml}</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        This new hardware component has been vaulted into the live inventory database and is now discoverable by authorized laboratory students.
      </p>
    `;

    const adminRecipients = Array.from(new Set([context.createdByAdminEmail, ...SUPER_ADMIN_EMAILS]));

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: adminRecipients.join(', '),
      subject: `[CICR Admin] New Hardware Component Added: ${context.itemName} (${context.quantity}x)`,
      messageId: generateMessageId(),
      headers: buildHeaders('item-created-telemetry', 'high'),
      priority: 'high' as const,
      text: [
        `CICR ADMIN // NEW HARDWARE COMPONENT VAULTED`,
        `================================================`,
        `Component: ${context.itemName} [${context.category.toUpperCase()}]`,
        `Quantity: ${context.quantity} unit(s)`,
        `Location: ${context.location}`,
        `Registered By: ${context.createdByAdminName} (${context.createdByAdminEmail})`,
        `Timestamp: ${createdTimeStr} IST`,
        context.description ? `Specifications: ${context.description}` : '',
        ``,
        `View live catalog: https://cicr-inventory.vercel.app/`,
        ``,
        `Regards,`,
        `CICR Automated Inventory Engine`
      ].filter(Boolean).join('\n'),
      html: renderCyberEmail({
        badgeText: 'VAULT // COMPONENT REGISTERED',
        badgeType: 'success',
        title: `Component Added: ${context.itemName}`,
        subtitle: `Registered into CICR Inventory by ${context.createdByAdminName}.`,
        contentHtml,
        actionButton: {
          text: 'View in Vault Catalog',
          url: 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Item creation alert dispatched to ${adminRecipients.join(', ')}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('item-created-telemetry', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Item created telemetry email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send item creation email:`, formatSmtpError(error));
    return { success: false, error: formatSmtpError(error) };
  }
};

export interface ItemDeletedEmailContext {
  itemName: string;
  category: string;
  quantity: number;
  location?: string;
  deletedByAdminName: string;
  deletedByAdminEmail: string;
  deletedAt?: Date | string;
}

export const sendAdminItemDeletedNotification = async (
  context: ItemDeletedEmailContext
) => {
  try {
    const deletedTimeStr = new Date(context.deletedAt || new Date()).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #ef4444;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:130px;font-family:'SFMono-Regular',Consolas,monospace;">PURGED ITEM:</td>
            <td style="padding:6px 0;color:#ef4444;font-weight:700;font-size:14px;">${context.itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">CATEGORY:</td>
            <td style="padding:6px 0;color:#00f0ff;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${(context.category || 'General').toUpperCase()}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">REMOVED UNITS:</td>
            <td style="padding:6px 0;color:#facc15;font-weight:700;font-family:'SFMono-Regular',Consolas,monospace;">${context.quantity} unit(s)</td>
          </tr>
          ${context.location ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">PREVIOUS LOCATION:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${context.location}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">DELETED BY:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.deletedByAdminName} <span style="color:#00f0ff;font-size:12px;">(${context.deletedByAdminEmail})</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TIMESTAMP:</td>
            <td style="padding:6px 0;color:#facc15;font-family:'SFMono-Regular',Consolas,monospace;">${deletedTimeStr} IST</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        This hardware component has been permanently deleted from the active inventory catalog and Supabase database by an authorized administrator.
      </p>
    `;

    const adminRecipients = Array.from(new Set([context.deletedByAdminEmail, ...SUPER_ADMIN_EMAILS]));

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: adminRecipients.join(', '),
      subject: `[CICR Admin] Hardware Component Deleted: ${context.itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('item-deleted-telemetry', 'high'),
      priority: 'high' as const,
      text: [
        `CICR ADMIN // HARDWARE COMPONENT PURGED`,
        `================================================`,
        `Component: ${context.itemName} [${(context.category || 'General').toUpperCase()}]`,
        `Units Removed: ${context.quantity} unit(s)`,
        `Deleted By: ${context.deletedByAdminName} (${context.deletedByAdminEmail})`,
        `Timestamp: ${deletedTimeStr} IST`,
        ``,
        `This component has been permanently deleted from the database.`,
        ``,
        `Regards,`,
        `CICR Automated Inventory Engine`
      ].filter(Boolean).join('\n'),
      html: renderCyberEmail({
        badgeText: 'VAULT // COMPONENT REMOVED',
        badgeType: 'danger',
        title: `Component Deleted: ${context.itemName}`,
        subtitle: `Removed from CICR Inventory by ${context.deletedByAdminName}.`,
        contentHtml,
        actionButton: {
          text: 'Open Admin Portal',
          url: 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Item deletion alert dispatched to ${adminRecipients.join(', ')}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('item-deleted-telemetry', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Item deleted telemetry email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send item deletion email:`, formatSmtpError(error));
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 21. NEW USER REGISTRATION & TEMPORARY PASSWORD EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export interface UserWelcomeContext {
  userName: string;
  userEmail: string;
  tempPassword?: string;
  rollNumber?: string | null;
  batch?: string | null;
  portalUrl?: string;
  isAutoApproved?: boolean;
}

export const sendUserWelcomeWithTempPasswordEmail = async (
  recipientEmail: string,
  context: UserWelcomeContext
) => {
  try {
    const portalUrl = context.portalUrl || process.env.CLIENT_URL || 'https://cicr-inventory.vercel.app/';
    const rollDisplay = context.rollNumber ? context.rollNumber : 'N/A';
    const batchDisplay = context.batch ? context.batch : 'N/A';
    const hasTempPassword = Boolean(context.tempPassword);

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:6px;padding:20px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:140px;font-family:'SFMono-Regular',Consolas,monospace;">NAME:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.userName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">COLLEGE EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${context.userEmail}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ENROLLMENT NO:</td>
            <td style="padding:6px 0;color:#cbd5e1;font-family:'SFMono-Regular',Consolas,monospace;">${rollDisplay}</td>
          </tr>
        </table>
      </div>

      ${hasTempPassword ? `
      <div style="background:rgba(0, 240, 255, 0.05);border:1px solid rgba(0, 240, 255, 0.3);border-radius:6px;padding:18px;margin-bottom:18px;text-align:center;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#00f0ff;text-transform:uppercase;margin-bottom:8px;font-family:'SFMono-Regular',Consolas,monospace;">
          // TEMPORARY ACCESS CREDENTIALS
        </div>
        <div style="font-family:'SFMono-Regular',Consolas,monospace;font-size:22px;font-weight:800;letter-spacing:2px;color:#ffffff;background:#05070e;display:inline-block;padding:10px 24px;border-radius:4px;border:1px solid rgba(0, 240, 255, 0.4);box-shadow:0 0 15px rgba(0, 240, 255, 0.2);">
          ${context.tempPassword}
        </div>
        <div style="font-size:12px;color:#94a3b8;margin-top:10px;">
          Use this temporary password along with your college email to sign in.
        </div>
      </div>
      ` : ''}

      <div style="background:rgba(250,204,21,0.08);border-left:3px solid #facc15;padding:14px;border-radius:4px;font-size:12.5px;color:#e2e8f0;margin-top:14px;line-height:1.5;">
        <strong style="color:#facc15;">Security Advisory:</strong> For your security, please log in to the CICR Robotics Vault and <strong>reset your password</strong> to a secure personal password of your choice immediately.
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Vault] Welcome to CICR Inventory - Your Account & Credentials`,
      messageId: generateMessageId(),
      headers: buildHeaders('user-welcome-credentials', 'high'),
      priority: 'high' as const,
      text: [
        `CICR ROBOTICS VAULT // ACCOUNT PROVISIONED`,
        `================================================`,
        `Welcome ${context.userName},`,
        ``,
        `Your account has been created on the CICR Robotics Inventory Vault.`,
        `Email: ${context.userEmail}`,
        `Enrollment No: ${rollDisplay}`,
        ...(hasTempPassword ? [
          ``,
          `TEMPORARY PASSWORD: ${context.tempPassword}`,
          `Please sign in using this temporary password.`
        ] : []),
        ``,
        `IMPORTANT: Please log in at ${portalUrl} and reset your temporary password immediately.`,
        ``,
        `Regards,`,
        `CICR Administration Team`
      ].filter(Boolean).join('\n'),
      html: renderCyberEmail({
        badgeText: 'SECURITY // ACCOUNT ACTIVATED',
        badgeType: 'success',
        title: `Welcome to CICR Vault`,
        subtitle: `Your student portal account has been created successfully.`,
        contentHtml,
        actionButton: {
          text: 'Sign In to CICR Vault',
          url: portalUrl
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Welcome & Temporary Password email dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('user-welcome-credentials', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('User welcome & temp password email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send user welcome email:`, formatSmtpError(error));
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 22. PASSWORD RESET OTP EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendPasswordResetOtpEmail = async (
  recipientEmail: string,
  context: { userName: string; otp: string; expiresInMinutes?: number }
) => {
  try {
    const minutes = context.expiresInMinutes || 10;
    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:6px;padding:22px;margin-bottom:18px;text-align:center;">
        <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#38bdf8;text-transform:uppercase;margin-bottom:12px;font-family:'SFMono-Regular',Consolas,monospace;">
          // ONE-TIME VERIFICATION CODE
        </div>
        <div style="font-family:'SFMono-Regular',Consolas,monospace;font-size:32px;font-weight:800;letter-spacing:6px;color:#00f0ff;background:#05070e;display:inline-block;padding:12px 28px;border-radius:6px;border:1px solid rgba(0, 240, 255, 0.45);box-shadow:0 0 20px rgba(0, 240, 255, 0.25);">
          ${context.otp}
        </div>
        <div style="font-size:12px;color:#94a3b8;margin-top:14px;">
          This code is valid for <strong>${minutes} minutes</strong>. Do not share it with anyone.
        </div>
      </div>
      <div style="background:rgba(239,68,68,0.08);border-left:3px solid #ef4444;padding:12px;border-radius:2px;font-size:12px;color:#e2e8f0;margin-top:14px;line-height:1.5;">
        <strong style="color:#ef4444;">Did not request this?</strong> If you did not initiate a password reset, you can safely disregard this email. Your current password remains unchanged.
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Security] Password Reset OTP Code: ${context.otp}`,
      messageId: generateMessageId(),
      headers: buildHeaders('password-reset-otp', 'high'),
      priority: 'high' as const,
      text: [
        `CICR SECURITY // PASSWORD RESET CODE`,
        `================================================`,
        `Hello ${context.userName},`,
        ``,
        `Your password reset verification code is: ${context.otp}`,
        `This code is valid for ${minutes} minutes.`,
        ``,
        `If you did not request this, please ignore this email.`,
        ``,
        `Regards,`,
        `CICR Security Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'SECURITY // PASSWORD RESET',
        badgeType: 'warning',
        title: 'Reset Your Password',
        subtitle: `Verification code for ${context.userName}`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Password reset OTP [${context.otp}] dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('password-reset-otp', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Password reset OTP email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send password reset OTP:`, formatSmtpError(error));
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 23. PASSWORD CHANGED NOTIFICATION EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendPasswordChangedSuccessEmail = async (
  recipientEmail: string,
  context: { userName: string; changedAt?: Date }
) => {
  try {
    const timeStr = (context.changedAt || new Date()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:6px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:140px;font-family:'SFMono-Regular',Consolas,monospace;">ACCOUNT:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.userName} (${recipientEmail})</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">STATUS:</td>
            <td style="padding:6px 0;color:#39ff14;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">PASSWORD UPDATED SUCCESSFULLY</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TIMESTAMP:</td>
            <td style="padding:6px 0;color:#cbd5e1;font-family:'SFMono-Regular',Consolas,monospace;">${timeStr} IST</td>
          </tr>
        </table>
      </div>
      <div style="background:rgba(59,130,246,0.08);border-left:3px solid #3b82f6;padding:12px;border-radius:2px;font-size:12px;color:#cbd5e1;margin-top:14px;line-height:1.5;">
        If you did not make this change, please contact the CICR Lab Administrator immediately at <strong>cicrinventory@gmail.com</strong>.
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Security] Your Password Has Been Updated`,
      messageId: generateMessageId(),
      headers: buildHeaders('password-changed-notification'),
      priority: 'normal' as const,
      text: [
        `CICR SECURITY // PASSWORD CHANGED`,
        `================================================`,
        `Hello ${context.userName},`,
        ``,
        `Your password for the CICR Inventory Vault was successfully changed at ${timeStr} IST.`,
        ``,
        `If you did not authorize this change, please notify administrators immediately.`,
        ``,
        `Regards,`,
        `CICR Security Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'SECURITY // CREDENTIALS UPDATED',
        badgeType: 'success',
        title: 'Password Updated',
        subtitle: `Your password was changed successfully.`,
        contentHtml,
        actionButton: {
          text: 'Sign In to CICR Vault',
          url: process.env.CLIENT_URL || 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Password changed alert dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('password-changed-notification', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Password changed notification email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send password changed email:`, formatSmtpError(error));
    return { success: false, error: formatSmtpError(error) };
  }
};
