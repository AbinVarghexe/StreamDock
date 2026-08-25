/**
 * download-candidate-selection.js
 * Formats yt-dlp arguments and format selection strings optimized for Adobe Premiere Pro.
 */

/**
 * Builds format string and yt-dlp arguments ensuring Adobe Premiere Pro compatible H.264/AAC codecs.
 * @param {string} url
 * @param {object} options
 *   - formatType: 'video' | 'audio'
 *   - quality: 'best' | '2160' | '1440' | '1080' | '720' | '480' | '360'
 *   - audioFormat: 'mp3' | 'wav' | 'aac' | 'm4a'
 *   - destinationDir: string
 *   - cookiesFromBrowser: string
 */
function buildYtDlpDownloadArgs(url, options = {}) {
  const formatType = options.formatType || 'video';
  const quality = options.quality || 'best';
  const audioFormat = options.audioFormat || 'mp3';
  const destinationDir = options.destinationDir || '.';
  const cookiesFromBrowser = options.cookiesFromBrowser || '';

  const args = [
    '--no-playlist',
    '--no-warnings',
    '--progress',
    '--newline',
    // Multi-client fallback
    '--extractor-args', 'youtube:player_client=mweb,web_embedded,tv,android_vr,ios,android'
  ];

  if (cookiesFromBrowser) {
    args.push('--cookies-from-browser', cookiesFromBrowser);
  }

  // Output filename template (e.g. %(title)s [%(id)s].%(ext)s)
  const outputTemplate = `${destinationDir.replace(/[\\/]$/, '')}/%(title)s [%(id)s].%(ext)s`;
  args.push('-o', outputTemplate);

  if (formatType === 'audio') {
    // Audio extraction mode
    args.push('-x');
    args.push('--audio-format', audioFormat);
    args.push('--audio-quality', '0');
    args.push('-f', 'bestaudio[acodec^=mp4a]/bestaudio/best');
  } else {
    // Video mode: Prioritize H.264 (avc1/h264) + AAC (mp4a) for Premiere Pro native compatibility (avoids av01/vp9 error)
    if (quality === 'best') {
      args.push(
        '-f',
        'bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*[vcodec^=avc]+ba/bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b'
      );
    } else {
      const height = parseInt(quality, 10);
      if (!isNaN(height)) {
        args.push(
          '-f',
          `bv*[height<=${height}][vcodec^=avc1]+ba[acodec^=mp4a]/bv*[height<=${height}][vcodec^=avc]+ba/bv*[height<=${height}][ext=mp4]+ba[ext=m4a]/bv*[height<=${height}]+ba/b[height<=${height}]/b`
        );
      } else {
        args.push('-f', 'bv*[vcodec^=avc]+ba/bv*+ba/b');
      }
    }

    // Ensure output format is MP4 and recode non-compatible streams to H.264 automatically
    args.push('--merge-output-format', 'mp4');
    args.push('--recode-video', 'mp4');
    args.push('--postprocessor-args', 'VideoConvertor:-c:v libx264 -pix_fmt yuv420p -c:a aac');
  }

  // Add URL at the end
  args.push(url);

  return args;
}

module.exports = {
  buildYtDlpDownloadArgs
};
