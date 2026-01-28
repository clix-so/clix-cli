/**
 * Utility for converting images to ASCII art for terminal display.
 */
import asciify from 'asciify-image';

export interface AsciiImageOptions {
  /** Width in characters (default: 20) */
  width?: number;
  /** Height in characters (default: auto based on aspect ratio) */
  height?: number;
  /** Use color in output (default: true) */
  color?: boolean;
  /** Fit mode: 'box' maintains aspect ratio, 'width'/'height' fits to that dimension */
  fit?: 'box' | 'width' | 'height' | 'original' | 'none';
}

const DEFAULT_OPTIONS: AsciiImageOptions = {
  width: 16,
  color: true,
  fit: 'box',
};

/**
 * Convert an image URL to ASCII art string.
 *
 * @param imageUrl - URL of the image to convert
 * @param options - Conversion options
 * @returns ASCII art string or null if conversion fails
 */
export async function imageToAscii(
  imageUrl: string,
  options: AsciiImageOptions = {},
): Promise<string | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const ascii = await asciify(imageUrl, {
      fit: opts.fit,
      width: opts.width,
      height: opts.height,
      color: opts.color,
      format: 'string',
    });
    return ascii as string;
  } catch {
    // Silently fail - image conversion is optional
    return null;
  }
}
