const nodemailer = require('nodemailer');
const { smtp, isProduction } = require('../../config/env');

let transporter;

/**
 * Transporte SMTP global de la plataforma (no el de cada colegio: el colegio
 * aún no existe cuando se le envían sus credenciales).
 * Sin SMTP_HOST en desarrollo, los correos se imprimen en consola.
 * Con SMTP_DEBUG=true, Nodemailer imprime el diálogo SMTP completo.
 */
function getTransporter() {
  if (transporter) return transporter;

  if (!smtp.host) {
    if (isProduction) throw new Error('SMTP no configurado: define SMTP_HOST en el servidor.');
    transporter = nodemailer.createTransport({ jsonTransport: true });
    transporter.isConsole = true;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    logger: smtp.debug,
    debug: smtp.debug,
  });
  return transporter;
}

/** Pista legible según el error de Nodemailer/servidor SMTP. */
function smtpHint(err) {
  const msg = `${err.message || ''} ${err.response || ''}`;
  if (err.code === 'EAUTH' || err.responseCode === 535 || err.responseCode === 534) {
    return /gmail/i.test(smtp.host)
      ? 'Gmail rechazó el usuario/clave: usa una Contraseña de aplicación (myaccount.google.com/apppasswords, requiere verificación en 2 pasos), sin espacios, y el correo completo en SMTP_USER.'
      : 'Usuario o contraseña SMTP rechazados: revisa SMTP_USER y SMTP_PASSWORD.';
  }
  if (/wrong version number|ssl3_get_record|tls_validate_record_header/i.test(msg)) {
    return 'SMTP_SECURE no coincide con el puerto: 465 → SMTP_SECURE=true; 587 o 2525 → SMTP_SECURE=false.';
  }
  if (/self[- ]signed|certificate|unable to verify|CERT_/i.test(msg)) {
    return 'Error de certificado TLS: suele ser un antivirus o proxy que inspecciona el tráfico (desactiva el "escaneo de correo/SSL") o una red corporativa.';
  }
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'ECONNRESET'].includes(err.code)) {
    return `No se pudo conectar a ${smtp.host}:${smtp.port}: puerto bloqueado por firewall/antivirus/proveedor de internet, o host mal escrito. Prueba el otro puerto (587 ↔ 465).`;
  }
  if (err.code === 'EDNS' || /ENOTFOUND|EAI_AGAIN/.test(msg)) {
    return `No se encontró el servidor "${smtp.host}": revisa SMTP_HOST o la conexión a internet.`;
  }
  if (err.code === 'EENVELOPE' || [550, 551, 553, 554].includes(err.responseCode)) {
    return 'El servidor rechazó el remitente o el destinatario: SMTP_FROM debe ser la misma cuenta de SMTP_USER (o un alias verificado) y el destinatario debe existir.';
  }
  return null;
}

async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  try {
    const info = await t.sendMail({ from: smtp.from, to, subject, html, text });

    if (t.isConsole) {
      console.log(`\n[mail:dev] (modo consola, NO se envió) Para: ${to}\n[mail:dev] Asunto: ${subject}\n${text}\n`);
    } else {
      console.log(
        `[mail] Aceptado por ${smtp.host} → ${to} | id: ${info.messageId} | respuesta: ${info.response}` +
          (info.rejected?.length ? ` | RECHAZADOS: ${info.rejected.join(', ')}` : '')
      );
    }
    if (info.rejected?.length) {
      throw Object.assign(new Error(`Destinatario rechazado: ${info.rejected.join(', ')}`), { code: 'EENVELOPE' });
    }
    return info;
  } catch (err) {
    const hint = smtpHint(err);
    console.error(
      [
        '',
        '──────── [mail] ERROR AL ENVIAR ────────',
        `  Para:          ${to}`,
        `  Servidor:      ${smtp.host || '(modo consola)'}:${smtp.port}  secure=${smtp.secure}  usuario=${smtp.user || '(ninguno)'}`,
        `  Remitente:     ${smtp.from}`,
        `  Código:        ${err.code || '-'}`,
        `  Comando SMTP:  ${err.command || '-'}`,
        `  Respuesta:     ${err.responseCode || ''} ${err.response || '-'}`,
        `  Mensaje:       ${err.message}`,
        `  Sugerencia:    ${hint || 'Activa SMTP_DEBUG=true en .env para ver el diálogo SMTP completo.'}`,
        '────────────────────────────────────────',
        '',
      ].join('\n')
    );
    err.hint = hint;
    throw err;
  }
}

/** Al arrancar: dice en qué modo está el correo y prueba la conexión SMTP (sin enviar nada). */
async function verifyMailer() {
  if (!smtp.host) {
    console.log('[mail] Modo CONSOLA: SMTP_HOST vacío, los correos se imprimen aquí y NO se envían.');
    return false;
  }
  try {
    await getTransporter().verify();
    console.log(`[mail] SMTP listo: ${smtp.host}:${smtp.port} (secure=${smtp.secure}) como ${smtp.user}. Remitente: ${smtp.from}`);
    if (/gmail/i.test(smtp.host) && smtp.user && !smtp.from.toLowerCase().includes(smtp.user.toLowerCase())) {
      console.warn(`[mail] Aviso: SMTP_FROM (${smtp.from}) no usa la cuenta ${smtp.user}. Gmail lo reescribirá o lo marcará como sospechoso.`);
    }
    return true;
  } catch (err) {
    console.error(`[mail] SMTP NO disponible (${err.code || 'error'}): ${err.message}`);
    const hint = smtpHint(err);
    if (hint) console.error(`[mail] Sugerencia: ${hint}`);
    return false;
  }
}

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

module.exports = { sendMail, verifyMailer, escapeHtml };
