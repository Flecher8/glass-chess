import { createEmptyScreenshotBoard, screenshotPieceGlyphs, type ScreenshotBoard, type ScreenshotPiece } from "./screenshot-position";

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type PieceTemplate = {
  piece: ScreenshotPiece;
  mask: Uint8Array;
  count: number;
};

export type ScreenshotBoardCrop = {
  x: number;
  y: number;
  size: number;
  score: number;
};

export type ScreenshotRecognitionSquare = {
  piece: ScreenshotPiece | null;
  confidence: number;
  occupied: boolean;
};

export type ScreenshotRecognitionResult = {
  visualBoard: ScreenshotBoard;
  squares: ScreenshotRecognitionSquare[];
  crop: ScreenshotBoardCrop;
  confidence: number;
  occupiedSquares: number;
};

const TEMPLATE_SIZE = 64;
const whitePieces: ScreenshotPiece[] = ["P", "N", "B", "R", "Q", "K"];
const blackPieces: ScreenshotPiece[] = ["p", "n", "b", "r", "q", "k"];

let templateCache: PieceTemplate[] | null = null;

export function recognizeScreenshotImage(image: HTMLImageElement): ScreenshotRecognitionResult {
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  if (!width || !height) {
    throw new Error("Screenshot image is not loaded yet.");
  }

  const analysisScale = Math.min(1, 420 / Math.max(width, height));
  const analysisImage = drawImageToImageData(image, Math.max(1, Math.round(width * analysisScale)), Math.max(1, Math.round(height * analysisScale)));
  const crop = scaleCrop(findBoardCrop(analysisImage), 1 / analysisScale);
  const sourceImage = drawImageToImageData(image, width, height);

  return recognizeBoardFromCrop(sourceImage, crop);
}

function drawImageToImageData(image: HTMLImageElement, width: number, height: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas is not available in this browser.");
  }

  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function scaleCrop(crop: ScreenshotBoardCrop, scale: number): ScreenshotBoardCrop {
  return {
    x: crop.x * scale,
    y: crop.y * scale,
    size: crop.size * scale,
    score: crop.score
  };
}

function findBoardCrop(imageData: ImageData): ScreenshotBoardCrop {
  const minDimension = Math.min(imageData.width, imageData.height);
  let best: ScreenshotBoardCrop = scoreCandidate(imageData, {
    x: Math.max(0, (imageData.width - minDimension) / 2),
    y: Math.max(0, (imageData.height - minDimension) / 2),
    size: minDimension,
    score: 0
  });

  const maxSize = minDimension * 0.98;
  const minSize = Math.max(96, minDimension * 0.32);
  const sizeStep = Math.max(14, minDimension / 13);

  for (let size = maxSize; size >= minSize; size -= sizeStep) {
    const step = Math.max(8, size / 11);
    for (let y = 0; y <= imageData.height - size; y += step) {
      for (let x = 0; x <= imageData.width - size; x += step) {
        const candidate = scoreCandidate(imageData, { x, y, size, score: 0 });
        if (candidate.score > best.score) {
          best = candidate;
        }
      }
    }
  }

  return best;
}

function scoreCandidate(imageData: ImageData, crop: ScreenshotBoardCrop): ScreenshotBoardCrop {
  const paritySamples: [Rgb[], Rgb[]] = [[], []];
  const offsets = [
    [0.22, 0.22],
    [0.78, 0.22],
    [0.22, 0.78],
    [0.78, 0.78]
  ];
  const cellSize = crop.size / 8;

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const samples = offsets.map(([offsetX, offsetY]) =>
        readPixel(imageData, crop.x + (column + offsetX) * cellSize, crop.y + (row + offsetY) * cellSize)
      );
      paritySamples[(row + column) % 2].push(averageColor(samples));
    }
  }

  const firstMean = averageColor(paritySamples[0]);
  const secondMean = averageColor(paritySamples[1]);
  const contrast = clamp(colorDistance(firstMean, secondMean) / 150, 0, 1);
  const firstConsistency = colorConsistency(paritySamples[0], firstMean);
  const secondConsistency = colorConsistency(paritySamples[1], secondMean);
  const consistency = (firstConsistency + secondConsistency) / 2;
  const sizePreference = clamp(crop.size / Math.min(imageData.width, imageData.height), 0, 1) * 0.04;

  return {
    ...crop,
    score: contrast * 0.68 + consistency * 0.28 + sizePreference
  };
}

function colorConsistency(samples: Rgb[], mean: Rgb): number {
  if (samples.length === 0) {
    return 0;
  }

  const averageDistance = samples.reduce((total, sample) => total + colorDistance(sample, mean), 0) / samples.length;
  return clamp(1 - averageDistance / 90, 0, 1);
}

