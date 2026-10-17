import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Alert } from '../../components/ui/primitives';

/**
 * Resultado de un alta o reenvío. Si el correo salió, solo lo confirma; si
 * falló, muestra la clave temporal UNA vez (no se vuelve a poder consultar)
 * para entregarla por otro medio.
 */
function CredentialsResult({ result, onClose }) {
  const [copied, setCopied] = useState(false);
  const recipient = result.admin?.email || result.recipient;
  const username = result.admin?.username || result.username;
  const sent = result.email?.sent;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Usuario: ${username}\nContraseña temporal: ${result.temporaryPassword}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="credentials-result">
      {sent ? (
        <Alert variant="success" title={result.tenant ? `${result.tenant.name} quedó creado` : 'Credenciales reenviadas'}>
          Se enviaron las credenciales a <strong>{recipient}</strong>. El administrador deberá cambiar su contraseña al
          entrar por primera vez.
          {result.tenant && (
            <>
              {' '}
              <Link to={`/${result.tenant.slug}`}>Ver ficha del colegio</Link>
            </>
          )}
        </Alert>
      ) : (
        <Alert variant="warning" title="No se pudo enviar el correo">
          <p className="alert__text">
            {result.tenant ? 'El colegio quedó creado, pero ' : 'La contraseña se cambió, pero '}
            el correo a <strong>{recipient}</strong> falló ({result.email?.error}). Entrega estas credenciales por otro
            medio: <strong>no se volverán a mostrar</strong>.
          </p>
          <div className="credentials-box">
            <span>
              Usuario: <code>{username}</code>
            </span>
            <span>
              Contraseña temporal: <code>{result.temporaryPassword}</code>
            </span>
            <Button variant="secondary" size="sm" icon={copied ? 'check' : 'copy'} onClick={copy}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </Alert>
      )}
      <Button variant="ghost" size="sm" icon="x" onClick={onClose} className="credentials-result__close">
        Cerrar aviso
      </Button>
    </div>
  );
}

export default CredentialsResult;
