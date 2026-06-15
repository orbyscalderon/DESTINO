// Photos — upload con multer + Sharp (EXIF strip + resize).
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import { authPublisher } from '../lib/auth.js';
import { processAndUploadPhoto } from '../lib/storage.js';
import { logAudit } from '../lib/audit.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Formato no soportado'), false);
  },
});

const uploadLimiter = rateLimit({ windowMs: 60_000, max: 30 });

// POST /api/listings/:listingId/photos — upload una foto
router.post('/:listingId/photos', uploadLimiter, authPublisher, upload.single('photo'), async (req, res) => {
  try {
    const { listingId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No se recibió foto' });

    // Verificar ownership
    const { data: listing } = await supabase
      .from('encuentros_listings').select('id, publisher_id').eq('id', listingId).maybeSingle();
    if (!listing || listing.publisher_id !== req.publisher.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Cap: máximo 12 fotos por listing
    const { count } = await supabase
      .from('encuentros_photos').select('id', { count: 'exact', head: true }).eq('listing_id', listingId);
    if ((count || 0) >= 12) return res.status(400).json({ error: 'Máximo 12 fotos por anuncio' });

    const { url, thumbnail_url } = await processAndUploadPhoto({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      listing_id: listingId,
    });

    const { data: photo, error } = await supabase.from('encuentros_photos').insert({
      listing_id: listingId,
      url,
      thumbnail_url,
      position: count || 0,
      is_cover: (count || 0) === 0,    // primera foto = cover
      moderation_status: 'pending',
      uploaded_ip: req.ip,
      exif_stripped: true,
    }).select().single();
    if (error) throw error;

    // Si es cover, actualizar el listing.cover_photo_url (UX inmediata)
    if (photo.is_cover) {
      await supabase.from('encuentros_listings').update({ cover_photo_url: thumbnail_url }).eq('id', listingId);
    }

    await logAudit({
      actor_type: 'publisher', actor_id: req.publisher.id,
      action: 'photo.uploaded', target_type: 'photo', target_id: photo.id,
      ip: req.ip, ua: req.headers['user-agent'],
    });

    res.status(201).json({ photo });
  } catch (err) {
    console.error('[photos:upload]', err.message);
    res.status(500).json({ error: 'Error subiendo foto' });
  }
});

// DELETE foto
router.delete('/:listingId/photos/:photoId', authPublisher, async (req, res) => {
  try {
    const { listingId, photoId } = req.params;
    const { data: listing } = await supabase
      .from('encuentros_listings').select('id, publisher_id').eq('id', listingId).maybeSingle();
    if (!listing || listing.publisher_id !== req.publisher.id) return res.status(403).json({ error: 'No autorizado' });

    await supabase.from('encuentros_photos').delete().eq('id', photoId).eq('listing_id', listingId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

// PUT reorder fotos
router.put('/:listingId/photos/order', authPublisher, async (req, res) => {
  try {
    const { listingId } = req.params;
    const { order } = req.body || {};
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order debe ser array de IDs' });

    const { data: listing } = await supabase
      .from('encuentros_listings').select('id, publisher_id').eq('id', listingId).maybeSingle();
    if (!listing || listing.publisher_id !== req.publisher.id) return res.status(403).json({ error: 'No autorizado' });

    for (let i = 0; i < order.length; i++) {
      await supabase.from('encuentros_photos').update({
        position: i,
        is_cover: i === 0,
      }).eq('id', order[i]).eq('listing_id', listingId);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

export default router;
