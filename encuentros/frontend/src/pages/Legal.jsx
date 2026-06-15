// Páginas legales — contenido base. Antes de prod, el operador debe:
//   - Revisar con abogado local en la jurisdicción de la LLC
//   - Adaptar el nombre legal de la entidad (placeholder: "OPERATOR LLC")
//   - Verificar dirección física, custodian of records, agente DSA, etc.

export function LegalLayout({ title, children }) {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-zinc-200">
      <h1 className="text-3xl font-black text-white mb-6">{title}</h1>
      <div className="prose prose-invert prose-zinc text-sm leading-relaxed space-y-4">
        {children}
      </div>
    </main>
  );
}

export function Terms() {
  return (
    <LegalLayout title="Términos y Condiciones">
      <p><strong>Última actualización:</strong> {new Date().toLocaleDateString()}</p>
      <p>
        Bienvenido a encuentros. Al acceder a este sitio, declarás bajo penalidad de
        perjurio que sos mayor de 18 años y que en tu jurisdicción es legal acceder a
        contenido para adultos.
      </p>
      <h2>1. Naturaleza del servicio</h2>
      <p>
        encuentros es una plataforma de directorio classifieds donde individuos
        mayores de 18 años publican anuncios personales. NO procesamos pagos por
        servicios físicos entre anunciantes y visitantes. La plataforma cobra una
        suscripción mensual al anunciante por mantener su anuncio publicado.
      </p>
      <h2>2. Verificación de edad</h2>
      <p>
        Todo anunciante debe completar verificación de identidad con documento
        oficial (pasaporte, licencia de conducir, DNI) + selfie. Sin esta
        verificación, el anuncio NO se publica. Conservamos los registros bajo
        18 U.S.C. § 2257 cuando aplica.
      </p>
      <h2>3. Conducta prohibida</h2>
      <ul>
        <li>Publicar fotos de menores de edad (es delito federal en USA y la mayoría de jurisdicciones).</li>
        <li>Publicar como anunciante a otra persona sin su consentimiento (suplantación).</li>
        <li>Publicar contenido que promueva trafficking de personas.</li>
        <li>Usar la plataforma para extorsión, doxxing o blackmail.</li>
        <li>Scraping automatizado del directorio.</li>
      </ul>
      <h2>4. Reportes</h2>
      <p>
        Cualquier visitante puede reportar un anuncio. Reportes de menores o
        trafficking se escalan en máximo 30 minutos a las autoridades correspondientes
        (NCMEC en USA, autoridades locales en otros países).
      </p>
      <h2>5. Indemnización</h2>
      <p>
        El operador NO se responsabiliza por encuentros, transacciones o conducta
        de los anunciantes entre sí o con visitantes. Cada parte es exclusivamente
        responsable de sus actos.
      </p>
      <h2>6. Limitación de responsabilidad</h2>
      <p>
        El servicio se provee "TAL CUAL". El operador no garantiza la veracidad de
        los anuncios. Bajo ningún concepto el operador responde por daños indirectos.
      </p>
      <h2>7. Jurisdicción</h2>
      <p>
        Estos términos se rigen por las leyes de la jurisdicción de la entidad
        operadora (LLC offshore). Disputas resueltas por arbitraje vinculante.
      </p>
      <h2>8. Modificaciones</h2>
      <p>
        El operador puede modificar estos términos. Al continuar usando el servicio
        después de la modificación, aceptás los nuevos términos.
      </p>
    </LegalLayout>
  );
}

