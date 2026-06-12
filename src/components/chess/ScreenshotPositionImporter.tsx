"use client";

import clsx from "clsx";
import { Clipboard, ImagePlus, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadFen } from "@/lib/chess/fen";
import { recognizeScreenshotImage, type ScreenshotRecognitionSquare } from "@/lib/chess/screenshot-recognition";
import {
  createEmptyScreenshotBoard,
  createFenFromScreenshotBoard,
  cycleScreenshotPiece,
  mapVisualBoardToFenBoard,
  screenshotPieceGlyphs,
  screenshotPieceLabels,
  type ScreenshotBoard,
  type ScreenshotBoardOrientation
} from "@/lib/chess/screenshot-position";
import styles from "./ScreenshotPositionImporter.module.css";

type ScreenshotPositionImporterProps = {
  onLoadFen: (fen: string) => void;
};

const castlingOptions = [
  { label: "None", value: "-" },
  { label: "Both sides", value: "KQkq" },
  { label: "White only", value: "KQ" },
  { label: "Black only", value: "kq" }
];

function imageFileFromItems(items: DataTransferItemList | null | undefined): File | null {
  if (!items) {
    return null;
  }

  const imageItem = Array.from(items).find((item) => item.kind === "file" && item.type.startsWith("image/"));
  return imageItem?.getAsFile() ?? null;
}

function imageFileFromFiles(files: FileList | null | undefined): File | null {
  if (!files) {
    return null;
  }

  return Array.from(files).find((file) => file.type.startsWith("image/")) ?? null;
}

