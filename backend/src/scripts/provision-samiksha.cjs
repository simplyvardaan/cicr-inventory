/**
 * Script to provision Samiksha Jhunjhunwala's account and dispatch a fully responsive,
 * ultra-aesthetic cyber dark welcome email with zero emojis.
 */
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from backend/.env or root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const MEMBER_DATA = {
  name: 'Samiksha Jhunjhunwala',
  email: 'njg269574@mail.jiit.ac.in',
  roll_number: 'njg269574',
  batch: 'E4',
  branch: 'ECM',
  role: 'MEMBER',
  tempPassword: 'CICR_INVENTORY@1234'
};

async function provisionAndSendEmail() {
  console.log('================================================================');
  console.log('CICR // PROVISIONING USER ACCOUNT & DISPATCHING WELCOME EMAIL');
  console.log('Name:        ', MEMBER_DATA.name);
  console.log('Email:       ', MEMBER_DATA.email);
  console.log('Roll Number: ', MEMBER_DATA.roll_number);
  console.log('Batch/Branch:', MEMBER_DATA.batch, MEMBER_DATA.branch);
  console.log('Role:        ', MEMBER_DATA.role);
  console.log('Temp Pass:   ', MEMBER_DATA.tempPassword);
  console.log('================================================================\n');

  // 1. Hash temporary password
  const salt = bcrypt.genSaltSync(10);
  const password_hash = bcrypt.hashSync(MEMBER_DATA.tempPassword, salt);

  // 2. Check and upsert in Supabase
  console.log('[1/4] Querying Supabase database...');
  const { data: existingUser, error: checkErr } = await supabase
    .from('users')
    .select('id, name, email, roll_number, role')
    .or(`email.ilike.${MEMBER_DATA.email},roll_number.ilike.${MEMBER_DATA.roll_number}`)
    .maybeSingle();

  if (checkErr) {
    console.warn('[WARN] Error querying Supabase:', checkErr.message);
  }

  let finalUserId = null;

  if (existingUser) {
    console.log(`[INFO] User already exists (ID: ${existingUser.id}). Updating password hash & profile...`);
    const { data: updated, error: updErr } = await supabase
      .from('users')
      .update({
        name: MEMBER_DATA.name,
        email: MEMBER_DATA.email.toLowerCase(),
        roll_number: MEMBER_DATA.roll_number,
        role: MEMBER_DATA.role,
        password_hash
      })
      .eq('id', existingUser.id)
      .select('id')
      .single();

    if (updErr) {
      console.error('[ERROR] Failed to update user in Supabase:', updErr.message);
      process.exit(1);
    }
    finalUserId = updated.id;
    console.log('[OK] User record successfully updated in Supabase.');
  } else {
    console.log('[INFO] Inserting new user record into Supabase...');
    const { data: inserted, error: insErr } = await supabase
      .from('users')
      .insert([{
        name: MEMBER_DATA.name,
        email: MEMBER_DATA.email.toLowerCase(),
        roll_number: MEMBER_DATA.roll_number,
        role: MEMBER_DATA.role,
        password_hash,
        created_at: new Date().toISOString()
      }])
      .select('id')
      .single();

    if (insErr) {
      console.error('[ERROR] Insert failed in Supabase:', insErr.message);
      process.exit(1);
    }
    finalUserId = inserted.id;
    console.log(`[OK] User created successfully in Supabase (ID: ${finalUserId}).`);
  }

  // 3. Update local user_approval_data.json cache
  console.log('\n[2/4] Synchronizing approval cache in user_approval_data.json...');
  const approvalFile = path.resolve(__dirname, '../../user_approval_data.json');
  try {
    let approvalDoc = { approvalState: {}, purgedEmails: [] };
    if (fs.existsSync(approvalFile)) {
      approvalDoc = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
      if (!approvalDoc.approvalState) approvalDoc.approvalState = {};
      if (!approvalDoc.purgedEmails) approvalDoc.purgedEmails = [];
    }

    // Unpurge if purged
    approvalDoc.purgedEmails = approvalDoc.purgedEmails.filter(
      e => e.toLowerCase() !== MEMBER_DATA.email.toLowerCase()
    );

    // Set approval status
    approvalDoc.approvalState[MEMBER_DATA.email.toLowerCase()] = {
      status: 'APPROVED',
      role: 'MEMBER',
      approvedAt: new Date().toISOString(),
      approvedBy: 'ADMINISTRATOR PROVISIONING',
      name: MEMBER_DATA.name,
      roll_number: MEMBER_DATA.roll_number,
      batch: `${MEMBER_DATA.batch} ${MEMBER_DATA.branch}`
    };

    fs.writeFileSync(approvalFile, JSON.stringify(approvalDoc, null, 2), 'utf8');
    console.log('[OK] user_approval_data.json successfully synchronized.');
  } catch (err) {
    console.warn('[WARN] Failed to update user_approval_data.json:', err.message);
  }

  // 4. Record audit log
  console.log('\n[3/4] Recording system audit log...');
  try {
    await supabase.from('audit_logs').insert([{
      action: 'Account Provisioned',
      user_id: finalUserId,
      description: `Administrator provisioned student member account for ${MEMBER_DATA.name} (${MEMBER_DATA.email}) [Batch: ${MEMBER_DATA.batch} ${MEMBER_DATA.branch}, Role: ${MEMBER_DATA.role}]`,
      created_at: new Date().toISOString()
    }]);
    console.log('[OK] Audit log entry recorded.');
  } catch (err) {
    console.warn('[WARN] Audit log record skipped:', err.message);
  }

  // 5. Send aesthetic, fully responsive, zero-emoji email
  console.log('\n[4/4] Generating and dispatching responsive aesthetic email (ZERO EMOJIS)...');

  const smtpUser = process.env.SMTP_USER || 'cicrinventory@gmail.com';
  const smtpPass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const portalUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://cicr-inventory.vercel.app/';

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    family: 4,
    tls: {
      rejectUnauthorized: false
    }
  });

  // Verify SMTP connection
  await transporter.verify();
  console.log('[OK] SMTP connection to Gmail verified successfully.');

  const emailHtml = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>CICR Inventory // Account Provisioned</title>
  <style type="text/css">
    body {
      margin: 0 !important;
      padding: 0 !important;
      background-color: #06080d;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table {
      border-collapse: collapse !important;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
    a {
      text-decoration: none;
    }
    .wrapper-table {
      width: 100% !important;
      background-color: #06080d;
      margin: 0;
      padding: 32px 12px;
    }
    .container-table {
      max-width: 580px !important;
      width: 100% !important;
      margin: 0 auto;
      background-color: #0b0f19;
      border: 1px solid #1e293b;
      border-radius: 8px;
      overflow: hidden;
    }
    .mono-text {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace !important;
    }
    .cta-btn {
      display: inline-block;
      background-color: #00f0ff;
      color: #05070c !important;
      font-weight: 800;
      font-size: 13px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 14px 32px;
      border-radius: 4px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
      text-align: center;
      text-decoration: none;
    }
    .password-badge {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 2.5px;
      color: #00f0ff;
      background-color: #05070e;
      display: inline-block;
      padding: 12px 24px;
      border-radius: 4px;
      border: 1px solid rgba(0, 240, 255, 0.45);
    }
    @media only screen and (max-width: 600px) {
      .container-table {
        width: 100% !important;
        border-radius: 4px !important;
      }
      .content-padding {
        padding: 20px 16px !important;
      }
      .header-padding {
        padding: 20px 16px !important;
      }
      .password-badge {
        font-size: 17px !important;
        letter-spacing: 1.5px !important;
        padding: 10px 16px !important;
        word-break: break-all !important;
      }
      .step-table {
        width: 100% !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#06080d;">
  <table role="presentation" width="100%" class="wrapper-table" cellpadding="0" cellspacing="0" border="0" style="background-color:#06080d;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" class="container-table" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;background-color:#0b0f19;border:1px solid #1e293b;border-radius:8px;">
          
          <!-- System Top Header -->
          <tr>
            <td class="header-padding" style="padding:24px 28px;background-color:#0f1422;border-bottom:1px solid #1e293b;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div class="mono-text" style="font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:16px;font-weight:800;color:#f8fafc;letter-spacing:2px;">
                      CICR <span style="color:#00f0ff;">//</span> INVENTORY
                    </div>
                    <div class="mono-text" style="font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:11px;color:#64748b;letter-spacing:0.8px;margin-top:3px;">
                      CENTRE FOR INNOVATION, CONTROL &amp; ROBOTICS
                    </div>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span class="mono-text" style="display:inline-block;padding:4px 8px;font-size:10px;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:3px;background:rgba(57,255,20,0.08);color:#39ff14;border:1px solid rgba(57,255,20,0.3);">
                      [ OK // APPROVED ]
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td class="content-padding" style="padding:28px;">

              <!-- Status Badge -->
              <div style="margin-bottom:16px;">
                <span class="mono-text" style="display:inline-block;padding:4px 10px;font-size:10px;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:3px;background:rgba(0,240,255,0.08);color:#00f0ff;border:1px solid rgba(0,240,255,0.3);">
                  // MEMBERSHIP PROVISIONING
                </span>
              </div>

              <!-- Main Heading -->
              <h1 style="margin:0 0 10px 0;font-size:21px;font-weight:700;color:#ffffff;line-height:1.3;letter-spacing:-0.2px;">
                Welcome to the CICR Vault, Samiksha
              </h1>
              <p style="margin:0 0 22px 0;font-size:13.5px;color:#94a3b8;line-height:1.6;">
                Your student membership account has been provisioned and authorized on the <strong style="color:#ffffff;">CICR Robotics Inventory Portal</strong>. You now have access to request hardware, check lab inventory, and track component allocations.
              </p>

              <!-- Profile Details Card -->
              <div style="background-color:#070a12;border:1px solid #1e293b;border-radius:6px;padding:18px;margin-bottom:22px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
                  <tr>
                    <td class="mono-text" style="padding:7px 0;color:#64748b;width:150px;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:0.5px;">NAME:</td>
                    <td style="padding:7px 0;color:#ffffff;font-weight:600;">Samiksha Jhunjhunwala</td>
                  </tr>
                  <tr>
                    <td class="mono-text" style="padding:7px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:0.5px;border-top:1px solid #121826;">COLLEGE EMAIL:</td>
                    <td class="mono-text" style="padding:7px 0;color:#00f0ff;font-weight:600;font-family:'SFMono-Regular',Consolas,Menlo,monospace;border-top:1px solid #121826;">njg269574@mail.jiit.ac.in</td>
                  </tr>
                  <tr>
                    <td class="mono-text" style="padding:7px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:0.5px;border-top:1px solid #121826;">ENROLLMENT ID:</td>
                    <td class="mono-text" style="padding:7px 0;color:#cbd5e1;font-family:'SFMono-Regular',Consolas,Menlo,monospace;border-top:1px solid #121826;">njg269574</td>
                  </tr>
                  <tr>
                    <td class="mono-text" style="padding:7px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:0.5px;border-top:1px solid #121826;">BATCH / BRANCH:</td>
                    <td style="padding:7px 0;color:#cbd5e1;border-top:1px solid #121826;">E4 &bull; ECM</td>
                  </tr>
                  <tr>
                    <td class="mono-text" style="padding:7px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:0.5px;border-top:1px solid #121826;">ACCESS LEVEL:</td>
                    <td style="padding:7px 0;color:#39ff14;font-weight:600;border-top:1px solid #121826;">Student Member (Approved)</td>
                  </tr>
                </table>
              </div>

              <!-- Temporary Credentials Box -->
              <div style="background-color:rgba(0,240,255,0.04);border:1px solid rgba(0,240,255,0.3);border-radius:6px;padding:22px 16px;margin-bottom:22px;text-align:center;">
                <div class="mono-text" style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#00f0ff;text-transform:uppercase;margin-bottom:10px;font-family:'SFMono-Regular',Consolas,Menlo,monospace;">
                  // TEMPORARY ACCESS CREDENTIALS
                </div>
                <div class="password-badge" style="font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:22px;font-weight:800;letter-spacing:2px;color:#00f0ff;background-color:#05070e;display:inline-block;padding:12px 24px;border-radius:4px;border:1px solid rgba(0,240,255,0.45);">
                  CICR_INVENTORY@1234
                </div>
                <div style="font-size:12px;color:#94a3b8;margin-top:12px;line-height:1.5;">
                  Use your college email and this temporary password to authenticate.
                </div>
              </div>

              <!-- Call To Action Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${portalUrl}" target="_blank" class="cta-btn" style="display:inline-block;background-color:#00f0ff;color:#05070c !important;font-weight:800;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;padding:14px 34px;border-radius:4px;font-family:'SFMono-Regular',Consolas,Menlo,monospace;text-align:center;text-decoration:none;">
                      SIGN IN TO CICR VAULT
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Quick Start Walkthrough -->
              <div style="margin:26px 0 20px 0;background-color:#070a12;border:1px solid #1e293b;border-radius:6px;padding:18px;">
                <div class="mono-text" style="font-size:11px;font-weight:700;letter-spacing:1px;color:#cbd5e1;text-transform:uppercase;margin-bottom:12px;font-family:'SFMono-Regular',Consolas,Menlo,monospace;">
                  // GETTING STARTED IN 3 STEPS
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:12.5px;line-height:1.6;color:#94a3b8;">
                  <tr>
                    <td class="mono-text" style="vertical-align:top;width:64px;color:#00f0ff;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-weight:700;padding:5px 0;">[01]</td>
                    <td style="padding:5px 0;color:#cbd5e1;"><strong style="color:#ffffff;">Sign In:</strong> Access the portal using your JIIT email and temporary password.</td>
                  </tr>
                  <tr>
                    <td class="mono-text" style="vertical-align:top;width:64px;color:#00f0ff;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-weight:700;padding:5px 0;border-top:1px solid #121826;">[02]</td>
                    <td style="padding:5px 0;color:#cbd5e1;border-top:1px solid #121826;"><strong style="color:#ffffff;">Update Password:</strong> Head over to your profile settings and choose a secure personal password.</td>
                  </tr>
                  <tr>
                    <td class="mono-text" style="vertical-align:top;width:64px;color:#00f0ff;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-weight:700;padding:5px 0;border-top:1px solid #121826;">[03]</td>
                    <td style="padding:5px 0;color:#cbd5e1;border-top:1px solid #121826;"><strong style="color:#ffffff;">Explore Inventory:</strong> Request components, microcontrollers, and sensors for your projects.</td>
                  </tr>
                </table>
              </div>

              <!-- Security Notice -->
              <div style="background-color:rgba(250,204,21,0.06);border-left:3px solid #facc15;padding:12px 14px;border-radius:3px;font-size:12px;color:#cbd5e1;line-height:1.5;">
                <strong style="color:#facc15;">Security Advisory:</strong> Do not share your temporary credentials with anyone. Please sign in and update your password immediately upon first login.
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="mono-text" style="padding:20px 28px;background-color:#080b12;border-top:1px solid #1e293b;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:10.5px;color:#64748b;line-height:1.6;">
              <div style="color:#94a3b8;font-weight:600;margin-bottom:2px;letter-spacing:0.5px;">
                AUTOMATED TRANSMISSION // NO-REPLY
              </div>
              <div>
                Centre for Innovation, Control &amp; Robotics (CICR) &bull; JIIT Sector 128
              </div>
              <div style="color:#475569;margin-top:4px;">
                This is an authenticated system transmission from the CICR Inventory System. Do not reply to this email address.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const plainText = [
    `CICR ROBOTICS // INVENTORY SYSTEM`,
    `================================================`,
    `Welcome to the CICR Vault, Samiksha Jhunjhunwala`,
    ``,
    `Your student membership account has been provisioned and authorized.`,
    ``,
    `MEMBER DETAILS:`,
    `- Name:        Samiksha Jhunjhunwala`,
    `- College ID:  njg269574@mail.jiit.ac.in`,
    `- Enrollment:  njg269574`,
    `- Batch:       E4`,
    `- Branch:      ECM`,
    `- Access:      Student Member (Approved)`,
    ``,
    `TEMPORARY LOGIN CREDENTIALS:`,
    `- Portal URL:          ${portalUrl}`,
    `- Login Email:         ${MEMBER_DATA.email}`,
    `- Temporary Password:  ${MEMBER_DATA.tempPassword}`,
    ``,
    `GETTING STARTED:`,
    `1. Sign in to the portal using your college email and temporary password.`,
    `2. Reset your temporary password to a secure personal password.`,
    `3. Explore lab components, sensors, microcontrollers, and submit hardware requests.`,
    ``,
    `SECURITY ADVISORY:`,
    `Do not share your temporary password. Update your password upon your first session.`,
    ``,
    `Regards,`,
    `CICR Administration Team`,
    `Centre for Innovation, Control & Robotics, JIIT Sector 128`
  ].join('\n');

  const mailOptions = {
    from: `"CICR Lab Admin" <${smtpUser}>`,
    replyTo: `"CICR Lab Admin" <${smtpUser}>`,
    to: MEMBER_DATA.email,
    subject: `[CICR Vault] Welcome to CICR Inventory - Account Provisioned for Samiksha Jhunjhunwala`,
    text: plainText,
    html: emailHtml,
    priority: 'high',
    headers: {
      'X-CICR-Mailer': 'CICR-Inventory/v2.14-Core',
      'X-Priority': '1 (Highest)',
      'Importance': 'High'
    }
  };

  const info = await transporter.sendMail(mailOptions);
  console.log('[SUCCESS] Email sent successfully!');
  console.log('Message ID: ', info.messageId);
  console.log('Accepted:   ', info.accepted);
  console.log('Response:   ', info.response);
  console.log('\n================================================================');
  console.log('ALL TASKS COMPLETED SUCCESSFULLY');
  console.log('================================================================');
}

provisionAndSendEmail().catch((err) => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
