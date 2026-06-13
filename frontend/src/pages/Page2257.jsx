import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiFileText } from 'react-icons/fi';
import api from '../lib/api.js';
import PageShell from '../components/layout/PageShell.jsx';

export default function Page2257() {
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    api.get('/api/compliance/config').then(r => setCfg(r.data?.config || {})).catch(() => setCfg({}));
  }, []);

  return (
    <PageShell
      icon={FiFileText}
      title="18 U.S.C. § 2257 Statement"
      subtitle="Record-Keeping Requirements Compliance Statement."
      backTo="/compliance"
      backLabel="Volver a Compliance"
      maxWidth="3xl"
    >
        <div className="space-y-8 text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Declaración de cumplimiento</h2>
            <p>
              Todos los modelos, actores, y otras personas que aparecen en cualquier representación visual de
              conducta sexualmente explícita publicada o de cualquier otra forma puesta a disposición pública
              en este sitio web tenían más de dieciocho (18) años en el momento de la creación de dichas
              representaciones.
            </p>
            <p className="mt-3">
              All persons depicted in visual representations of actual or simulated sexually explicit conduct
              appearing on this site were eighteen (18) years of age or older at the time of creation of such
              depictions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Custodian of Records</h2>
            <p>Los registros requeridos por 18 U.S.C. § 2257 y 28 C.F.R. § 75 son mantenidos por el siguiente custodio:</p>
            <div className="mt-4 p-5 glass-strong rounded-xl border border-white/10 space-y-2 text-sm font-mono">
              <div><span className="text-gray-500">Nombre:</span> <span className="text-white">{cfg?.custodian_name || '—'}</span></div>
              <div><span className="text-gray-500">Dirección:</span> <span className="text-white">{cfg?.custodian_address || '—'}</span></div>
              <div><span className="text-gray-500">Email:</span> <a href={`mailto:${cfg?.custodian_email}`} className="text-brand-400 hover:underline">{cfg?.custodian_email || '—'}</a></div>
              <div><span className="text-gray-500">Horario:</span> <span className="text-white">{cfg?.custodian_hours || '—'}</span></div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Operador</h2>
            <p>
              Destino TV es operada por <strong className="text-white">OC Moon Group LLC</strong>, sociedad de
              responsabilidad limitada constituida en Estados Unidos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Contenido producido por terceros</h2>
            <p>
              Respecto del contenido que no es producido directamente por OC Moon Group LLC, el operador actúa como
              proveedor de servicios de hosting sin participación en la producción del contenido. Para dicho contenido,
              los registros originales son mantenidos por los productores correspondientes, quienes son los
              exclusivamente responsables del cumplimiento de 18 U.S.C. § 2257.
            </p>
            <p className="mt-3">
              Como condición de uso de Destino TV, cada creador acepta y certifica que: (1) todos los participantes
              en el contenido subido tienen al menos 18 años; (2) mantiene los registros requeridos por 18 U.S.C. § 2257
              y 28 C.F.R. § 75; (3) ha provisto a OC Moon Group LLC copia del documento de identidad gubernamental
              de cada participante junto con el formulario de consentimiento correspondiente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Exenciones</h2>
            <p>
              Las imágenes y videos que no representen conducta sexualmente explícita real o simulada bajo
              18 U.S.C. § 2256(2)(A), incluyendo material puramente promocional, están exentos de los
              requisitos de mantenimiento de registros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Política de cumplimiento de OC Moon Group LLC</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Toda cuenta de creador adulto requiere verificación de identidad mediante Stripe Identity antes de poder publicar contenido.</li>
              <li>Por cada video adulto subido, el creador debe completar el formulario 2257 con: nombre legal del performer, fecha de nacimiento, tipo y copia del documento de identidad, declaración de consentimiento firmada y fecha de producción.</li>
              <li>Los registros son almacenados en un bucket privado encriptado, accesibles únicamente al custodio designado y a las autoridades federales correspondientes.</li>
              <li>Los registros son conservados durante un período mínimo de siete (7) años después de la última publicación del contenido.</li>
              <li>OC Moon Group LLC se reserva el derecho de remover cualquier contenido que no cumpla con estos requisitos sin previo aviso.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Geo-restricción</h2>
            <p>
              El contenido adulto está actualmente geo-restringido para ciertos territorios cuya legislación
              específica requiere mecanismos de verificación de edad adicionales (incluyendo, entre otros,
              jurisdicciones de USA, Reino Unido, Unión Europea y otros estados especificados). El acceso
              desde dichos territorios es bloqueado a nivel de aplicación.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Contacto</h2>
            <p>Para consultas sobre 2257: <a href={`mailto:${cfg?.custodian_email}`} className="text-brand-400 hover:underline">{cfg?.custodian_email}</a></p>
            <p className="mt-2">Para notificaciones DMCA: <Link to="/dmca" className="text-brand-400 hover:underline">/dmca</Link></p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-white/5 flex gap-4 text-sm text-gray-500">
          <Link to="/compliance" className="hover:text-brand-400 transition-colors">Compliance</Link>
          <Link to="/terms"      className="hover:text-brand-400 transition-colors">Términos</Link>
          <Link to="/privacy"    className="hover:text-brand-400 transition-colors">Privacidad</Link>
        </div>
    </PageShell>
  );
}
