/**
 * Given an `ImageData` object and a `y` coordinate, scans the row of the image for transparency.
 * Returns `true` if row is totally transparent.
 */
 function checkRowIsTotallyTransparent(imageData: ImageData, yPos = 0) {
  let alpha;
  let index;
  for (let x = 0; x < imageData.width; x++) {
    index = (yPos * imageData.width + x) * 4;
    alpha = imageData.data[index + 3] || 0;
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
    alpha = imageData.data[index + 3] || 0;
    if (alpha > 0) {
      return false;
    }
  }
  return true;
}

export type TrimInfo = {
  x: number;
  y: number;
  originalWidth: number;
  originalHeight: number;
  trimmedWidth: number;
  trimmedHeight: number;
};

/**
 * Given an `ImageData` object, will trim any edge transparency, returning a cropped ImageData and framing info.
 */
export function trimImageEdges(
  imageData: ImageData | null,
  initialTrim?: { x: number; y: number; width: number; height: number },
): null | TrimInfo {
  if (imageData === null || imageData?.data?.length === 0) {
    return null;
  }

  const frame = initialTrim
    ? {
        x: initialTrim.x,
        y: initialTrim.y,
        originalWidth: initialTrim.width,
        originalHeight: initialTrim.height,
        trimmedWidth: initialTrim.width,
        trimmedHeight: initialTrim.height,
      }
    : {
        x: 0,
        y: 0,
        originalWidth: imageData.width,
        originalHeight: imageData.height,
        trimmedWidth: imageData.width,
        trimmedHeight: imageData.height,
      };

  const minX = frame.x;
  const maxX = minX + frame.originalWidth;

  const minY = frame.y;
  const maxY = minY + frame.originalHeight;

  // We'll use these `cursors` to track where we are looking in the image.
  let yCursor: number;
  let xCursor: number;

  // TOP TRIM-----
  // Find the pixel row closest to the TOP which is NOT transparent
  for (yCursor = minY; yCursor < maxY; yCursor++) {
    if (!checkRowIsTotallyTransparent(imageData, yCursor)) {
      break;
    }
  }
  // Adjust framing based on where the image should be trimmed on top
  frame.y = yCursor - minY;
  frame.trimmedHeight -= yCursor - minY;

  // BOTTOM TRIM-----
  // Find the pixel row closest to the BOTTOM which is NOT transparent
  for (yCursor = maxY - 1; yCursor >= minY; yCursor--) {
    if (!checkRowIsTotallyTransparent(imageData, yCursor)) {
      break;
    }
  }
  // Adjust framing based on where the image should be trimmed on bottom
  // (Note we don't adjust the `y` because the image data is 'anchored' at (0,0))
  // (We also take 1px off because `height` starts at 0, not 1.)
  frame.trimmedHeight -= maxY - 1 - yCursor;

  // LEFT TRIM-----
  // Find the pixel row closest to the LEFT BORDER which is NOT transparent
  for (xCursor = minX; xCursor < maxX; xCursor++) {
    if (!checkColumnIsTotallyTransparent(imageData, xCursor)) {
      break;
    }
  }
  // Adjust framing based on where the image should be trimmed on the left
  frame.x = xCursor - minX;
  frame.trimmedWidth -= xCursor - minX;

  // RIGHT TRIM-----
  // Find the pixel row closest to the RIGHT BORDER which is NOT transparent
  for (xCursor = maxX - 1; xCursor >= minX; xCursor--) {
    if (!checkColumnIsTotallyTransparent(imageData, xCursor)) {
      break;
    }
  }
  // Adjust framing based on where the image should be trimmed on the right
  // (Note we don't adjust the `x` because the image data is 'anchored' at (0,0))
  // (We also take 1px off because `width` starts at 0, not 1.)
  frame.trimmedWidth -= maxX - 1 - xCursor;

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
