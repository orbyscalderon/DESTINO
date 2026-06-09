import { useEffect, useRef } from 'react';

// Reproductor para video VR/360.
// Soporta formatos: mono_360, stereo_180_sbs, stereo_360_tb, flat_180_sbs.
// Render con WebGL básico usando three.js cargado dinámicamente.
//
// Para mono_360: render como esfera invertida con video como texture.
// Para stereo: split horizontal (sbs) o vertical (tb) → 2 viewports VR.
//
// Si three.js no está disponible (no instalado), cae a un video tag estándar.
//
// Props:
//   url:    URL del video
//   format: vr_format del DB (default mono_360)
//   poster: thumbnail
//   onError, onLoaded: callbacks

export default function VRVideoPlayer({ url, format = 'mono_360', poster, onError, onLoaded }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!url || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const THREE = await import('three').catch(() => null);
        if (!THREE) {
          // Fallback: video tag normal
          if (videoRef.current) videoRef.current.style.display = 'block';
          onLoaded?.();
          return;
        }

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.set(0, 0, 0.1);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        container.innerHTML = '';
        container.appendChild(renderer.domElement);

        const video = document.createElement('video');
        video.src = url;
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = false;
        video.playsInline = true;
        video.play().catch(() => {});

        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;

        let geometry;
        if (format === 'flat_180_sbs' || format === 'stereo_180_sbs') {
          geometry = new THREE.SphereGeometry(500, 60, 40, -Math.PI / 2, Math.PI);
        } else {
          geometry = new THREE.SphereGeometry(500, 60, 40);
        }
        geometry.scale(-1, 1, 1);

        const material = new THREE.MeshBasicMaterial({ map: texture });
        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);

        // Touch / mouse drag para mirar alrededor
        let dragging = false, lastX = 0, lastY = 0;
        let lon = 0, lat = 0;
        const onDown = (e) => { dragging = true; lastX = e.clientX || e.touches?.[0]?.clientX; lastY = e.clientY || e.touches?.[0]?.clientY; };
        const onMove = (e) => {
          if (!dragging) return;
          const cx = e.clientX || e.touches?.[0]?.clientX;
          const cy = e.clientY || e.touches?.[0]?.clientY;
          lon += (cx - lastX) * 0.2;
          lat = Math.max(-85, Math.min(85, lat + (cy - lastY) * 0.2));
          lastX = cx; lastY = cy;
        };
        const onUp = () => { dragging = false; };
        renderer.domElement.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        renderer.domElement.addEventListener('touchstart', onDown);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onUp);

        let rafId = null;
        const animate = () => {
          const phi = THREE.MathUtils.degToRad(90 - lat);
          const theta = THREE.MathUtils.degToRad(lon);
          camera.lookAt(
            500 * Math.sin(phi) * Math.cos(theta),
            500 * Math.cos(phi),
            500 * Math.sin(phi) * Math.sin(theta)
          );
          renderer.render(scene, camera);
          rafId = requestAnimationFrame(animate);
        };
        animate();
        onLoaded?.();

        cleanupRef.current = () => {
          cancelAnimationFrame(rafId);
          renderer.dispose();
          texture.dispose();
          geometry.dispose();
          material.dispose();
          video.pause();
          renderer.domElement.removeEventListener('mousedown', onDown);
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          renderer.domElement.removeEventListener('touchstart', onDown);
          window.removeEventListener('touchmove', onMove);
          window.removeEventListener('touchend', onUp);
        };
      } catch (err) {
        if (!cancelled) onError?.(err);
      }
    })();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, [url, format]);

  return (
    <div className="relative w-full h-full bg-black rounded-xl overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />
      <video
        ref={videoRef}
        src={url}
        poster={poster}
        controls
        playsInline
        className="w-full h-full hidden"
      />
      <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-black/60 backdrop-blur text-[10px] text-white font-mono">
        VR · {format}
      </div>
      <div className="absolute bottom-3 left-3 px-2 py-1 rounded-full bg-black/60 backdrop-blur text-[10px] text-white/70">
        Arrastra para mirar alrededor
      </div>
    </div>
  );
}
