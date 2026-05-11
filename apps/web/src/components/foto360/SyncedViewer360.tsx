"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";

export interface SyncedViewer360Handle {
  setCamera(lon: number, lat: number): void;
  getCamera(): { lon: number; lat: number };
}

interface SyncedViewer360Props {
  url: string;
  onRotate?: (lon: number, lat: number) => void;
  /** If true, user drag is disabled and the viewer is frozen */
  locked?: boolean;
}

const SyncedViewer360 = forwardRef<SyncedViewer360Handle, SyncedViewer360Props>(
  function SyncedViewer360({ url, onRotate, locked }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const lonRef = useRef(0);
    const latRef = useRef(0);
    const rafRef = useRef<number>(0);
    const onRotateRef = useRef(onRotate);
    const lockedRef = useRef(locked);

    useEffect(() => { lockedRef.current = locked; }, [locked]);

    const [loading, setLoading] = useState(true);

    // Keep onRotate ref current to avoid stale closure in drag handler
    useEffect(() => {
      onRotateRef.current = onRotate;
    }, [onRotate]);

    // Imperative handle: lets parent set camera orientation.
    // Empty deps — handle is stable across renders so parent's ref stays valid.
    useImperativeHandle(ref, () => ({
      setCamera(lon: number, lat: number) {
        lonRef.current = lon;
        latRef.current = lat;
      },
      getCamera() {
        return { lon: lonRef.current, lat: latRef.current };
      },
    }), []);

    const loadTexture = useCallback((u: string) => {
      if (!materialRef.current) return;
      setLoading(true);
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = "anonymous";
      loader.load(
        u,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          if (materialRef.current) {
            materialRef.current.map = texture;
            materialRef.current.needsUpdate = true;
          }
          setLoading(false);
        },
        undefined,
        () => setLoading(false)
      );
    }, []);

    useEffect(() => {
      loadTexture(url);
    }, [url, loadTexture]);

    // Three.js init — runs once on mount
    useEffect(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const w = container.offsetWidth;
      const h = container.offsetHeight;

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      rendererRef.current = renderer;

      const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 2000);
      cameraRef.current = camera;

      const scene = new THREE.Scene();
      const geometry = new THREE.SphereGeometry(500, 64, 32);
      geometry.scale(-1, 1, 1);
      const material = new THREE.MeshBasicMaterial();
      materialRef.current = material;
      scene.add(new THREE.Mesh(geometry, material));

      // Load initial texture — URL prop effect runs before init, so we must trigger load here too
      loadTexture(url);

      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        const phi = THREE.MathUtils.degToRad(90 - latRef.current);
        const theta = THREE.MathUtils.degToRad(lonRef.current);
        const target = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
        camera.lookAt(target);
        renderer.render(scene, camera);
      };
      animate();

      const observer = new ResizeObserver(() => {
        const nw = container.offsetWidth;
        const nh = container.offsetHeight;
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
      });
      observer.observe(container);

      return () => {
        cancelAnimationFrame(rafRef.current);
        observer.disconnect();
        renderer.dispose();
        material.dispose();
        geometry.dispose();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Drag base — captures lon/lat at mousedown/touchstart so drag is absolute
    const dragBaseRef = useRef({ lon: 0, lat: 0 });
    // Distingue drag con tasto sinistro (sincronizzato col partner) da drag
    // con tasto destro (solo questo viewer — il partner rimane fermo per la
    // durata del drag, come una sorta di "lock temporaneo"). Utile in compare
    // mode per allineare manualmente una vista senza muovere l'altra.
    const isRightDragRef = useRef(false);

    // Mouse drag — absolute from mousedown position (avoids drift)
    const onMouseDown = (e: React.MouseEvent) => {
      if (lockedRef.current) return;
      // 0 = sinistro, 2 = destro. Ignora middle/altri bottoni.
      if (e.button !== 0 && e.button !== 2) return;
      isDraggingRef.current = true;
      isRightDragRef.current = e.button === 2;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      dragBaseRef.current = { lon: lonRef.current, lat: latRef.current };
    };

    const onMouseMove = (e: React.MouseEvent) => {
      if (!isDraggingRef.current || lockedRef.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lonRef.current = dragBaseRef.current.lon + dx * 0.3;
      latRef.current = Math.max(-85, Math.min(85, dragBaseRef.current.lat + dy * 0.3));
      // Tasto sinistro → propaga al partner (sync). Tasto destro → solo questo.
      if (!isRightDragRef.current) {
        onRotateRef.current?.(lonRef.current, latRef.current);
      }
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      isRightDragRef.current = false;
    };

    // Previeni il menu contestuale del browser sul tasto destro, altrimenti
    // appare durante il drag e interrompe l'interazione.
    const onContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
    };

    // Touch drag — registered natively with { passive: false } so preventDefault works
    const lastTouchRef = useRef({ x: 0, y: 0 });
    const onTouchStart = (e: React.TouchEvent) => {
      if (lockedRef.current) return;
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      dragBaseRef.current = { lon: lonRef.current, lat: latRef.current };
    };

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const handler = (e: TouchEvent) => {
        if (lockedRef.current) return;
        e.preventDefault();
        const dx = e.touches[0].clientX - lastTouchRef.current.x;
        const dy = e.touches[0].clientY - lastTouchRef.current.y;
        lonRef.current = dragBaseRef.current.lon + dx * 0.3;
        latRef.current = Math.max(-85, Math.min(85, dragBaseRef.current.lat + dy * 0.3));
        onRotateRef.current?.(lonRef.current, latRef.current);
      };
      canvas.addEventListener("touchmove", handler, { passive: false });
      return () => canvas.removeEventListener("touchmove", handler);
    }, []);

    return (
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden bg-black"
        style={{ cursor: locked ? "not-allowed" : isDraggingRef.current ? "grabbing" : "grab" }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onContextMenu={onContextMenu}
          onTouchStart={onTouchStart}
          onTouchEnd={onMouseUp}
        />
        {loading && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ zIndex: 5 }}
          >
            <div
              className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{
                borderColor: "rgba(255,255,255,0.15)",
                borderTopColor: "rgba(255,255,255,0.7)",
              }}
            />
          </div>
        )}
      </div>
    );
  }
);

export default SyncedViewer360;
