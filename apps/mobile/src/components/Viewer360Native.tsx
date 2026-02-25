import React, {
  useCallback,
  useRef,
  useState,
  useEffect,
} from "react";
import {
  View,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  PixelRatio,
} from "react-native";
import { GLView, ExpoWebGLRenderingContext } from "expo-gl";
import { Asset } from "expo-asset";
import * as THREE from "three";
import { colors, radius, typography, shadow } from "../lib/theme";
import { resolveMediaUrl } from "../lib/mediaUrl";

interface Annotation {
  id: string;
  testo: string;
  x: number; // longitude degrees
  y: number; // latitude degrees
  autore: { nome: string; cognome: string };
  createdAt: string;
}

interface Foto {
  id: string;
  url: string;
  timestamp: string;
}

interface ViewerProps {
  foto: Foto[];
  currentIndex: number;
  annotations: Annotation[];
  showAnnotations?: boolean; // toggle pin visibility without losing data
  addingAnnotation: boolean;
  onSphereClick: (lon: number, lat: number) => void;
  onAnnotationPress?: (id: string) => void;
}

interface AnnotPos {
  x: number;
  y: number;
  visible: boolean;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function Viewer360Native({
  foto,
  currentIndex,
  annotations,
  showAnnotations = true,
  addingAnnotation,
  onSphereClick,
  onAnnotationPress,
}: ViewerProps) {
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const lonRef = useRef(0);
  const latRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const viewSizeRef = useRef({ width: SCREEN_W, height: SCREEN_H });
  const frameCountRef = useRef(0);
  const currentUrlRef = useRef<string>("");

  // Raw WebGL texture managed manually — bypasses Three.js upload pipeline
  const currentGlTextureRef = useRef<WebGLTexture | null>(null);
  // Stable Three.js Texture wrapper reused across photo changes
  const threeTextureRef = useRef<THREE.Texture | null>(null);

  const [annotPositions, setAnnotPositions] = useState<Map<string, AnnotPos>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Texture loading
  //
  // WHY we bypass Three.js's upload path:
  //   Three.js r150+ uses canvas.getContext('2d').drawImage() to process textures.
  //   document/canvas don't exist in React Native, so Three.js silently skips
  //   the upload and the sphere stays black.
  //
  // SOLUTION:
  //   1. Download to local file (expo-asset for remote, direct for file://)
  //   2. Upload via expo-gl's patched texImage2D which accepts { localUri }
  //   3. Inject the resulting raw WebGLTexture into renderer.properties so
  //      Three.js binds it during render without re-uploading.
  //   4. Keep texture.version = 0 → Three.js never triggers uploadTexture().
  // ---------------------------------------------------------------------------
  const loadTexture = useCallback(async (url: string) => {
    const resolved = resolveMediaUrl(url);
    if (!sphereRef.current || !glRef.current || !rendererRef.current) return;
    if (resolved === currentUrlRef.current) return;

    setLoading(true);
    try {
      // Step 1 — resolve to a local file URI
      let localUri: string;
      if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
        const asset = await Asset.fromURI(resolved).downloadAsync();
        if (!asset.localUri) throw new Error(`No localUri after download: ${resolved}`);
        localUri = asset.localUri;
      } else {
        // file:// URI from camera download — use directly
        localUri = resolved;
      }

      // Re-check refs after the async download
      const gl = glRef.current;
      const renderer = rendererRef.current;
      const sphere = sphereRef.current;
      if (!gl || !renderer || !sphere) return;

      // Step 2 — upload directly via expo-gl (bypasses Three.js canvas path)
      const glTexture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, glTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // RGBA is mandatory: expo-gl always decodes images to RGBA (4 bytes/pixel).
      // Using gl.RGB (3 bytes/pixel) causes a stride mismatch every pixel →
      // channels shift by 1 byte → the RGB moiré/fringing pattern visible in the viewer.
      // Do NOT call generateMipmap: Ricoh photos are NPOT (e.g. 5376×2688).
      // NPOT textures require WebGL 2 for mipmaps; LINEAR filter is correct here.
      (gl as any).texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE,
        { localUri }
      );

      // Step 3 — delete the previous WebGL texture
      if (currentGlTextureRef.current) {
        gl.deleteTexture(currentGlTextureRef.current);
      }
      currentGlTextureRef.current = glTexture;

      // Step 4 — inject into Three.js properties so its render loop binds it.
      // renderer.properties.get(texture).__webglTexture is what setTexture2D()
      // passes to gl.bindTexture(). With version=0 Three.js never calls
      // uploadTexture() and never touches our injected value.
      if (!threeTextureRef.current) {
        const tex = new THREE.Texture();
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        // version stays 0 — prevents Three.js from calling uploadTexture()
        threeTextureRef.current = tex;
        (sphere.material as THREE.MeshBasicMaterial).map = tex;
      }

      renderer.properties.get(threeTextureRef.current).__webglTexture = glTexture;

      const material = sphere.material as THREE.MeshBasicMaterial;
      material.needsUpdate = true;

      currentUrlRef.current = resolved;
    } catch (e) {
      console.error("[Viewer360] loadTexture error for", resolved, e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (foto[currentIndex]) {
      loadTexture(foto[currentIndex].url);
    }
  }, [currentIndex, foto, loadTexture]);

  // Update annotation screen positions (~15fps via frameCount)
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const updateAnnotPositions = useCallback(() => {
    const camera = cameraRef.current;
    const { width, height } = viewSizeRef.current;
    if (!camera || annotationsRef.current.length === 0) {
      setAnnotPositions(new Map());
      return;
    }

    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const newPositions = new Map<string, AnnotPos>();

    for (const annot of annotationsRef.current) {
      const phi = THREE.MathUtils.degToRad(90 - annot.y);
      const theta = THREE.MathUtils.degToRad(annot.x);
      const worldPos = new THREE.Vector3().setFromSphericalCoords(500, phi, theta);
      const dot = camDir.dot(worldPos.clone().normalize());

      if (dot < 0.15) {
        newPositions.set(annot.id, { x: 0, y: 0, visible: false });
        continue;
      }

      const projected = worldPos.clone().project(camera);
      const sx = ((projected.x + 1) / 2) * width;
      const sy = ((-projected.y + 1) / 2) * height;
      newPositions.set(annot.id, { x: sx, y: sy, visible: true });
    }

    setAnnotPositions(new Map(newPositions));
  }, []);

  const updateAnnotRef = useRef(updateAnnotPositions);
  updateAnnotRef.current = updateAnnotPositions;

  // GL context creation
  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      glRef.current = gl;
      const pr = PixelRatio.get();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      viewSizeRef.current = { width: w / pr, height: h / pr };

      // Renderer — expo-gl requires a canvas-like mock
      const renderer = new THREE.WebGLRenderer({
        canvas: {
          width: w,
          height: h,
          style: {} as any,
          addEventListener: (() => {}) as any,
          removeEventListener: (() => {}) as any,
          clientHeight: h,
        } as unknown as HTMLCanvasElement,
        context: gl as unknown as WebGLRenderingContext,
      });
      renderer.setSize(w, h);
      renderer.setPixelRatio(1);
      rendererRef.current = renderer;

      // Scene + camera
      const scene = new THREE.Scene();
      sceneRef.current = scene;
      const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1100);
      camera.position.set(0, 0, 0);
      cameraRef.current = camera;

