import type { CapturedImage } from './image';

// Hand-off for the captured meal photo between the nutrition screen and the
// result screen. We pass it via a module-level holder rather than navigation
// params because the image URI can be a large data: URL on web, which would blow
// past the browser's URL-length limit and break navigation.
let pendingImage: CapturedImage | null = null;

export function setPendingMealImage(img: CapturedImage | null): void {
  pendingImage = img;
}

/** Read and clear the pending meal image (set just before navigating to result). */
export function takePendingMealImage(): CapturedImage | null {
  const img = pendingImage;
  pendingImage = null;
  return img;
}
