/**
 * Determines a contrasting text color (black or white) based on a background hex color
 * to ensure good readability and accessibility.
 *
 * @param {string} bgColor - The background color in hex format (e.g., "#ffffff" or "#000").
 * @returns {string} The appropriate text color hex code: "#000000" or "#ffffff"
 */
export function getContrastingTextColor(bgColor: string): string {
  // Remove hash if present
  let hex = bgColor.replace('#', '');

  // Expand shorthand form (e.g. "03F") to full form ("0033FF")
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  if (hex.length !== 6) {
    throw new Error(`Invalid hex color: ${bgColor}`);
  }

  // Convert hex to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate luminance per WCAG formula
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

  // Use black text if background is light, white text if dark
  return luminance > 186 ? '#000000' : '#ffffff';
}

export function sanitizePdfText(input: string) {
  return input
    .normalize('NFKC') // Normalize Unicode characters to standard forms
    .replace(/\u200B/g, '') // Remove zero-width space
    .replace(/\u00A0/g, ' ') // Replace non-breaking space with normal space
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // Normalize single quotes
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // Normalize double quotes
    .replace(/[\u2013\u2014\u2015]/g, '-') // Normalize dashes
    .replace(/[^\x20-\x7E]/g, '') // Remove all non-ASCII characters
    .replace(/\s+/g, ' ') // Collapse multiple whitespace to a single space
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width spaces & BOM
    .replace(/[^a-zA-Z0-9\s.,:;!?()'"%$@\-]/g, '') // Remove weird punctuation/symbols
    .trim(); // Remove leading/trailing spaces
}

export function ensureHttps(url: string) {
  if (!url) return '';

  // Trim spaces
  const trimmed = url.trim();

  // If already has http/https, return as is
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Otherwise prepend https://
  return `https://${trimmed}`;
}

export function extractS3KeyFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    // Remove leading slash
    return parsedUrl.pathname.startsWith('/')
      ? parsedUrl.pathname.slice(1)
      : parsedUrl.pathname;
  } catch {
    throw new Error(`Invalid S3 URL: ${url}`);
  }
}

export const stripFormatting = (input: string): string => {
  if (!input) return '';

  // 1. Remove HTML tags
  let text = input.replace(/<\/?[^>]+(>|$)/g, '');

  // 2. Remove Markdown syntax
  text = text
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // italic
    .replace(/~~(.*?)~~/g, '$1') // strikethrough
    .replace(/`{1,2}[^`](.*?)`{1,2}/g, '$1') // inline code
    .replace(/^>\s?/gm, '') // blockquotes
    .replace(/!\[.*?\]\(.*?\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // links
    .replace(/#+\s?(.*)/g, '$1') // headers
    .replace(/[-*+]\s+/g, '') // unordered lists
    .replace(/\d+\.\s+/g, '') // ordered lists
    .replace(/\\(.)/g, '$1'); // escaped characters

  return text.trim();
};

/**
 * Convert a 6-digit hex color to an rgba() string with the given opacity.
 *
 * @param {string} hex - The hex color code (e.g. "#f1f2f3").
 * @param {number} opacity - The opacity value between 0 (fully transparent) and 1 (fully opaque).
 * @returns {string} The rgba() representation of the color (e.g. "rgba(241, 242, 243, 0.1)").
 *
 * @example
 * hexToRgba("#f1f2f3", 0.1); // "rgba(241, 242, 243, 0.1)"
 * hexToRgba("#000000", 0.5); // "rgba(0, 0, 0, 0.5)"
 * hexToRgba("#ff0000", 1);   // "rgba(255, 0, 0, 1)"
 */
export function hexToRgba(hex: string, opacity: number): string {
  // Remove '#' if present
  hex = hex.replace('#', '');

  // Parse R, G, B
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