export function Privacy() {
  return (
    <LegalLayout title="Política de Privacidad">
      <p><strong>Última actualización:</strong> {new Date().toLocaleDateString()}</p>
      <h2>Datos que recolectamos</h2>
      <ul>
        <li><strong>Visitantes:</strong> IP, user-agent, país (vía CF-IPCountry), páginas vistas (analytics agregado).</li>
        <li><strong>Anunciantes:</strong> email, documento de ID (encriptado, acceso solo super-admin), foto verificada, datos del anuncio que ellos mismos publican.</li>
        <li><strong>Pagos:</strong> el processor (Verotel/MobiusPay) procesa la tarjeta — nosotros NO almacenamos PAN. Solo recibimos confirmación de pago.</li>
      </ul>
      <h2>Cookies</h2>
      <p>
        Solo cookies estrictamente necesarias (sesión del anunciante, preferencia de
        edad). NO usamos cookies de tracking ni third-party analytics que perfilen
        usuarios.
      </p>
      <h2>Compartir con terceros</h2>
      <ul>
        <li><strong>Processor:</strong> info necesaria para el pago.</li>
        <li><strong>Provider de age verification:</strong> documento + selfie del anunciante.</li>
        <li><strong>Autoridades:</strong> solo bajo orden judicial válida o reporte de menor/trafficking.</li>
        <li><strong>Hosting (Vercel/Railway):</strong> infraestructura técnica.</li>
      </ul>
      <h2>Retención</h2>
      <ul>
        <li>Anuncios activos: mientras el anuncio esté publicado.</li>
        <li>Documentos de age verification: <strong>7 años</strong> después de la última actividad (18 U.S.C. § 2257).</li>
        <li>Logs de pago: 7 años (compliance fiscal).</li>
        <li>Reportes: 5 años.</li>
        <li>Cuentas eliminadas: 30 días de gracia, luego eliminación irreversible.</li>
      </ul>
      <h2>Tus derechos (GDPR/CCPA)</h2>
      <ul>
        <li>Acceso a tus datos (botón "Exportar datos" en dashboard).</li>
        <li>Rectificación (editar tu perfil).</li>
        <li>Eliminación (botón "Eliminar cuenta" — 30 días de gracia).</li>
        <li>Portabilidad (export en JSON).</li>
        <li>Oposición al procesamiento.</li>
      </ul>
      <h2>Contacto</h2>
      <p>privacy@encuentros.app — respuesta dentro de 30 días.</p>
    </LegalLayout>
  );
}

export function Compliance2257() {
  return (
    <LegalLayout title="18 U.S.C. § 2257 Statement">
      <p>
        En cumplimiento con el Title 18 of the United States Code, Section 2257
        (Record-Keeping Requirements for Producers of Sexually Explicit Material),
        declaramos lo siguiente:
      </p>
      <h2>Custodian of Records</h2>
      <p>
        Los registros requeridos bajo 18 U.S.C. § 2257 son mantenidos por el
        custodio designado, en la dirección:
      </p>
      <pre className="bg-zinc-900 rounded p-3 text-xs">
{`[OPERATOR LLC]
[Address line 1]
[City, State/Province, ZIP]
[Country]

Email: 2257@encuentros.app`}
      </pre>
      <h2>Procedimiento</h2>
      <p>
        Antes de que cualquier anuncio se publique, el publisher debe completar
        verificación de identidad con documento oficial (pasaporte, DNI, licencia)
        emitido por gobierno + selfie holding documento. Los registros se conservan
        por <strong>7 años</strong> desde la última actividad del anuncio.
      </p>
      <h2>Material producido</h2>
      <p>
        Las fotos publicadas en los anuncios son producidas por los propios
        publishers — el operador NO produce material visual ni dirige la producción.
        Cada publisher es responsable de obtener consentimiento de toda persona
        identificable en sus fotos.
      </p>
      <h2>Acceso a registros</h2>
      <p>
        Acceso a los registros es exclusivamente a autoridades federales o judiciales
        con jurisdicción, previa solicitud escrita.
      </p>
    </LegalLayout>
  );
}

