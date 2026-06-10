import { useEffect, useRef, useState, useCallback } from 'react';
import { FiPlay, FiPause, FiVolume2, FiVolumeX, FiMaximize, FiMinimize, FiSkipForward, FiSettings, FiZap, FiRepeat } from 'react-icons/fi';
import api from '../../lib/api.js';
import VRVideoPlayer from './VRVideoPlayer.jsx';

// Reproductor adult con: speed control, PiP, loop, captions, sprite thumbnail
// hover, skip intro, floating tip button, watch progress sync.
//
// Props:
//   video: { id, url, thumbnail_url, duration_seconds, is_vr, vr_format,
//            sprite_url, sprite_interval_sec, sprite_columns,
//            intro_end_sec, credits_start_sec, user_id }
//   captions: [{ id, language, vtt_url, is_default }]
//   onTipClick: () => void  — abre TipModal
//   autoPlay: bool

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AdultVideoPlayer({ video, captions = [], onTipClick, autoPlay = true }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration_seconds || 0);
  const [showSettings, setShowSettings] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [captionLang, setCaptionLang] = useState(captions.find(c => c.is_default)?.language || null);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPos, setHoverPos] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [pip, setPip] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [resumeAt, setResumeAt] = useState(null);
  const [showResume, setShowResume] = useState(false);
  const lastSyncRef = useRef(0);

  // Cargar resume position
  useEffect(() => {
    if (!video?.id) return;
    api.get(`/api/adult-video/watch/${video.id}`)
      .then(r => {
        const pos = r.data?.resume?.resume_position_seconds;
        if (pos && pos > 30 && (!r.data.resume.completed)) {
          setResumeAt(pos);
          setShowResume(true);
        }
      })
      .catch(() => {});
    api.post(`/api/adult-video/watch/${video.id}/new-session`).catch(() => {});
  }, [video?.id]);

  // Sync de progreso cada 15s + on pause + on unmount
  const syncProgress = useCallback((completed = false) => {
    if (!videoRef.current || !video?.id) return;
    const pos = Math.floor(videoRef.current.currentTime || 0);
    const dur = Math.floor(videoRef.current.duration || 0);
    const isComplete = completed || (dur > 0 && pos / dur > 0.95);
    api.post('/api/adult-video/watch', {
      video_id: video.id,
      position_seconds: pos,
      watched_seconds: pos,
      completed: isComplete,
    }).catch(() => {});
  }, [video?.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused && videoRef.current.currentTime > 0) {
        const now = Date.now();
        if (now - lastSyncRef.current > 15000) {
          syncProgress();
          lastSyncRef.current = now;
        }
      }
    }, 1000);
    const onUnload = () => syncProgress();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', onUnload);
      syncProgress();
    };
  }, [syncProgress]);

  // Video tag event handlers
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => { setPlaying(false); syncProgress(); };
    const onTime = () => setCurrentTime(v.currentTime);
    const onLoad = () => setDuration(v.duration);
    const onEnd = () => syncProgress(true);
    const onPipEnter = () => setPip(true);
    const onPipExit = () => setPip(false);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onLoad);
    v.addEventListener('ended', onEnd);
    v.addEventListener('enterpictureinpicture', onPipEnter);
    v.addEventListener('leavepictureinpicture', onPipExit);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onLoad);
      v.removeEventListener('ended', onEnd);
      v.removeEventListener('enterpictureinpicture', onPipEnter);
      v.removeEventListener('leavepictureinpicture', onPipExit);
    };
  }, [syncProgress]);

  // Aplicar cambios a video tag
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed]);
  useEffect(() => { if (videoRef.current) videoRef.current.loop = loop; }, [loop]);
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);
  useEffect(() => { if (videoRef.current) videoRef.current.volume = volume; }, [volume]);

  // Auto-hide controls
  useEffect(() => {
    if (!playing) { setControlsVisible(true); return; }
    const t = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(t);
  }, [playing, currentTime]);

  const togglePlay = () => {
    if (videoRef.current?.paused) videoRef.current.play();
    else videoRef.current?.pause();
  };

  const seek = (time) => {
    if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(duration, time));
  };

  const onProgressMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(x * duration);
    setHoverPos(x * 100);
  };

  const togglePip = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (videoRef.current?.requestPictureInPicture) await videoRef.current.requestPictureInPicture();
    } catch {}
  };

  const toggleFs = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFs(true);
    } else {
      document.exitFullscreen?.();
      setIsFs(false);
    }
  };

  const skipIntro = () => {
    if (video.intro_end_sec && currentTime < video.intro_end_sec) {
      seek(video.intro_end_sec);
    }
  };

  const resumeFromSaved = () => {
    if (resumeAt) seek(resumeAt);
    setShowResume(false);
  };

  const startFromBegin = () => {
    seek(0);
    setShowResume(false);
  };

  // Sprite hover preview
  const spriteHoverStyle = (() => {
    if (!video.sprite_url || !video.sprite_interval_sec || hoverTime == null) return null;
    const idx = Math.floor(hoverTime / video.sprite_interval_sec);
    const cols = video.sprite_columns || 10;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return {
      backgroundImage: `url(${video.sprite_url})`,
      backgroundPosition: `-${col * 160}px -${row * 90}px`,
      width: 160, height: 90,
    };
  })();

  // VR fallback
  if (video.is_vr) {
    return <VRVideoPlayer url={video.url} format={video.vr_format} poster={video.thumbnail_url} />;
  }

  const inIntro = video.intro_end_sec && currentTime < video.intro_end_sec;
  const inCredits = video.credits_start_sec && currentTime >= video.credits_start_sec;
  const activeCap = captionLang ? captions.find(c => c.language === captionLang) : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black group select-none"
      onMouseMove={() => setControlsVisible(true)}
      onMouseLeave={() => playing && setControlsVisible(false)}
    >
      <video
        ref={videoRef}
        src={video.url}
        poster={video.thumbnail_url}
        autoPlay={autoPlay && !showResume}
        playsInline
        className="w-full h-full object-contain"
        onClick={togglePlay}
      >
        {activeCap && <track src={activeCap.vtt_url} kind="subtitles" srcLang={activeCap.language} default />}
      </video>

      {/* Resume prompt */}
      {showResume && resumeAt && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-30">
          <div className="bg-dark-800 rounded-2xl p-6 max-w-sm space-y-3 border border-white/10">
            <p className="text-white font-bold">Continuar viendo desde {fmtTime(resumeAt)}?</p>
            <div className="flex gap-2">
              <button onClick={resumeFromSaved} className="flex-1 px-4 py-2 rounded-xl bg-brand-500 text-white font-bold text-sm">
                Continuar
              </button>
              <button onClick={startFromBegin} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-sm">
                Desde inicio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skip intro */}
      {inIntro && !showResume && (
        <button
          onClick={skipIntro}
          className="absolute bottom-24 right-4 z-20 px-4 py-2 rounded-xl bg-black/70 backdrop-blur border border-white/20 text-white text-sm font-bold flex items-center gap-2 hover:bg-black/90"
        >
          <FiSkipForward size={14} /> Saltar intro
        </button>
      )}

      {/* Floating tip button */}
      {onTipClick && (
        <button
          onClick={onTipClick}
          className="absolute top-4 right-4 z-20 p-3 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-glow-lg hover:scale-110 transition-transform"
          aria-label="Enviar tip"
        >
          <FiZap size={18} />
        </button>
      )}

      {/* Controls overlay */}
      <div className={`absolute inset-x-0 bottom-0 z-10 transition-opacity duration-300 bg-gradient-to-t from-black/90 to-transparent pt-12 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Progress bar */}
        <div className="px-4 mb-2 relative">
          <div
            className="h-1.5 bg-white/20 rounded-full cursor-pointer relative group/bar"
            onMouseMove={onProgressMouseMove}
            onMouseLeave={() => setHoverTime(null)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - rect.left) / rect.width;
              seek(x * duration);
            }}
          >
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(currentTime / duration) * 100 || 0}%` }} />
            {video.intro_end_sec && (
              <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-400/60" style={{ left: `${(video.intro_end_sec / duration) * 100}%` }} title="Fin de intro" />
            )}
            {video.credits_start_sec && (
              <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-400/60" style={{ left: `${(video.credits_start_sec / duration) * 100}%` }} title="Inicio créditos" />
            )}
          </div>
          {/* Sprite preview */}
          {spriteHoverStyle && hoverTime != null && (
            <div
              className="absolute bottom-6 -translate-x-1/2 pointer-events-none border-2 border-white/30 rounded-md overflow-hidden bg-black"
              style={{ left: `${hoverPos}%` }}
            >
              <div style={spriteHoverStyle} />
              <div className="text-[10px] text-white text-center font-mono py-0.5 bg-black/80">
                {fmtTime(hoverTime)}
              </div>
            </div>
          )}
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-3 px-4 pb-3 text-white">
          <button onClick={togglePlay} className="p-2 hover:bg-white/10 rounded-lg">
            {playing ? <FiPause size={18} /> : <FiPlay size={18} />}
          </button>

          <button onClick={() => setMuted(m => !m)} className="p-2 hover:bg-white/10 rounded-lg">
            {muted ? <FiVolumeX size={16} /> : <FiVolume2 size={16} />}
          </button>

          <input
            type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
            onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false); }}
            className="w-20 h-1 accent-brand-500"
          />

          <span className="text-xs font-mono tabular-nums">
            {fmtTime(currentTime)} / {fmtTime(duration)}
          </span>

          <div className="flex-1" />

          <button
            onClick={() => setLoop(l => !l)}
            className={`p-2 hover:bg-white/10 rounded-lg ${loop ? 'text-brand-400' : ''}`}
            aria-label="Loop"
          >
            <FiRepeat size={16} />
          </button>

          {captions.length > 0 && (
            <select
              value={captionLang || ''}
              onChange={(e) => setCaptionLang(e.target.value || null)}
              className="px-2 py-1 bg-white/10 rounded text-xs"
            >
              <option value="">CC off</option>
              {captions.map(c => <option key={c.id} value={c.language}>{c.language.toUpperCase()}</option>)}
            </select>
          )}

          <div className="relative">
            <button onClick={() => setShowSettings(s => !s)} className="p-2 hover:bg-white/10 rounded-lg">
              <FiSettings size={16} />
            </button>
            {showSettings && (
              <div className="absolute bottom-full right-0 mb-2 bg-dark-800 border border-white/10 rounded-xl p-2 min-w-[120px] shadow-xl">
                <p className="text-[10px] uppercase text-gray-500 px-2 mb-1">Velocidad</p>
                <div className="grid grid-cols-3 gap-1">
                  {SPEEDS.map(s => (
                    <button
                      key={s}
                      onClick={() => { setSpeed(s); setShowSettings(false); }}
                      className={`px-2 py-1 text-xs rounded ${speed === s ? 'bg-brand-500 text-white' : 'text-gray-400 hover:bg-white/10'}`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {('pictureInPictureEnabled' in document) && (
            <button onClick={togglePip} className={`p-2 hover:bg-white/10 rounded-lg ${pip ? 'text-brand-400' : ''}`} aria-label="PiP">
              <FiMinimize size={16} />
            </button>
          )}

          <button onClick={toggleFs} className="p-2 hover:bg-white/10 rounded-lg" aria-label="Fullscreen">
            <FiMaximize size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
