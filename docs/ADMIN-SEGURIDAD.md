# Acceso administrativo — primer bloque de staging

**Estado:** autenticación de **un único administrador** con contraseña y TOTP, cookie segura y panel de métricas reales de solo lectura. **Desactivado por defecto**, no es un Centro de Control terminado ni está validado en Namecheap real.

## Controles implementados

- Solo el correo `ADMIN_OWNER_EMAIL` explícitamente configurado puede obtener acceso.
- Tabla existente `users`, contraseña con `bcryptjs` (factor 12 al crear la cuenta), rol `admin` y estado `active` comprobados nuevamente en el servidor al acceder a `/centro-control`.
- TOTP SHA-1 conforme a RFC 6238 (30 s, 6 dígitos, margen ±30 s), secreto Base32 privado de al menos 32 caracteres. **Una clave compartida del entorno para un único propietario; no utilizar para administradores múltiples.**
- Sesión JWT HS256 con `issuer/audience` fijos, 15 minutos de vigencia, clave `JWT_SECRET` de al menos 40 caracteres y enlace al hash de contraseña; modificación de la contraseña o rotación del secreto invalida sesiones en la siguiente solicitud.
- Cookie `pulsove_admin_session`: `HttpOnly`, `Secure`, `SameSite=Strict`. Los cambios POST rechazan orígenes distintos al HTTPS de `SITE_URL`.
- Límite de 5 intentos de inicio por correo cada 15 minutos, y límite adicional por IP cuando el proxy permite identificación confiable. Redis opcional; memoria solo válida para instancia única.
- `ADMIN_ACCESS_ENABLED=false` bloquea login y acceso al Centro de Control. Las páginas administrativas tienen `noindex` y no incluyen acciones de modificación.

## Preparar el acceso en un entorno controlado

1. Contar con PostgreSQL 16+ persistente de **staging**, migrado, protegido con credenciales restringidas. No utilizar el catálogo de demostración como fuente de métricas operativas.
2. En el entorno privado del servidor configurar `SITE_URL=https://subdominio-de-staging.example` (origen exacto); `JWT_SECRET` aleatorio de 40+ caracteres; `ADMIN_OWNER_EMAIL`; `ADMIN_TOTP_SECRET_BASE32` (32+ caracteres Base32 compartido **solo** con la aplicación de autenticación del propietario), y `ADMIN_ACCESS_ENABLED=true`.
3. Para la provisión única definir temporalmente `ADMIN_BOOTSTRAP_EMAIL` igual a `ADMIN_OWNER_EMAIL` y `ADMIN_BOOTSTRAP_PASSWORD` fuerte (16+ caracteres, máximo 72 bytes). En un entorno de mantenimiento con **código del repositorio y dependencias Node/tsx** ejecutar `npm run create-admin`. La operación **no** corre automáticamente al construir ni instalar. El ZIP standalone de cPanel no contiene `tsx` ni incluye el script de bootstrap.
4. Eliminar de inmediato las variables temporales `ADMIN_BOOTSTRAP_EMAIL` y `ADMIN_BOOTSTRAP_PASSWORD` tras crear la cuenta. **Nunca** incluir secretos en ZIP, repositorio, frontend, capturas, tickets ni `public_html`.
5. Abrir `/centro-control/acceso` solo en HTTPS y autenticar con correo, contraseña y TOTP. El panel `/centro-control` mostrará conteos reales de PostgreSQL; el acceso sin sesión redirige al formulario.
6. Probar desde el dominio real: TLS, cookie segura, rechazo de sesión alterada/vencida, TOTP incorrecto, correo no autorizado, rate limiting y cambio de contraseña antes de habilitar otros módulos.

## Bloqueos de producción pendientes

- **No existen todavía** registro público, verificaciones por correo, restablecimiento de contraseña, preferencias de cuenta, suscripciones operativas ni envío SMTP. Tampoco se envía correo al crear el administrador por CLI.
- **Revocación:** el logout borra la cookie del navegador, pero no invalida el JWT previamente robado hasta expirar (máximo 15 min). La revocación persistente, gestión de sesiones y rotación de claves deben completarse antes de datos sensibles de usuarios.
- **MFA:** TOTP global del único propietario, sin enrolamiento/autoservicio, códigos de recuperación ni auditoría de reuso. Para más administradores hacen falta secretos individuales cifrados y gestión MFA por usuario.
- **Centro de Control:** solo dashboard de cinco indicadores reales de lectura; aún faltan los módulos con endpoints RBAC, auditoría de acciones, pruebas de escalada de privilegios y recuperación.
- Los mecanismos de rate limiting en memoria se reinician al reiniciar el servidor; si se opera con más de una instancia requiere Redis configurado y probado.
- El operador debe verificar cumplimiento, privacidad, retención y permisos; no se afirma que la plataforma esté preparada para producción.

Seguimiento: [Puertas P0 #109](https://github.com/medinacaj/web-pulso-ve/issues/109).