export function Dmca() {
  return (
    <LegalLayout title="DMCA — Notice and Takedown">
      <p>
        Si crees que material publicado en encuentros infringe tu copyright,
        enviá un aviso DMCA al agente designado.
      </p>
      <h2>Designated Agent</h2>
      <pre className="bg-zinc-900 rounded p-3 text-xs">
{`Nombre: [DMCA Agent Name]
Email: dmca@encuentros.app
Address: [OPERATOR LLC, address]
Teléfono: [+XX XXX]`}
      </pre>
      <h2>Contenido del aviso</h2>
      <ol>
        <li>Firma física o electrónica del titular del copyright o representante autorizado.</li>
        <li>Identificación de la obra protegida (URL específica).</li>
        <li>Identificación del material que infringe (URL en encuentros).</li>
        <li>Datos de contacto del reclamante.</li>
        <li>Declaración de buena fe que el uso no está autorizado.</li>
        <li>Declaración bajo perjurio que la información es exacta.</li>
      </ol>
      <h2>Contra-notificación</h2>
      <p>
        El publisher cuyo contenido fue removido puede enviar contra-notificación
        a la misma dirección. Si lo hace, el material se restaura en 10-14 días
        salvo que el reclamante inicie acción legal.
      </p>
    </LegalLayout>
  );
}

export function Dsa() {
  return (
    <LegalLayout title="DSA — Punto de contacto único (Digital Services Act)">
      <p>
        En cumplimiento con el Reglamento (UE) 2022/2065 (Digital Services Act),
        designamos los siguientes puntos de contacto:
      </p>
      <h2>Contacto para autoridades de la UE</h2>
      <pre className="bg-zinc-900 rounded p-3 text-xs">
{`Email: dsa-authorities@encuentros.app
Dirección: [OPERATOR LLC, address]
Lenguajes aceptados: español, inglés`}
      </pre>
      <h2>Contacto para usuarios de la UE</h2>
      <pre className="bg-zinc-900 rounded p-3 text-xs">
{`Email: dsa-users@encuentros.app
Lenguajes aceptados: español, inglés`}
      </pre>
      <h2>Mecanismo de reporte</h2>
      <p>
        Cualquier usuario en la UE puede reportar contenido ilegal a través del
        botón "Reportar" en cada anuncio. Aplicamos SLA: 24h para reportes generales,
        30 minutos para reportes de menores o trafficking.
      </p>
      <h2>Transparencia</h2>
      <p>
        Publicamos un informe semestral de transparencia con número de reportes,
        acciones tomadas, y solicitudes de autoridades. Disponible en /transparency.
      </p>
    </LegalLayout>
  );
}

export function Contact() {
  return (
    <LegalLayout title="Contacto">
      <ul>
        <li><strong>Soporte general:</strong> soporte@encuentros.app</li>
        <li><strong>Anunciantes:</strong> publishers@encuentros.app</li>
        <li><strong>Reportes urgentes (menores/trafficking):</strong> safety@encuentros.app (SLA 30 min)</li>
        <li><strong>Privacidad / GDPR:</strong> privacy@encuentros.app</li>
        <li><strong>DMCA:</strong> dmca@encuentros.app</li>
        <li><strong>2257 records:</strong> 2257@encuentros.app</li>
        <li><strong>Autoridades (DSA):</strong> dsa-authorities@encuentros.app</li>
        <li><strong>Prensa:</strong> press@encuentros.app</li>
      </ul>
    </LegalLayout>
  );
}

export function Cookies() {
  return (
    <LegalLayout title="Política de Cookies">
      <p>Solo usamos cookies estrictamente necesarias.</p>
      <h2>Cookies usadas</h2>
      <ul>
        <li><code>enc_session_token</code> (localStorage) — mantiene tu sesión si sos publisher. Caduca a los 30 días.</li>
        <li><code>encuentros_age_ok</code> (localStorage) — recuerda que confirmaste +18. Caduca a los 30 días.</li>
        <li><code>fp</code> (localStorage) — fingerprint anónimo para favoritos. No identifica.</li>
      </ul>
      <p>
        NO usamos Google Analytics, Facebook Pixel ni third-party trackers de ningún tipo.
      </p>
    </LegalLayout>
  );
}
