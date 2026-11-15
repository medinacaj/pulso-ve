import { accountActionUrl, type ActionKind, type AccountSettings } from './account-security';

const EMAIL_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Sends the minimum email needed for account ownership/recovery.
 * Do not log recipient, token, provider body, request headers or credentials.
 */
export async function sendAccountActionEmail(params: {
  kind: ActionKind;
  recipient: string;
  token: string;
  settings: AccountSettings;
}): Promise<boolean> {
  const url = accountActionUrl(params.settings.origin, params.kind, params.token);
  const isVerification = params.kind === 'verify_email';
  const subject = isVerification ? 'PulsoVE: verifica tu correo' : 'PulsoVE: restablece tu contraseña';
  const message = isVerification
    ? 'Para verificar tu cuenta PulsoVE, abre el siguiente enlace (vigencia: 24 horas):\n\n'
    : 'Para restablecer tu contraseña PulsoVE, abre el siguiente enlace (vigencia: 15 minutos):\n\n';
  const body = message + url +
    '\n\nSi no solicitaste esta operación, ignora este mensaje. PulsoVE nunca solicita contraseñas por correo.';

  try {
    const response = await fetch(EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + params.settings.resendKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.settings.mailFrom,
        to: [params.recipient],
        subject,
        text: body,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    // Never log or surface provider errors: they can include user information.
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}
