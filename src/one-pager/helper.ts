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
