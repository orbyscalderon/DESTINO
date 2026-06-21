import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireAgeVerified, geoBlockAdult } from '../middleware/adult.js';
import {
  listVideos, getVideoDetail, listTags, listCategories,
  rateVideo, recordView, listTrending,
} from '../controllers/exploreController.js';
import {
  getMyPlaylists, createPlaylist, deletePlaylist,
  addToPlaylist, removeFromPlaylist, getPlaylistContent,
  getFeaturedPlaylists,
} from '../controllers/playlistsController.js';
import {
  submit2257, check2257, uploadIdMiddleware,
} from '../controllers/compliance2257Controller.js';

const router = Router();

// Geo-block aplica a TODO acceso al explore (incluso pre-auth para health checks)
router.use(geoBlockAdult);
router.use(authMiddleware);
router.use(requireAgeVerified);

// Catálogo de videos
router.get('/videos',                 listVideos);
router.get('/videos/:id',             getVideoDetail);
router.post('/videos/:id/rate',       rateVideo);
router.post('/videos/:id/view',       recordView);
router.get('/tags',                   listTags);
router.get('/categories',             listCategories);
router.get('/trending',               listTrending);

// Playlists
router.get('/playlists/featured',     getFeaturedPlaylists);
router.get('/playlists',              getMyPlaylists);
router.post('/playlists',             createPlaylist);
router.delete('/playlists/:id',       deletePlaylist);
router.get('/playlists/:id',          getPlaylistContent);
router.post('/playlists/:id/items',   addToPlaylist);
router.delete('/playlists/:id/items/:videoId', removeFromPlaylist);

// 2257 compliance (creadores que suben adult content)
router.post('/2257',                  uploadIdMiddleware, submit2257);
router.get('/2257/check/:videoId',    check2257);

export default router;
