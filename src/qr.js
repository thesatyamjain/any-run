import QRCode from 'qrcode';

/**
 * Generates an ANSI half-block string for terminal display.
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function generateTerminalQR(url) {
  return new Promise((resolve, reject) => {
    QRCode.toString(url, { type: 'terminal', small: true }, (err, string) => {
      if (err) return reject(err);
      resolve(string);
    });
  });
}

/**
 * Generates a PNG Data URL for browser rendering.
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function generateDataUrlQR(url) {
  return new Promise((resolve, reject) => {
    QRCode.toDataURL(url, {
      margin: 1,
      width: 280,
      color: {
        dark: '#111317',
        light: '#f9fafb'
      }
    }, (err, dataUrl) => {
      if (err) return reject(err);
      resolve(dataUrl);
    });
  });
}

/**
 * Generates an SVG string.
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function generateSvgQR(url) {
  return new Promise((resolve, reject) => {
    QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      color: {
        dark: '#111317',
        light: '#ffffff'
      }
    }, (err, svg) => {
      if (err) return reject(err);
      resolve(svg);
    });
  });
}
