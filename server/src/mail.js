const appOrigin = () => {
  const value = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  return new URL(value).origin;
};

export function makeVerificationLink(token) {
  const url = new URL('/', appOrigin());
  url.searchParams.set('verify', token);
  return url.toString();
}

export const emailDeliveryConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);

export async function sendVerificationEmail(email, link) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'production') throw new Error('Email delivery is not configured.');
    console.info(`Local email verification link for ${email}: ${link}`);
    return false;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Verify your ScopeTrack email',
      text: `Verify your email address for ScopeTrack by opening this link: ${link}\n\nThis link expires in 24 hours. If you did not create a ScopeTrack account, you can ignore this message.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#263129"><p style="color:#66866e;font-size:12px;font-weight:bold;letter-spacing:1px">SCOPETRACK</p><h1 style="font-size:25px">Verify your email</h1><p>Confirm that you can receive email at this address to finish creating your ScopeTrack account.</p><p style="margin:28px 0"><a href="${link}" style="background:#528066;color:white;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Verify email address</a></p><p style="color:#738075;font-size:13px">This link expires in 24 hours. If you did not create a ScopeTrack account, you can ignore this message.</p></div>`,
    }),
  });
  if (!response.ok) {
    console.error(`Email provider returned HTTP ${response.status}.`);
    throw new Error('Could not send the verification email. Please try again shortly.');
  }
  return true;
}
