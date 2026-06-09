import { supabase } from '../lib/supabase.js';
import multer from 'multer';
import { uploadFile } from '../lib/storageProvider.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});
export const uploadVaultItemMiddleware = upload.single('file');

// GET /api/creator-monetization/vault?type=photo
export const listMyVault = async (req, res) => {
  try {
    const { type } = req.query;
    let q = supabase.from('creator_vault_items').select('*')
      .eq('creator_id', req.user.id).order('created_at', { ascending: false });
    if (type) q = q.eq('type', type);
    const { data } = await q;
    res.json({ items: data || [] });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};

// POST /api/creator-monetization/vault — sube y guarda
export const createVaultItem = async (req, res) => {
  try {
    const { type, title, description, is_adult, tags } = req.body;
    if (!type) return res.status(400).json({ error: 'type requerido' });

    let url = req.body.url || null;
    let storagePath = null;
    let sizeBytes = null;

    if (req.file) {
      const ext = req.file.mimetype.split('/')[1] || 'bin';
      storagePath = `vault/${req.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      url = await uploadFile(storagePath, req.file.buffer, req.file.mimetype);
      sizeBytes = req.file.size;
    }

    if (!url) return res.status(400).json({ error: 'Se requiere archivo o url' });

    // v71: moderar con Sightengine antes de guardar en vault
    if (type === 'photo' || type === 'video' || type === 'gif') {
      try {
        const { moderateImage } = await import('../lib/moderation.js');
        const { data: prof } = await supabase
          .from('profiles').select('is_adult_creator').eq('id', req.user.id).single();
        const mod = await moderateImage(url, { allowAdult: !!prof?.is_adult_creator });
        if (!mod.ok) {
          // Borrar el archivo subido si moderación lo rechaza
          if (storagePath) {
            const { deleteFile } = await import('../lib/storageProvider.js');
            await deleteFile([storagePath]).catch(() => {});
          }
          return res.status(422).json({
            error: `Contenido rechazado por moderación automática: ${mod.reason || 'no permitido'}`,
            code: 'MODERATION_REJECTED',
          });
        }
        // Si Sightengine detectó adulto pero el creator está verificado, marcar is_adult
        if (mod.isAdult) {
          req.body.is_adult = true;
        }
      } catch (err) {
        console.error('[vault moderation]', err.message);
      }
    }

    const tagArr = typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : (tags || []);

    const { data, error } = await supabase.from('creator_vault_items').insert({
      creator_id: req.user.id, type,
      title: title?.trim() || null,
      description: description?.trim() || null,
      url, storage_path: storagePath, size_bytes: sizeBytes,
      is_adult: req.body.is_adult === 'true' || req.body.is_adult === true,
      tags: tagArr,
    }).select().single();

    if (error) throw error;
    res.status(201).json({ item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/creator-monetization/vault/:id
export const deleteVaultItem = async (req, res) => {
  try {
    const { error } = await supabase.from('creator_vault_items')
      .delete().eq('id', req.params.id).eq('creator_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/creator-monetization/vault/:id/use — incrementa use_count cuando se reutiliza
export const markUsed = async (req, res) => {
  try {
    await supabase.rpc('increment_vault_use', { p_item_id: req.params.id }).catch(async () => {
      const { data: i } = await supabase.from('creator_vault_items')
        .select('use_count').eq('id', req.params.id).single();
      await supabase.from('creator_vault_items')
        .update({ use_count: (i?.use_count || 0) + 1, last_used_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('creator_id', req.user.id);
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error' });
  }
};
