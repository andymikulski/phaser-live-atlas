/**
 * Given an `ImageData` object and a `y` coordinate, scans the row of the image for transparency.
 * Returns `true` if row is totally transparent.
 */
 function checkRowIsTotallyTransparent(imageData: ImageData, yPos = 0) {
  let alpha;
  let index;
  for (let x = 0; x < imageData.width; x++) {
    index = (yPos * imageData.width + x) * 4;
    alpha = imageData.data[index + 3];
    // TODO: @ENG-4257 Clean these up! See the linear task for more context and advice for cleaning up.
    if (alpha > 0) {
      return false;
    }
  }
  return true;
}
/**
 * Given an `ImageData` object and a `x` coordinate, scans the column of the image for transparency.
 * Returns `true` if column is totally transparent.
 */
function checkColumnIsTotallyTransparent(imageData: ImageData, xPos = 0) {
  let alpha, index;
  for (let y = 0; y < imageData.height; y++) {
    index = (y * imageData.width + xPos) * 4;
    alpha = imageData.data[index + 3];
    // TODO: @ENG-4257 Clean these up! See the linear task for more context and advice for cleaning up.
    if (alpha > 0) {
      return false;
    }
  }
  return true;
}

/**
 * Creates a new `ImageData` consisting of a single transparent pixel.
 */
function getTransparentPixel() {
  const imageData = new ImageData(1, 1);
  imageData.data.set([0, 0, 0, 0]);
  return imageData;
}

/**
 * Given an `ImageData` object, will trim any edge transparency, returning a cropped ImageData and framing info.
 */
export function trimImageEdges(
  imageData: ImageData | null,
  initialTrim?: { x: number; y: number; width: number; height: number },
): null | {
  x: number;
  y: number;
  originalWidth: number;
  originalHeight: number;
  trimmedWidth: number;
  trimmedHeight: number;
} {
  if (imageData === null || imageData?.data?.length === 0) {
    return null;
  }

  const frame = {
    x: initialTrim?.x || 0,
    y: initialTrim?.y || 0,
    originalWidth: initialTrim?.width || imageData.width,
    originalHeight: initialTrim?.height || imageData.height,
    trimmedWidth: initialTrim?.width || imageData.width,
    trimmedHeight: initialTrim?.height || imageData.height,
  };

  const maxLeft = initialTrim ? initialTrim.width + initialTrim.x : imageData.width;
  const maxBottom = initialTrim ? initialTrim.height + initialTrim.y : imageData.height;
  // const maxHeight = initialTrim?.height || imageData.height;

  // We'll use these `cursors` to track where we are looking in the image.
  let yCursor = frame.y;
  let xCursor = frame.x;

  // TOP TRIM-----
  // Find the pixel row closest to the TOP which is NOT transparent
  for (yCursor = 0; yCursor < maxBottom; yCursor++) {
    if (!checkRowIsTotallyTransparent(imageData, yCursor)) {
      break;
    }
  }
  // Adjust framing based on where the image should be trimmed on top
  frame.y += yCursor;
  frame.trimmedHeight -= yCursor;

  // BOTTOM TRIM-----
  // Find the pixel row closest to the BOTTOM which is NOT transparent
  for (yCursor = maxBottom - 1; yCursor >= 0; yCursor--) {
    if (!checkRowIsTotallyTransparent(imageData, yCursor)) {
      break;
    }
  }
  // Adjust framing based on where the image should be trimmed on bottom
  // (Note we don't adjust the `y` because the image data is 'anchored' at (0,0))
  // (We also take 1px off because `height` starts at 0, not 1.)
  frame.trimmedHeight -= maxBottom - 1 - yCursor;

  // LEFT TRIM-----
  // Find the pixel row closest to the LEFT BORDER which is NOT transparent
  for (xCursor = 0; xCursor < maxLeft; xCursor++) {
    if (!checkColumnIsTotallyTransparent(imageData, xCursor)) {
      break;
    }
  }
  // Adjust framing based on where the image should be trimmed on the left
  frame.x += xCursor;
  frame.trimmedWidth -= xCursor;

  // RIGHT TRIM-----
  // Find the pixel row closest to the RIGHT BORDER which is NOT transparent
  for (xCursor = maxLeft - 1; xCursor >= 0; xCursor--) {
    if (!checkColumnIsTotallyTransparent(imageData, xCursor)) {
      break;
    }
  }
  // Adjust framing based on where the image should be trimmed on the right
  // (Note we don't adjust the `x` because the image data is 'anchored' at (0,0))
  // (We also take 1px off because `width` starts at 0, not 1.)
  frame.trimmedWidth -= maxLeft - 1 - xCursor;

  // --- DONE CALCULATING TRIM! ---

  // If we trimmed this thing below 1x1 pixels, just return a transparent pixel instead.
  if (frame.trimmedHeight <= 0 || frame.trimmedWidth <= 0) {
    frame.trimmedWidth = frame.trimmedHeight = 0;
    return frame;
  }

  // If we're here, then we're good to crop the image using our calculated `frame`.
  return frame;
}

// RGBA stored in `Uint8ClampedArray`s require 4 bytes - we'll use this to offset pixel selection
// const BYTES_PER_PIXEL = 4;

// /**
//  * Given a source image and a framing for a crop, returns a new `ImageData` containing the same
//  * pixel data as the source in the given frame.
//  */
// function cropImageData(
//   sourceImage: ImageData,
//   xStart: number,
//   yStart: number,
//   cropWidth: number,
//   cropHeight: number
// ): ImageData {
//   // Data to be returned; contains the cropped image data.
//   const croppedImage = new ImageData(cropWidth, cropHeight);

//   // Step through each row
//   for (let y = 0; y < cropHeight; y++) {
//     // Copy this row's pixel data from (xStart, y) to (xStart + cropWidth, y)
//     const rowData = sourceImage.data.slice(
//       ((y + yStart) * sourceImage.width + xStart) * BYTES_PER_PIXEL,
//       ((y + yStart) * sourceImage.width + xStart) * BYTES_PER_PIXEL +
//         cropWidth * BYTES_PER_PIXEL
//     );
//     // Update the RGBA data in the cropped image with what we just grabbed
//     croppedImage.data.set(rowData, y * cropWidth * BYTES_PER_PIXEL);
//   }

//   return croppedImage;
// }
