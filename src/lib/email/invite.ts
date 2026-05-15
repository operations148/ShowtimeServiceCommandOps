import { resend } from './client'
import { ROLE_LABELS, type TeamMemberRole } from '@/types/team'

const APP_URL = process.env.NEXTAUTH_URL ?? 'https://serviceops-ghl-workorders.vercel.app'
const FROM_ADDRESS = 'ServiceOps <no-reply@serviceops.app>'

export async function sendInviteEmail(
  to: string,
  name: string,
  role: TeamMemberRole,
  companyName: string,
  token: string,
): Promise<void> {
  const acceptUrl = `${APP_URL}/accept-invite/${token}`
  const roleLabel = ROLE_LABELS[role] ?? role

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to ServiceOps</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#0C1E2E;padding:28px 36px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;">ServiceOps Command Center</p>
              <p style="margin:4px 0 0;font-size:13px;color:#94A3B8;">Field operations platform</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px;">
              <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0F172A;">You're invited, ${name.split(' ')[0]}!</p>
              <p style="margin:0 0 24px;font-size:15px;color:#64748B;line-height:1.6;">
                <strong style="color:#0F172A;">${companyName}</strong> has added you to their ServiceOps workspace as <strong style="color:#0F172A;">${roleLabel}</strong>.
                Click the button below to set your password and get started.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#0066FF;border-radius:8px;">
                    <a href="${acceptUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;letter-spacing:-0.1px;">
                      Accept Invitation →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Details box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;">Your account details</p>
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size:13px;color:#64748B;padding:3px 0;width:80px;">Email</td>
                        <td style="font-size:13px;color:#0F172A;font-weight:500;">${to}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#64748B;padding:3px 0;">Role</td>
                        <td style="font-size:13px;color:#0F172A;font-weight:500;">${roleLabel}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#64748B;padding:3px 0;">Workspace</td>
                        <td style="font-size:13px;color:#0F172A;font-weight:500;">${companyName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.6;">
                This invitation link expires in <strong>7 days</strong>. If you have any issues, contact your workspace admin.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #E2E8F0;background:#F8FAFC;">
              <p style="margin:0;font-size:12px;color:#94A3B8;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `You've been invited to ServiceOps — ${companyName}`,
    html,
  })
}
