import { supabase } from '../lib/supabase.js';
import multer from 'multer';
import { uploadFile } from '../lib/storageProvider.js';

const ALLOWED_ID_TYPES = ['passport', 'drivers_license', 'national_id'];
const ALLOWED_ID_MIME  = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const idUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_ID_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido para ID'), false);
  },
});

export const uploadIdMiddleware = idUpload.single('id_document');

// POST /api/compliance/2257
// Body: { video_id, performer_legal_name, performer_dob (YYYY-MM-DD),
//         performer_id_type, consent_signed, produced_at }
// File: id_document
export const submit2257 = async (req, res) => {
  try {
    const {
      video_id, performer_legal_name, performer_dob,
      performer_id_type, consent_signed, produced_at,
    } = req.body;

    if (!video_id) return res.status(400).json({ error: 'video_id requerido' });
    if (!performer_legal_name?.trim()) return res.status(400).json({ error: 'Nombre legal del performer requerido' });
    if (!performer_dob) return res.status(400).json({ error: 'Fecha de nacimiento requerida' });
    if (!ALLOWED_ID_TYPES.includes(performer_id_type)) {
      return res.status(400).json({ error: 'Tipo de ID inválido' });
    }
    if (!consent_signed || consent_signed === 'false') {
      return res.status(400).json({ error: 'Debes firmar el consentimiento' });
    }

    // Verificar que el video le pertenece al usuario y es adulto
    const { data: video } = await supabase
      .from('profile_videos').select('user_id, is_adult').eq('id', video_id).single();
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });
    if (video.user_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
    if (!video.is_adult) return res.status(400).json({ error: '2257 solo aplica a contenido adulto' });

    // Verificar edad >= 18
    const birthDate = new Date(performer_dob);
    const age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (isNaN(age) || age < 18) {
      return res.status(400).json({ error: 'Performer debe ser mayor de 18 años' });
    }

    // Subir ID document a storage privado (importante: no público!)
    let idDocUrl = null;
    if (req.file) {
      const ext = req.file.mimetype === 'application/pdf' ? 'pdf'
                : req.file.mimetype === 'image/png' ? 'png'
                : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
      const path = `2257_records/${req.user.id}/${video_id}_${Date.now()}.${ext}`;
      idDocUrl = await uploadFile(path, req.file.buffer, req.file.mimetype);
    } else {
      return res.status(400).json({ error: 'Documento de ID requerido' });
    }

    // Custodian de records leído desde compliance_config (editable sin redeploy)
    const { data: custodianCfg } = await supabase
      .from('compliance_config')
      .select('value')
      .eq('key', 'custodian_name')
      .maybeSingle();

    await supabase.from('video_2257_records').insert({
      video_id,
      uploaded_by: req.user.id,
      performer_legal_name: performer_legal_name.trim(),
      performer_dob,
      performer_id_type,
      performer_id_document_url: idDocUrl,
      consent_signed_at: new Date().toISOString(),
      produced_at: produced_at || new Date().toISOString().slice(0, 10),
      custodian_name: custodianCfg?.value || 'Pendiente de designación',
    });

    // Marcar el video como con records completos
    await supabase.from('profile_videos')
      .update({ has_2257_records: true })
      .eq('id', video_id);

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('submit2257 error:', err.message);
    res.status(500).json({ error: 'Error registrando 2257' });
  }
};

// GET /api/compliance/2257/check/:videoId — admin: verifica records
export const check2257 = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { data: record } = await supabase
      .from('video_2257_records').select('*').eq('video_id', videoId).maybeSingle();
    res.json({ has_record: !!record, record });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
