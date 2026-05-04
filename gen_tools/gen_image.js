const https = require('https');
const fs = require('fs');
const path = require('path');

const KEY   = process.env.GAPI_KEY   || 'AIzaSyC7umcmAdwscOCeBw8xeytqyABW_FJ9YiQ';
const MODEL = process.env.GAPI_MODEL || 'imagen-4.0-generate-001';
const OUT   = process.env.GAPI_OUT   || path.join(__dirname, 'horse_sprite.png');

const PROMPT =
  'horizontal sprite sheet, exactly 6 frames in one single row from left to right, ' +
  'no vertical stacking, all frames on the same horizontal line, ' +
  'white thoroughbred racehorse with jockey riding on top, ' +
  'jockey wearing vibrant red and gold silk racing uniform and helmet, ' +
  'detailed fantasy illustration style, flowing mane and tail, ' +
  'NO wings NO horn, realistic horse anatomy, ' +
  'gallop animation cycle 6 distinct poses: contact, loading, takeoff, flight, extension, landing, ' +
  'side view facing right, pure solid bright lime green background, chroma key green #00FF00, ' +
  'flat solid color background no gradients no shadows on background, ' +
  'sharp clean outlines, game asset style, 2D illustration, ' +
  'each frame same width, evenly spaced, clear separation between frames';

const body = JSON.stringify({
  instances: [{ prompt: PROMPT }],
  parameters: { sampleCount: 1 }
});

const options = {
  hostname: 'generativelanguage.googleapis.com',
  path: `/v1beta/models/${MODEL}:predict?key=${KEY}`,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
};

console.log('Generating horse sprite...');
const req = https.request(options, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.predictions) {
        const img = Buffer.from(json.predictions[0].bytesBase64Encoded, 'base64');
        fs.writeFileSync(OUT, img);
        console.log(`OK - saved ${OUT} (${img.length} bytes)`);
      } else {
        console.log('API ERROR:', JSON.stringify(json, null, 2));
      }
    } catch(e) {
      console.log('Parse error:', e.message);
      console.log('Raw:', data.slice(0, 500));
    }
  });
});
req.on('error', e => console.log('Request error:', e.message));
req.write(body);
req.end();
