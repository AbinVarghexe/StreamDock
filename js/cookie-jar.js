/**
 * cookie-jar.js
 * Cookie extraction and browser profile handling for yt-dlp authentication.
 */

const SUPPORTED_BROWSERS = [
  { id: '', label: 'None (Default)' },
  { id: 'chrome', label: 'Google Chrome' },
  { id: 'edge', label: 'Microsoft Edge' },
  { id: 'firefox', label: 'Mozilla Firefox' },
  { id: 'brave', label: 'Brave Browser' },
  { id: 'opera', label: 'Opera' }
];

function getSupportedBrowsers() {
  return SUPPORTED_BROWSERS;
}

module.exports = {
  getSupportedBrowsers
};
