import { resend } from './client'

const APP_URL = process.env.NEXTAUTH_URL ?? 'https://serviceops-ghl-workorders.vercel.app'
const FROM_ADDRESS = 'ServiceOps <onboarding@resend.dev>'

export async function sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password/${token}`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your ServiceOps password</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;">
          <tr>
            <td style="background:#0C1E2E;padding:28px 36px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;">ServiceOps Command Center</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px;">
              <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0F172A;">Reset your password, ${name.split(' ')[0]}</p>
              <p style="margin:0 0 24px;font-size:15px;color:#64748B;line-height:1.6;">
                We received a request to reset your ServiceOps password. Click the button below to choose a new one.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#0066FF;border-radius:8px;">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">
                      Reset Password →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.6;">
                This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email — your password will not change.
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
    subject: 'Reset your ServiceOps password',
    html,
  })
}