function recognizeBoardFromCrop(imageData: ImageData, crop: ScreenshotBoardCrop): ScreenshotRecognitionResult {
  const visualBoard = createEmptyScreenshotBoard();
  const squares: ScreenshotRecognitionSquare[] = [];
  const cellSize = crop.size / 8;

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const square = recognizeSquare(imageData, crop.x + column * cellSize, crop.y + row * cellSize, cellSize);
      const index = row * 8 + column;
      visualBoard[index] = square.piece;
      squares[index] = square;
    }
  }

  const occupiedSquares = squares.filter((square) => square.occupied).length;
  const confidentSquares = squares.filter((square) => square.piece).map((square) => square.confidence);
  const confidence =
    confidentSquares.length > 0 ? confidentSquares.reduce((total, value) => total + value, 0) / confidentSquares.length : Math.min(crop.score, 0.35);

  return {
    visualBoard,
    squares,
    crop,
    confidence: clamp(confidence, 0, 1),
    occupiedSquares
  };
}

function recognizeSquare(imageData: ImageData, x: number, y: number, size: number): ScreenshotRecognitionSquare {
  const baseColor = averageColor([
    readPixel(imageData, x + size * 0.18, y + size * 0.18),
    readPixel(imageData, x + size * 0.82, y + size * 0.18),
    readPixel(imageData, x + size * 0.18, y + size * 0.82),
    readPixel(imageData, x + size * 0.82, y + size * 0.82)
  ]);
  const mask = new Uint8Array(TEMPLATE_SIZE * TEMPLATE_SIZE);
  let activeCount = 0;
  let foregroundLuma = 0;

  for (let row = 0; row < TEMPLATE_SIZE; row += 1) {
    for (let column = 0; column < TEMPLATE_SIZE; column += 1) {
      const margin = TEMPLATE_SIZE * 0.08;
      if (row < margin || column < margin || row > TEMPLATE_SIZE - margin || column > TEMPLATE_SIZE - margin) {
        continue;
      }

      const pixel = readPixel(imageData, x + ((column + 0.5) / TEMPLATE_SIZE) * size, y + ((row + 0.5) / TEMPLATE_SIZE) * size);
      const distance = colorDistance(pixel, baseColor);
      if (distance < 36) {
        continue;
      }

      const index = row * TEMPLATE_SIZE + column;
      mask[index] = 1;
      activeCount += 1;
      foregroundLuma += luma(pixel);
    }
  }

  const occupiedRatio = activeCount / (TEMPLATE_SIZE * TEMPLATE_SIZE);
  if (occupiedRatio < 0.035) {
    return { piece: null, confidence: 1 - occupiedRatio / 0.035, occupied: false };
  }

  const averageForegroundLuma = foregroundLuma / Math.max(1, activeCount);
  const candidates = averageForegroundLuma >= 142 ? whitePieces : blackPieces;
  const best = bestTemplateMatch(mask, activeCount, candidates);

  return {
    piece: best.piece,
    confidence: best.score,
    occupied: true
  };
}

function bestTemplateMatch(mask: Uint8Array, activeCount: number, candidates: ScreenshotPiece[]): { piece: ScreenshotPiece; score: number } {
  const templates = getPieceTemplates().filter((template) => candidates.includes(template.piece));
  let best = { piece: candidates[0], score: 0 };

  templates.forEach((template) => {
    let intersection = 0;
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index] && template.mask[index]) {
        intersection += 1;
      }
    }

    const score = (2 * intersection) / Math.max(1, activeCount + template.count);
    if (score > best.score) {
      best = { piece: template.piece, score };
    }
  });

  return best;
}

function getPieceTemplates(): PieceTemplate[] {
  if (templateCache) {
    return templateCache;
  }

  templateCache = [...whitePieces, ...blackPieces].map((piece) => createPieceTemplate(piece));
  return templateCache;
}

function createPieceTemplate(piece: ScreenshotPiece): PieceTemplate {
  const canvas = document.createElement("canvas");
  canvas.width = TEMPLATE_SIZE;
  canvas.height = TEMPLATE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas is not available in this browser.");
  }

  context.clearRect(0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);
  context.fillStyle = "#000";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "52px 'Segoe UI Symbol', 'Noto Sans Symbols', 'Arial Unicode MS', serif";
  context.fillText(screenshotPieceGlyphs[piece], TEMPLATE_SIZE / 2, TEMPLATE_SIZE / 2 + 2);

  const data = context.getImageData(0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE).data;
  const mask = new Uint8Array(TEMPLATE_SIZE * TEMPLATE_SIZE);
  let count = 0;

  for (let index = 0; index < mask.length; index += 1) {
    if (data[index * 4 + 3] > 20) {
      mask[index] = 1;
      count += 1;
    }
  }

  return { piece, mask, count };
}

function readPixel(imageData: ImageData, x: number, y: number): Rgb {
  const safeX = clamp(Math.round(x), 0, imageData.width - 1);
  const safeY = clamp(Math.round(y), 0, imageData.height - 1);
  const index = (safeY * imageData.width + safeX) * 4;

  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2]
  };
}

function averageColor(samples: Rgb[]): Rgb {
  const totals = samples.reduce(
    (sum, sample) => ({
      r: sum.r + sample.r,
      g: sum.g + sample.g,
      b: sum.b + sample.b
    }),
    { r: 0, g: 0, b: 0 }
  );
  const count = Math.max(1, samples.length);

  return {
    r: totals.r / count,
    g: totals.g / count,
    b: totals.b / count
  };
}

function colorDistance(first: Rgb, second: Rgb): number {
  return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
}

function luma(color: Rgb): number {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
