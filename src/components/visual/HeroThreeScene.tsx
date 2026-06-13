"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./HeroThreeScene.module.css";

type PieceKind = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";

const pieceModelPaths: Record<PieceKind, string> = {
  bishop: "/assets/hero-chess/bishop.glb",
  king: "/assets/hero-chess/king.glb",
  knight: "/assets/hero-chess/knight.glb",
  pawn: "/assets/hero-chess/pawn.glb",
  queen: "/assets/hero-chess/queen.glb",
  rook: "/assets/hero-chess/rook.glb"
};

const backRank: PieceKind[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

const pieceHeights: Record<PieceKind, number> = {
  bishop: 0.66,
  king: 0.8,
  knight: 0.62,
  pawn: 0.44,
  queen: 0.76,
  rook: 0.58
};

export function HeroThreeScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) {
      return;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotionQuery.matches) {
      const fallbackFrame = window.requestAnimationFrame(() => setShowFallback(true));
      return () => window.cancelAnimationFrame(fallbackFrame);
    }

    let isDisposed = false;
    let isVisible = true;
    let frameId = 0;
    let pointerX = 0;
    let pointerY = 0;

    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry?.isIntersecting ?? true;
    });
    observer.observe(shell);

    const handlePointerMove = (event: PointerEvent) => {
      const rect = shell.getBoundingClientRect();
      pointerX = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
      pointerY = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    void import("three")
      .then(async (THREE) => {
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        if (isDisposed) {
          return;
        }

        let renderer: import("three").WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            canvas,
            powerPreference: "high-performance"
          });
        } catch {
          setShowFallback(true);
          return;
        }

        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 90);
        camera.position.set(0.15, 6.65, 10.8);
        camera.lookAt(3.4, 0.75, -1.0);

        const ambient = new THREE.AmbientLight(0xd6ebff, 1.05);
        const key = new THREE.DirectionalLight(0x7ee7b8, 3.8);
        key.position.set(-4.8, 8.5, 5.2);
        const rim = new THREE.DirectionalLight(0x68b8ff, 2.6);
        rim.position.set(7, 5.5, -5.8);
        const fill = new THREE.PointLight(0xffffff, 1.7, 16);
        fill.position.set(2.5, 2.2, 4.8);
        scene.add(ambient, key, rim, fill);

        const whitePieceMaterial = new THREE.MeshPhysicalMaterial({
          color: 0xe8fff7,
          emissive: 0x071c18,
          metalness: 0.05,
          roughness: 0.16,
          transparent: true,
          opacity: 0.96,
          transmission: 0.06,
          thickness: 1.15,
          ior: 1.35
        });
        const darkPieceMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x2d6d78,
          emissive: 0x061d25,
          metalness: 0.12,
          roughness: 0.22,
          transparent: true,
          opacity: 0.96
        });
        const lightSquareMaterial = new THREE.MeshPhysicalMaterial({
          color: 0xd5eee5,
          metalness: 0.04,
          roughness: 0.34,
          transparent: true,
          opacity: 0.86
        });
        const darkSquareMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x1d5660,
          metalness: 0.06,
          roughness: 0.36,
          transparent: true,
          opacity: 0.88
        });
        const boardEdgeMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x0c2536,
          metalness: 0.16,
          roughness: 0.28,
          transparent: true,
          opacity: 0.96
        });
        const shadowMaterial = new THREE.MeshBasicMaterial({
          color: 0x06131f,
          transparent: true,
          opacity: 0.2,
          depthWrite: false
        });

        const loader = new GLTFLoader();
        const loadedModels = await Promise.all(
          (Object.keys(pieceModelPaths) as PieceKind[]).map(async (kind) => {
            const gltf = await loader.loadAsync(pieceModelPaths[kind]);
            return [kind, gltf.scene] as const;
          })
        );
        if (isDisposed) {
          renderer.dispose();
          return;
        }

        const modelTemplates = Object.fromEntries(loadedModels) as Record<PieceKind, import("three").Group>;

        const board = new THREE.Group();
        board.position.set(4.78, 1.62, -1.46);
        board.rotation.x = -0.08;
        board.rotation.y = -0.42;
        board.rotation.z = -0.08;
        scene.add(board);

        const squareSize = 0.52;
        const boardSize = squareSize * 8;
        const squareGeometry = new THREE.BoxGeometry(squareSize, 0.06, squareSize);
        const boardBase = new THREE.Mesh(new THREE.BoxGeometry(boardSize + 0.36, 0.12, boardSize + 0.36), boardEdgeMaterial);
        boardBase.position.y = -0.08;
        board.add(boardBase);

        for (let rank = 0; rank < 8; rank += 1) {
          for (let file = 0; file < 8; file += 1) {
            const material = (rank + file) % 2 === 0 ? lightSquareMaterial : darkSquareMaterial;
            const square = new THREE.Mesh(squareGeometry, material);
            square.position.set((file - 3.5) * squareSize, 0, (rank - 3.5) * squareSize);
            board.add(square);
          }
        }

        const createPiece = (kind: PieceKind, material: import("three").Material) => {
          const wrapper = new THREE.Group();
          const model = modelTemplates[kind].clone(true);
          model.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.material = material;
              object.frustumCulled = false;
            }
          });

          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          model.position.sub(center);
          model.position.y += size.y / 2;
          wrapper.scale.setScalar(pieceHeights[kind] / Math.max(size.y, 0.001));
          wrapper.add(model);
          return wrapper;
        };

        const addPiece = (kind: PieceKind, file: number, rank: number, color: "white" | "black") => {
          const piece = createPiece(kind, color === "white" ? whitePieceMaterial : darkPieceMaterial);
          piece.position.set((file - 3.5) * squareSize, 0.03, (rank - 3.5) * squareSize);
          piece.rotation.y = color === "white" ? Math.PI : 0;
          board.add(piece);

          const shadow = new THREE.Mesh(new THREE.CircleGeometry(squareSize * 0.3, 28), shadowMaterial);
          shadow.position.set(piece.position.x, 0.035, piece.position.z);
          shadow.rotation.x = -Math.PI / 2;
          board.add(shadow);
        };

        backRank.forEach((kind, file) => {
          addPiece(kind, file, 0, "white");
          addPiece("pawn", file, 1, "white");
          addPiece("pawn", file, 6, "black");
          addPiece(kind, file, 7, "black");
        });

        const resizeRendererToDisplaySize = () => {
          const width = Math.max(1, canvas.clientWidth);
          const height = Math.max(1, canvas.clientHeight);
          const pixelRatio = renderer.getPixelRatio();
          const needResize = canvas.width !== Math.floor(width * pixelRatio) || canvas.height !== Math.floor(height * pixelRatio);
          if (needResize) {
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
          }
        };

        const render = (time: number) => {
          if (isDisposed) {
            return;
          }

          frameId = window.requestAnimationFrame(render);
          if (!isVisible) {
            return;
          }

          resizeRendererToDisplaySize();
          const seconds = time * 0.001;
          board.rotation.y = -0.42 + Math.sin(seconds * 0.16) * 0.14 + seconds * 0.018;
          board.rotation.z = -0.08 + Math.sin(seconds * 0.12) * 0.014;
          camera.position.x += (pointerX * 0.42 + 0.1 - camera.position.x) * 0.028;
          camera.position.y += (6.65 - pointerY * 0.28 - camera.position.y) * 0.028;
          camera.lookAt(3.4 + pointerX * 0.1, 0.75 - pointerY * 0.06, -1.0);
          renderer.render(scene, camera);
        };

        frameId = window.requestAnimationFrame(render);

        const disposedGeometries = new Set<import("three").BufferGeometry>();
        const disposedMaterials = new Set<import("three").Material>();

        const disposeMaterial = (material: import("three").Material | import("three").Material[]) => {
          if (Array.isArray(material)) {
            material.forEach((item) => disposeMaterial(item));
            return;
          }
          if (disposedMaterials.has(material)) {
            return;
          }
          disposedMaterials.add(material);
          material.dispose();
        };

        const disposeScene = () => {
          renderer.dispose();
          scene.traverse((object) => {
            const disposableObject = object as {
              geometry?: import("three").BufferGeometry;
              material?: import("three").Material | import("three").Material[];
            };
            if (disposableObject.geometry && !disposedGeometries.has(disposableObject.geometry)) {
              disposedGeometries.add(disposableObject.geometry);
              disposableObject.geometry.dispose();
            }
            if (disposableObject.material) {
              disposeMaterial(disposableObject.material);
            }
          });
        };

        const cleanup = () => {
          if (frameId) {
            window.cancelAnimationFrame(frameId);
          }
          disposeScene();
        };

        shell.addEventListener("hero-scene-dispose", cleanup, { once: true });
      })
      .catch(() => {
        if (!isDisposed) {
          setShowFallback(true);
        }
      });

    return () => {
      isDisposed = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      shell.dispatchEvent(new Event("hero-scene-dispose"));
      window.removeEventListener("pointermove", handlePointerMove);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={shellRef} className={styles.sceneShell} aria-hidden="true">
      {showFallback ? <span className={styles.fallback} /> : null}
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
