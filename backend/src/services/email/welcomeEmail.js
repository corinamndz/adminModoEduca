const { sendMail, escapeHtml } = require('./mailer');
const { schoolAppUrl } = require('../../config/env');

/** Enlace al login del sistema escolar con el colegio ya elegido (lib/tenantSlug.js del colegio). */
const loginUrlFor = (slug) => `${schoolAppUrl}/login?colegio=${encodeURIComponent(slug)}`;

/**
 * Correo con las credenciales del administrador principal del colegio.
 * `kind`: 'welcome' (alta del colegio) | 'resend' (nueva clave temporal).
 * Lanza si el envío falla: quien llama decide cómo registrarlo.
 */
async function sendAdminCredentialsEmail({ kind = 'welcome', to, schoolName, slug, fullName, username, temporaryPassword }) {
  const url = loginUrlFor(slug);
  const isWelcome = kind === 'welcome';
  const subject = isWelcome
    ? `Bienvenido a MoDo Educa · ${schoolName}`
    : `Nuevas credenciales de acceso · ${schoolName}`;
  const intro = isWelcome
    ? `<strong>${escapeHtml(schoolName)}</strong> ya está activo en MoDo Educa y tú eres su administrador principal.`
    : `Se generó una nueva contraseña temporal para tu cuenta de administrador de <strong>${escapeHtml(schoolName)}</strong>.`;

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e5e9f0">
    <p style="margin:0 0 4px;font-size:13px;color:#64748b">MoDo Educa</p>
    <h2 style="margin:0 0 12px;font-size:20px">Hola, ${escapeHtml(fullName)}</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55">${intro}</p>
    <div style="background:#f8fafc;border:1px solid #e5e9f0;border-radius:12px;padding:16px;margin-bottom:20px">
      <p style="margin:0 0 8px;font-size:14px"><strong>Colegio:</strong> ${escapeHtml(slug)}</p>
      <p style="margin:0 0 8px;font-size:14px"><strong>Usuario:</strong> ${escapeHtml(username)}</p>
      <p style="margin:0;font-size:14px"><strong>Contraseña temporal:</strong>
        <code style="background:#e5e9f0;padding:2px 8px;border-radius:6px;font-family:Consolas,monospace;font-size:14px">${escapeHtml(temporaryPassword)}</code></p>
    </div>
    <p style="margin:0 0 20px;font-size:14px;color:#64748b">Por seguridad, el sistema te pedirá cambiar esta contraseña la primera vez que inicies sesión.</p>
    <a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 20px;background:#2563eb;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold">Iniciar sesión</a>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">Si no esperabas este correo, ignóralo o escríbenos respondiendo a este mensaje.</p>
  </div></body></html>`;

  const text = [
    `Hola, ${fullName}`,
    '',
    isWelcome
      ? `${schoolName} ya está activo en MoDo Educa y tú eres su administrador principal.`
      : `Se generó una nueva contraseña temporal para tu cuenta de administrador de ${schoolName}.`,
    '',
    `Colegio: ${slug}`,
    `Usuario: ${username}`,
    `Contraseña temporal: ${temporaryPassword}`,
    '',
    'Deberás cambiar la contraseña al iniciar sesión por primera vez.',
    '',
    `Iniciar sesión: ${url}`,
  ].join('\n');

  await sendMail({ to, subject, html, text });
}

module.exports = { sendAdminCredentialsEmail, loginUrlFor };
