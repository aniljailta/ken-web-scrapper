/**
 * Determines a contrasting text color (black or white) based on a background hex color
 * to ensure good readability and accessibility.
 *
 * @param {string} bgColor - The background color in hex format (e.g., "#ffffff" or "#000").
 * @returns {string} The appropriate text color hex code: "#000000" or "#ffffff"
 */
export function getContrastingTextColor(bgColor: string) {
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