function isTextEditingElement(element: Element | null): boolean {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

function visualSquareLabel(index: number): string {
  const row = Math.floor(index / 8) + 1;
  const column = (index % 8) + 1;
  return `visual row ${row}, column ${column}`;
}

export function ScreenshotPositionImporter({ onLoadFen }: ScreenshotPositionImporterProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [visualBoard, setVisualBoard] = useState<ScreenshotBoard>(() => createEmptyScreenshotBoard());
  const [recognitionSquares, setRecognitionSquares] = useState<ScreenshotRecognitionSquare[]>([]);
  const [orientation, setOrientation] = useState<ScreenshotBoardOrientation>("white");
  const [turn, setTurn] = useState<"w" | "b">("w");
  const [castling, setCastling] = useState("-");
  const [fullmoveNumber, setFullmoveNumber] = useState(1);
  const [status, setStatus] = useState("Paste a board screenshot or choose an image.");
  const [isReading, setIsReading] = useState(false);

  const fenBoard = useMemo(() => mapVisualBoardToFenBoard(visualBoard, orientation), [orientation, visualBoard]);
  const screenshotFen = useMemo(
    () =>
      createFenFromScreenshotBoard(fenBoard, {
        orientation,
        turn,
        castling,
        halfmoveClock: 0,
        fullmoveNumber
      }),
    [castling, fenBoard, fullmoveNumber, orientation, turn]
  );
  const fenValidation = useMemo(() => loadFen(screenshotFen), [screenshotFen]);
  const recognizedCount = useMemo(() => visualBoard.filter(Boolean).length, [visualBoard]);
  const confidence = useMemo(() => {
    const pieceSquares = recognitionSquares.filter((square) => square.piece);
    if (pieceSquares.length === 0) {
      return 0;
    }

    return pieceSquares.reduce((total, square) => total + square.confidence, 0) / pieceSquares.length;
  }, [recognitionSquares]);

  const setImageFile = useCallback((file: File | null) => {
    if (!file) {
      setStatus("Paste or choose an image file.");
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;
    setImageUrl(nextUrl);
    setImageName(file.name || "Clipboard image");
    setStatus("Reading screenshot.");
  }, []);

  const readCurrentImage = useCallback(() => {
    const image = imageRef.current;
    if (!image) {
      setStatus("Add a screenshot first.");
      return;
    }

    try {
      setIsReading(true);
      const result = recognizeScreenshotImage(image);
      setVisualBoard(result.visualBoard);
      setRecognitionSquares(result.squares);
      setStatus(
        result.occupiedSquares > 0
          ? `Found ${result.occupiedSquares} occupied squares. Check the board before loading.`
          : "No pieces were found. Try a cleaner crop or edit the board manually."
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not read this screenshot.");
    } finally {
      setIsReading(false);
    }
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isTextEditingElement(document.activeElement)) {
        return;
      }

      const file = imageFileFromItems(event.clipboardData?.items);
      if (!file) {
        return;
      }

      event.preventDefault();
      setImageFile(file);
    };

    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [setImageFile]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    },
    []
  );

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const file = imageFileFromItems(event.clipboardData.items);
    if (!file) {
      return;
    }

    event.preventDefault();
    setImageFile(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setImageFile(imageFileFromFiles(event.dataTransfer.files) ?? imageFileFromItems(event.dataTransfer.items));
  };

  const updateVisualPiece = (index: number) => {
    const nextPiece = cycleScreenshotPiece(visualBoard[index]);
    setVisualBoard((current) => current.map((piece, pieceIndex) => (pieceIndex === index ? nextPiece : piece)));
    setRecognitionSquares((squares) =>
      Array.from({ length: 64 }, (_, squareIndex) => {
        const square = squares[squareIndex] ?? { piece: null, confidence: 1, occupied: false };
        return squareIndex === index ? { piece: nextPiece, confidence: 1, occupied: Boolean(nextPiece) } : square;
      })
    );
  };

  const clearBoard = () => {
    setVisualBoard(createEmptyScreenshotBoard());
    setRecognitionSquares([]);
    setStatus("Board cleared.");
  };

  const loadPosition = () => {
    onLoadFen(screenshotFen);
    setStatus("Position loaded.");
  };

  return (
    <div className={styles.screenshotImporter}>
      <div className={styles.screenshotHeader}>
        <div>
          <h2>Screenshot import</h2>
          <p>Paste, drop, or choose a 2D board image, then verify the detected pieces before loading.</p>
        </div>
        <button type="button" onClick={loadPosition} disabled={!fenValidation.ok}>
          Load position
        </button>
      </div>

      <div
        className={styles.dropZone}
        tabIndex={0}
        role="button"
        aria-label="Paste or drop screenshot image"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={imageRef} src={imageUrl} alt={imageName ? `Imported screenshot ${imageName}` : "Imported screenshot"} onLoad={readCurrentImage} />
        ) : (
          <div className={styles.dropEmpty}>
            <Clipboard size={22} aria-hidden="true" />
            <span>Click here, paste an image, or drop a screenshot.</span>
          </div>
        )}
      </div>

      <div className={styles.screenshotActions}>
        <label className={styles.fileButton}>
          <ImagePlus size={16} aria-hidden="true" />
          Choose image
          <input ref={fileInputRef} type="file" accept="image/*" onChange={(event) => setImageFile(imageFileFromFiles(event.target.files))} />
        </label>
        <button type="button" onClick={readCurrentImage} disabled={!imageUrl || isReading}>
          <RefreshCw size={16} aria-hidden="true" />
          {isReading ? "Reading" : "Read image"}
        </button>
        <button type="button" onClick={clearBoard}>
          <RotateCcw size={16} aria-hidden="true" />
          Clear board
        </button>
      </div>

      <div className={styles.screenshotOptions}>
        <label>
          Board orientation
          <select value={orientation} onChange={(event) => setOrientation(event.target.value as ScreenshotBoardOrientation)}>
            <option value="white">White at bottom</option>
            <option value="black">Black at bottom</option>
          </select>
        </label>
        <label>
          Side to move
          <select value={turn} onChange={(event) => setTurn(event.target.value as "w" | "b")}>
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
        <label>
          Castling
          <select value={castling} onChange={(event) => setCastling(event.target.value)}>
            {castlingOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Move number
          <input type="number" min="1" max="300" value={fullmoveNumber} onChange={(event) => setFullmoveNumber(Number(event.target.value))} />
        </label>
      </div>

      <div className={styles.detectedBoard} aria-label="Editable screenshot position board">
        {visualBoard.map((piece, index) => {
          const square = recognitionSquares[index];
          return (
            <button
              key={index}
              type="button"
              data-testid={`screenshot-square-${index}`}
              className={clsx(
                styles.detectedSquare,
                (Math.floor(index / 8) + index) % 2 === 0 ? styles.detectedSquareLight : styles.detectedSquareDark,
                square?.piece && square.confidence < 0.22 && styles.lowConfidenceSquare
              )}
              aria-label={`${visualSquareLabel(index)}: ${piece ? screenshotPieceLabels[piece] : "Empty"}`}
              title={piece ? `${screenshotPieceLabels[piece]} (${Math.round((square?.confidence ?? 1) * 100)}%)` : "Empty"}
              onClick={() => updateVisualPiece(index)}
            >
              {piece ? screenshotPieceGlyphs[piece] : ""}
            </button>
          );
        })}
      </div>

      <div className={styles.screenshotStatus} aria-live="polite">
        <span>{status}</span>
        <span>{recognizedCount > 0 ? `${recognizedCount} pieces, ${Math.round(confidence * 100)}% confidence` : "No pieces selected"}</span>
      </div>

      <output className={styles.screenshotFen} aria-label="Screenshot FEN">
        {screenshotFen}
      </output>

      {!fenValidation.ok ? <p className={styles.screenshotWarning}>{fenValidation.error}</p> : null}
    </div>
  );
}
