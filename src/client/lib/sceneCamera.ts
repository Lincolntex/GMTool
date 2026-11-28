export interface SceneCamera {
  scale: number;
  x: number;
  y: number;
}

export interface SceneViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ScenePoint {
  x: number;
  y: number;
}

export const MIN_SCENE_SCALE = 1;
export const MAX_SCENE_SCALE = 4;
export const SCENE_KEY_ZOOM_FACTOR = 1.15;
export const SCENE_WHEEL_SENSITIVITY = 0.0015;

export function createDefaultCamera(): SceneCamera {
  return { scale: MIN_SCENE_SCALE, x: 0, y: 0 };
}

export function clampSceneScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_SCENE_SCALE;
  return Math.min(MAX_SCENE_SCALE, Math.max(MIN_SCENE_SCALE, scale));
}

function clampPan(
  pan: number,
  frameSize: number,
  viewportSize: number,
  scale: number,
): number {
  if (!(frameSize > 0) || !(viewportSize > 0)) return 0;

  const scaledSize = frameSize * scale;
  if (scaledSize <= viewportSize) return 0;

  const limit = (scaledSize - viewportSize) / 2;
  return Math.min(limit, Math.max(-limit, pan));
}

export function clampSceneCamera(
  camera: SceneCamera,
  frameWidth: number,
  frameHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): SceneCamera {
  const scale = clampSceneScale(camera.scale);
  const x = clampPan(camera.x, frameWidth, viewportWidth, scale);
  const y = clampPan(camera.y, frameHeight, viewportHeight, scale);

  if (scale === camera.scale && x === camera.x && y === camera.y) {
    return camera;
  }

  return { scale, x, y };
}

export function zoomSceneCamera(
  camera: SceneCamera,
  targetScale: number,
  anchor: ScenePoint,
  viewport: SceneViewportRect,
  frameWidth: number,
  frameHeight: number,
): SceneCamera {
  const scale = clampSceneScale(targetScale);

  if (
    frameWidth <= 0 ||
    frameHeight <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return clampSceneCamera(
      { ...camera, scale },
      frameWidth,
      frameHeight,
      viewport.width,
      viewport.height,
    );
  }

  if (scale === camera.scale) return camera;

  const centerX = viewport.left + viewport.width / 2;
  const centerY = viewport.top + viewport.height / 2;
  const anchorX = (anchor.x - centerX - camera.x) / (frameWidth * camera.scale) + 0.5;
  const anchorY = (anchor.y - centerY - camera.y) / (frameHeight * camera.scale) + 0.5;

  return clampSceneCamera(
    {
      scale,
      x: anchor.x - centerX - (anchorX - 0.5) * frameWidth * scale,
      y: anchor.y - centerY - (anchorY - 0.5) * frameHeight * scale,
    },
    frameWidth,
    frameHeight,
    viewport.width,
    viewport.height,
  );
}

export function panSceneCamera(
  camera: SceneCamera,
  deltaX: number,
  deltaY: number,
  frameWidth: number,
  frameHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): SceneCamera {
  return clampSceneCamera(
    {
      scale: camera.scale,
      x: camera.x + deltaX,
      y: camera.y + deltaY,
    },
    frameWidth,
    frameHeight,
    viewportWidth,
    viewportHeight,
  );
}
