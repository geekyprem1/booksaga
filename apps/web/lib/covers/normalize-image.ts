import sharp from 'sharp';
import { AppError } from '@booksaga/shared';
import { sniffImage } from './sniff';

/** Decode and re-encode untrusted raster uploads; discard metadata and trailing payloads. */
export async function normalizeImage(buffer: Buffer, maxDimension = 6000): Promise<Buffer> {
  if (!sniffImage(buffer)) throw new AppError('VALIDATION', 'Upload a PNG, JPEG or WebP image.');
  try {
    return await sharp(buffer, { limitInputPixels: 40_000_000, animated: false, failOn: 'warning' })
      .rotate()
      .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw new AppError('VALIDATION', 'The image is damaged or too large to process.');
  }
}
