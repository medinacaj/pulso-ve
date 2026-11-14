# Sondeos reales HTTPS: primer motor opt-in

**Alcance implementado:** comprobación HTTPS de un endpoint configurado, con fecha, latencia, código HTTP y resultado persistidos en `technical_checks`. No es una medición de disponibilidad de toda la empresa, y no confirma incidentes por sí solo. En particular, un HTTP 403/404 puede ser una política del servicio, no una caída general.

## Activación segura y permisos

1. Identificar la fuente oficial y documentar que el punto de comprobación autoriza consultas automatizadas. No seleccionar objetivos por conjeturas ni usar los 579 servicios de catálogo como destinos automáticos.
2. En PostgreSQL migrado, cada objetivo debe pertenecer a un servicio **activo y previamente verificado** con `services.is_demo=false`, y registrar un `service_endpoints` de `type='https'` y `active=true`. Solo un administrador autorizado debe realizar estas altas/cambios. El sistema **no** marca automáticamente servicios verificados.
3. Objetivos: URL HTTPS pública en puerto 443, sin credenciales, parámetros ni fragmentos; la prueba usa HEAD, TLS verificado, DNS público (sin IP privada, loopback, multicast o rangos reservados) y **nunca sigue redirecciones**. El socket queda fijado al IP que validó la consulta DNS. Un DNS privado o inaccesible se **omite**, no se persiste como caída del proveedor.
4. Confirmar límites de uso, contrato y autorización para cada endpoint. La técnica no inspecciona contenido ni cifra datos del usuario; **no reemplaza revisiones de términos/licencias**.
5. Solo entonces configurar `ENABLE_TECHNICAL_CHECKS=true` y `TECHNICAL_MAX_CHECKS_PER_RUN=10` en el entorno privado del operador y ejecutar `npm run monitor:run`. Sin habilitación, el comando no abre la base de datos ni hace solicitudes.
6. Revisar `technical_checks` y los resultados de la consola privada: `candidates`, `probed`, `persisted`, `failed`, `unsafeSkipped`. Sin objetivos activos no hay observaciones.

## Protección y recursos

- Intervalo mínimo **300 segundos por endpoint**, incluso si la fila solicita menos.
- Máximo de **20 sondeos por ejecución**, configurable entre 1 y 20. Timeout por operación entre **1 y 10 segundos**.
- Un ciclo no intenta seguir redirecciones HTTP ni descarga páginas.
- El runner ordena por última medición y limita los candidatos a 2000. Para más de 2000 endpoints se requerirá un scheduler más robusto, cola y planificación de cuotas.
- Una transacción PostgreSQL aplica bloqueo advisory por endpoint y vuelve a comprobar la última medición antes de insertar, evitando datos duplicados al solaparse dos ejecuciones. Los sondeos de red simultáneos aún pueden duplicarse; el operador debe impedir solapamientos.
- IP privada, error de DNS y URL rechazada **no** se convierten en fallas observadas. Las fallas HTTP/TLS/red legítimamente verificadas se guardan como mediciones de **un endpoint**, sin atribuir caída global a toda una plataforma.
- Esta etapa solo admite tipo HTTPS; no declara implementados DNS, ICMP, traceroute, API autenticada, múltiples regiones, alertas, worker de cola ni monitoreo continuo autónomo.

## Stellar Plus y empaquetado

El sitio Next.js se puede empaquetar como standalone con `npm run build:cpanel`, pero el **runner TypeScript no forma parte de ese ZIP**: se ejecuta con `tsx` desde un entorno Node que disponga de código y dependencias. Antes de instalarlo en Namecheap Stellar Plus comprobar que las condiciones contractuales de recursos permiten **el caso concreto**, la disponibilidad de `tsx`/Node y el cron autorizado.

Namecheap publica restricciones de cron (mínimo cinco minutos, límites de concurrencia) y prohíbe procesos residentes independientes. **No ejecutar un monitor masivo en el hosting compartido**. Para ampliar cobertura habrá que definir un ejecutor independiente permitido y accesible a PostgreSQL mediante TLS. Ninguno se ha contratado, desplegado ni habilitado en esta etapa.

El operador podrá configurar en una instalación compatible una tarea de *un único ciclo* con frecuencia no inferior a cinco minutos, siempre que respete los límites del proveedor; nunca un daemon de ejecución continua. Es obligatorio observar su resultado real, las fallas y la frescura de `checked_at`. La programación de cron **no se realiza desde el código**.

## Comprobación de frescura

`GET /api/health/monitoring` responde **503** si el sondeo está deshabilitado, no tiene endpoints aprobados, existe algún endpoint activo sin medición reciente o PostgreSQL falla. Responde **200** únicamente cuando todas las fuentes activas y no-demostrativas tienen una medición persistida dentro de `MONITOR_FRESHNESS_SECONDS` (por defecto 1800 segundos). Muestra recuentos y última fecha, **no URLs privadas ni secretos**. Este chequeo no prueba disponibilidad global del proveedor ni sustituye la observabilidad de un planificador real. Si ningún cron está instalado, el estado no debe declararse operativo.

## Verificación de entrega

- Test unitario de objetivos y rangos DNS prohibidos, ventanas de cinco minutos y error DNS: `npm run test:unit`.
- Compilación TypeScript y PostgreSQL efímero de CI: ver resultado del PR que introduce el runner.
- Requisitos aún abiertos: prueba real autorizada a **un endpoint** en staging, evidencia de fila en PostgreSQL, prueba de tareas ejecutadas sin navegador abierto, observabilidad, seguridad de administración y alertas.
- Hasta esas verificaciones, el conteo de servicios con observaciones reales debe permanecer en cero si no existen mediciones de fuentes aprobadas.

Política principal: [Issue #109](https://github.com/medinacaj/web-pulso-ve/issues/109).

Fuentes generales de limitaciones: [Namecheap server resource restrictions](https://www.namecheap.com/support/knowledgebase/article.aspx/157/22/do-you-have-any-server-resource-restrictions/) y [Namecheap acceptable use](https://www.namecheap.com/legal/hosting/aup/).
