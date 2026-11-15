# Cuentas ciudadanas por correo — staging opt-in

**Estado:** implementado para validación, deshabilitado por defecto. Usa la tabla existente `users` en PostgreSQL sin modificar el esquema. No se ha configurado un proveedor de correo real, se han enviado mensajes ni se han creado cuentas ciudadanas.

## Flujos y controles
- `POST /api/account/register` crea únicamente `role=user` y `status=pending` con hash bcrypt (coste 12); nunca crea una sesión antes de verificar el correo. Responde 202 genérico aunque el correo ya exista.
- `POST /api/account/resend` reenvía enlace solamente a cuentas pendientes; `POST /api/account/verify` cambia `pending → active` mediante acción **POST** para evitar verificaciones por bots lectores de enlaces. Token JWT firmado de 24 horas, ligado a ID, correo y huella del hash de contraseña. La transición pendiente a activa invalida usos posteriores.
- `POST /api/account/recover` envía enlace solo a cuenta activa de usuario, sin revelar si existe. `POST /api/account/reset` usa JWT de 15 minutos y actualización **atómica condicionada al hash anterior** para invalidar enlaces repetidos y sesiones existentes tras cambiar la contraseña.
- `POST /api/account/login` y `/logout`, con sesión de 12 horas en cookie `HttpOnly`, `Secure` y `SameSite=Strict`. Cada render protegido de `/cuenta` revalida correo, hash, estado y rol de PostgreSQL. Logout borra la cookie, pero no revoca tokens robados antes de expirar.
- Páginas de registro, acceso, verificación, reenvío, recuperación y restablecimiento bajo `/cuenta`, con `noindex` y `no-referrer`.
- Validación estricta de `Origin` en cada POST; limitación HMAC por correo y por IP únicamente si el proxy es confiable; sin IP confiable se usa un balde compartido para evitar peticiones ilimitadas. Contraseñas de al menos 12 caracteres y máximo 72 bytes bcrypt.

## Tokens solo en el navegador

Los enlaces de verificación y recuperación incluyen el JWT únicamente como fragmento de URL (`#token=...`), nunca como parámetro `?token=...`. Por diseño HTTP, el fragmento **no se envía en GET**, ni llega a Next.js, Namecheap, proxies o logs de acceso. Al abrir el enlace, el componente cliente extrae el token, valida su formato, lo guarda temporalmente en memoria y borra el fragmento de la barra de direcciones antes de mostrar el formulario. El token se transmite exclusivamente en el **cuerpo de un POST protegido por Origin** al confirmar la acción.

No usar seguimiento de clics, redirecciones de enlaces ni analytics externos en correos de verificación que puedan modificar o descartar el fragmento. Los enlaces emitidos antes de este cambio con `?token=` no se admiten (no existían emisiones de producción). Un usuario puede solicitar un enlace nuevo en caso de fallo. El backend sigue validando firma, audiencia, expiración y estado de cuenta.

## Infraestructura necesaria para una prueba real
1. Dominio propio HTTPS y `SITE_URL` correcto, PostgreSQL 16+ con TLS y copia de seguridad restaurable.
2. Cuenta del proveedor de correo **Resend**, aceptación expresa de sus condiciones, revisión de retención, privacidad, subprocesadores y tratamiento transfronterizo. Revisar jurisdicciones de los usuarios y del responsable; no se afirma cumplimiento legal.
3. Dominio remitente verificado mediante DNS `SPF`, `DKIM` y `DMARC`. Usar `ACCOUNT_MAIL_FROM` del dominio propio. Confirmar entrega real en una cuenta autorizada.
4. Configurar **solo en servidor**, no en ZIP ni repositorio: `PUBLIC_ACCOUNTS_ENABLED=true`, `ACCOUNT_TOKEN_SECRET` aleatorio e independiente de otros secretos, `RESEND_API_KEY`, `ACCOUNT_MAIL_FROM` y `SITE_URL`. Por defecto la bandera permanece `false`.
5. Para múltiples instancias, instalar y validar Redis compartido, comprobar límites de tasa e introducir controles CAPTCHA/abuso y políticas de retención antes de tráfico público.
6. Probar realmente en staging: rebotes de correo, caducidad, reenvío, repetición y concurrencia del reset, cookies tras reinicio Passenger, emails con dominio verificado, protección CSRF y sesiones expiradas.

Se usa POST HTTPS fijo a `https://api.resend.com/emails` con `from`, `to`, `subject` y `text`, sin SDK ni mensajes HTML; el adaptador no registra respuestas del proveedor. Un HTTP 202 de registro **no demuestra entrega** y un fallo deja la cuenta pendiente para reenvío.

## Datos, riesgos y faltantes
Solo se recoge correo y hash de contraseña; el proveedor recibe correo y enlace temporal para verificación/recuperación. No se incluyen identificadores ciudadanos de reportes. **Aún faltan:** prueba real de correo, verificación jurídica, registro/versionado de consentimiento, `email_verified_at`, eliminación y exportación de cuenta, retención, auditoría de sesiones y eventos de seguridad, revocación persistente, notificaciones/suscripciones, protección Turnstile, segundo factor ciudadano y pruebas E2E Namecheap. Se trata de staging; no está aprobado para producción.

Pruebas locales y CI: `npm run typecheck`, `npm run test:unit`, `npm run test:integration`; integración con PostgreSQL 16 efímero. Todas las pruebas de correo deben usar mocks, sin envíos a terceros.

Referencias: [API de Resend](https://resend.com/docs/api-reference/emails/send-email), [política jurídico-tecnológica](ASESOR_LEGAL_TECNOLOGICO.md), [puertas P0](https://github.com/medinacaj/web-pulso-ve/issues/109).