      // Sphere (inverted normals for inside view)
      const geometry = new THREE.SphereGeometry(500, 48, 32);
      geometry.scale(-1, 1, 1);
      // Flip UV.y to correct the upside-down texture.
      // scale(-1,1,1) mirrors the sphere but leaves UVs intact, so equatorial
      // rows end up inverted. Flipping every V coordinate fixes it.
      const uvAttr = geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setY(i, 1 - uvAttr.getY(i));
      }
      uvAttr.needsUpdate = true;
      // color: 0xffffff = white multiplier → texture colors shown at full brightness.
      // A dark color (e.g. 0x1a1a2e) would tint/darken the texture to near-black.
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const sphere = new THREE.Mesh(geometry, material);
      scene.add(sphere);
      sphereRef.current = sphere;

      // Load initial texture
      if (foto[currentIndex]) {
        loadTexture(foto[currentIndex].url);
      }

      // Animation loop — cap at ~30fps to save battery on mobile
      let lastTime = 0;
      isAnimatingRef.current = true;
      const animate = (time: number) => {
        if (!isAnimatingRef.current) return;
        requestAnimationFrame(animate);

        if (time - lastTime < 33) return; // ~30fps cap
        lastTime = time;

        const lat = Math.max(-85, Math.min(85, latRef.current));
        const phi = THREE.MathUtils.degToRad(90 - lat);
        const theta = THREE.MathUtils.degToRad(lonRef.current);
        camera.lookAt(
          500 * Math.sin(phi) * Math.cos(theta),
          500 * Math.cos(phi),
          500 * Math.sin(phi) * Math.sin(theta)
        );

        renderer.render(scene, camera);
        gl.endFrameEXP();

        frameCountRef.current++;
        if (frameCountRef.current % 4 === 0) {
          updateAnnotRef.current();
        }
      };
      requestAnimationFrame(animate);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isAnimatingRef.current = false;
      if (currentGlTextureRef.current && glRef.current) {
        glRef.current.deleteTexture(currentGlTextureRef.current);
      }
    };
  }, []);

  // Touch handling
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isTapRef = useRef(false);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      touchStartRef.current = { x: locationX, y: locationY, time: Date.now() };
      isTapRef.current = true;
    },
    onPanResponderMove: (_, gesture) => {
      if (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8) {
        isTapRef.current = false;
      }
      lonRef.current -= gesture.vx * 3.0;
      latRef.current = Math.max(-85, Math.min(85, latRef.current + gesture.vy * 3.0));
    },
    onPanResponderRelease: (e) => {
      const elapsed = touchStartRef.current
        ? Date.now() - touchStartRef.current.time
        : 999;
      if (isTapRef.current && elapsed < 300) {
        handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY);
      }
    },
  });

  const handleTap = useCallback(
    (tapX: number, tapY: number) => {
      const camera = cameraRef.current;
      const { width, height } = viewSizeRef.current;
      if (!camera) return;

      // Check tap on annotation pin first
      for (const [id, pos] of annotPositions) {
        if (!pos.visible) continue;
        if (Math.abs(tapX - pos.x) < 28 && Math.abs(tapY - pos.y) < 28) {
          setExpandedId((prev) => (prev === id ? null : id));
          onAnnotationPress?.(id);
          return;
        }
      }

      // Close expanded annotation if tapping elsewhere
      if (expandedId) {
        setExpandedId(null);
        return;
      }

      // If adding annotation mode, convert tap to sphere lon/lat
      if (addingAnnotation) {
        const ndcX = (tapX / width) * 2 - 1;
        const ndcY = -((tapY / height) * 2 - 1);
        const vector = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
        const dir = vector.sub(camera.position).normalize();
        const lat = Math.asin(Math.max(-1, Math.min(1, dir.y))) * (180 / Math.PI);
        const lon = Math.atan2(dir.x, dir.z) * (180 / Math.PI);
        onSphereClick(lon, lat);
      }
    },
    [annotPositions, expandedId, addingAnnotation, onSphereClick, onAnnotationPress]
  );

  return (
    <View style={styles.container}>
      <GLView
        style={styles.gl}
        onContextCreate={onContextCreate}
        {...panResponder.panHandlers}
      />

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.white} />
        </View>
      )}

      {/* Annotation pins — controlled by showAnnotations toggle */}
      {showAnnotations && annotations.map((annot) => {
        const pos = annotPositions.get(annot.id);
        if (!pos?.visible) return null;
        const isExpanded = expandedId === annot.id;

        return (
          <View
            key={annot.id}
            style={[styles.annotWrapper, { left: pos.x - 16, top: pos.y - 16 }]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={styles.annotPin}
              onPress={() => setExpandedId(isExpanded ? null : annot.id)}
              activeOpacity={0.8}
            >
              <View style={styles.annotDot}>
                <Text style={styles.annotInitial}>
                  {annot.autore.nome[0]?.toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.annotBubble}>
                <Text style={styles.annotAuthor} numberOfLines={1}>
                  {annot.autore.nome} {annot.autore.cognome}
                </Text>
                <Text style={styles.annotText}>{annot.testo}</Text>
              </View>
            )}
          </View>
        );
      })}

      {/* Adding annotation hint banner */}
      {addingAnnotation && (
        <View style={styles.addHintBanner} pointerEvents="none">
          <Text style={styles.addHintText}>
            Tocca la sfera per posizionare la nota
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  gl: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  annotWrapper: {
    position: "absolute",
    zIndex: 20,
  },
  annotPin: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  annotDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F59E0B",
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.md,
  },
  annotInitial: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.white,
  },
  annotBubble: {
    position: "absolute",
    left: 34,
    top: 0,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 10,
    minWidth: 160,
    maxWidth: 220,
    ...shadow.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  annotAuthor: {
    ...typography.label,
    color: colors.text,
    marginBottom: 3,
  },
  annotText: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
  addHintBanner: {
    position: "absolute",
    bottom: 16,
    left: 20,
    right: 20,
    backgroundColor: "rgba(29,78,216,0.85)",
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  addHintText: {
    color: colors.white,
    ...typography.body,
    fontWeight: "600",
  },
});
