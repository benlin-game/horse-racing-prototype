// Generate 6 individual horse animation frames, then stitch into sprite sheet
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const zlib  = require('zlib');

const KEY   = process.env.GAPI_KEY || 'AIzaSyC7umcmAdwscOCeBw8xeytqyABW_FJ9YiQ';
const MODEL = 'imagen-4.0-generate-001';
const DIR   = __dirname;

const BASE =
  'white thoroughbred racehorse with jockey on top, ' +
  'jockey wearing bright red silk racing uniform and white helmet, ' +
  'NO wings NO horn NO fantasy elements, realistic horse anatomy, ' +
  'detailed 2D illustration, side view facing RIGHT, ' +
  'pure solid bright cyan background #00FFFF, flat chroma key color, no gradients, ' +
  'sharp clean outlines, game character asset, full body visible, ' +
  'same consistent art style as a professional mobile game, white horse with gray shading, ';

const POSES = [
  'contact phase: right front hoof touching ground, left rear hoof touching ground, body low',
  'loading phase: weight shifted forward, both front hooves on ground, rear legs lifting',
  'takeoff phase: pushing off with rear legs, front hooves lifting, body rising',
  'first flight phase: all four hooves off ground, legs tucked under body',
  'extension phase: all four legs extended outward, peak of leap, maximum stretch',
  'landing phase: front right hoof about to land, rear legs stretched back',
];

function apiCall(prompt, outFile){
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1 }
    });
    const opts = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${MODEL}:predict?key=${KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if(json.predictions){
            const img = Buffer.from(json.predictions[0].bytesBase64Encoded, 'base64');
            fs.writeFileSync(outFile, img);
            console.log(`  saved ${path.basename(outFile)} (${img.length} bytes)`);
            resolve(outFile);
          } else {
            console.log('  API error:', JSON.stringify(json).slice(0,200));
            reject(new Error('API error'));
          }
        } catch(e){ reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── PNG utils ──────────────────────────────────────────────────────────────
function u32(b,o){return((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0;}
function w32(b,v,o){b[o]=v>>>24;b[o+1]=(v>>>16)&255;b[o+2]=(v>>>8)&255;b[o+3]=v&255;}
const CRC_T=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?0xEDB88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(buf){let c=0xFFFFFFFF;for(const b of buf)c=(c>>>8)^CRC_T[(c^b)&255];return(c^0xFFFFFFFF)>>>0;}
function pngChunk(type,data){const t=Buffer.from(type,'ascii'),d=Buffer.from(data),buf=Buffer.alloc(12+d.length);w32(buf,d.length,0);t.copy(buf,4);d.copy(buf,8);w32(buf,crc32(Buffer.concat([t,d])),8+d.length);return buf;}

function decodePNG(file){
  const src=fs.readFileSync(file);
  let pos=8,W,H,ctype,idats=[];
  while(pos<src.length-8){
    const len=u32(src,pos),type=src.slice(pos+4,pos+8).toString('ascii'),data=src.slice(pos+8,pos+8+len);
    if(type==='IHDR'){W=u32(data,0);H=u32(data,4);ctype=data[9];}
    else if(type==='IDAT')idats.push(data);
    pos+=12+len;
  }
  const bpp=ctype===6?4:ctype===2?3:1;
  const raw=zlib.inflateSync(Buffer.concat(idats));
  const stride=W*bpp,pixels=Buffer.alloc(H*stride);
  let ri=0,oi=0;
  for(let y=0;y<H;y++){
    const ft=raw[ri++],row=raw.slice(ri,ri+stride);ri+=stride;
    const prev=y>0?pixels.slice(oi-stride,oi):Buffer.alloc(stride);
    for(let x=0;x<stride;x++){
      const a=x>=bpp?pixels[oi+x-bpp]:0,b=prev[x],c=x>=bpp?prev[x-bpp]:0;
      let v=row[x];
      if(ft===1)v=(v+a)&255;else if(ft===2)v=(v+b)&255;
      else if(ft===3)v=(v+Math.floor((a+b)/2))&255;
      else if(ft===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v=(v+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255;}
      pixels[oi+x]=v;
    }
    oi+=stride;
  }
  const rgba=Buffer.alloc(W*H*4);
  for(let i=0;i<W*H;i++){
    if(ctype===6){pixels.copy(rgba,i*4,i*4,i*4+4);}
    else if(ctype===2){rgba[i*4]=pixels[i*3];rgba[i*4+1]=pixels[i*3+1];rgba[i*4+2]=pixels[i*3+2];rgba[i*4+3]=255;}
    else{rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=pixels[i];rgba[i*4+3]=255;}
  }
  return {W,H,rgba};
}

function removeCyan(rgba, W, H){
  const out = Buffer.from(rgba);
  for(let i=0;i<W*H;i++){
    const r=out[i*4],g=out[i*4+1],b=out[i*4+2];
    // cyan: b and g both high, r low
    const cyanness = Math.min(g,b) - r;
    if(cyanness > 40 && Math.min(g,b) > 100) out[i*4+3]=0;
  }
  return out;
}

function encodePNG(W,H,rgba){
  const rowData=Buffer.alloc(H*(1+W*4));
  for(let y=0;y<H;y++){rowData[y*(1+W*4)]=0;rgba.copy(rowData,y*(1+W*4)+1,y*W*4,(y+1)*W*4);}
  const comp=zlib.deflateSync(rowData);
  const ihdr=Buffer.alloc(13);w32(ihdr,W,0);w32(ihdr,H,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',comp),pngChunk('IEND',Buffer.alloc(0))]);
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main(){
  const frameFiles = [];
  for(let i=0;i<POSES.length;i++){
    console.log(`[${i+1}/6] ${POSES[i].slice(0,50)}...`);
    const file = path.join(DIR, `frame_${i}.png`);
    await apiCall(BASE + POSES[i], file);
    frameFiles.push(file);
    // small delay to avoid rate limit
    if(i < POSES.length-1) await new Promise(r=>setTimeout(r,1000));
  }

  console.log('\nProcessing frames...');
  const frames = frameFiles.map(f => {
    const {W,H,rgba} = decodePNG(f);
    const clean = removeCyan(rgba, W, H);
    return {W, H, rgba: clean};
  });

  // All frames should be 1024x1024 — crop to square centered content
  const fW = frames[0].W, fH = frames[0].H;
  const outW = fW * 6, outH = fH;
  const out = Buffer.alloc(outW * outH * 4, 0);

  frames.forEach(({W,H,rgba},i) => {
    for(let y=0;y<H;y++){
      for(let x=0;x<W;x++){
        const si=(y*W+x)*4;
        const di=(y*outW+i*fW+x)*4;
        rgba.copy(out,di,si,si+4);
      }
    }
  });

  const dst = path.join(DIR, 'horse_1x6.png');
  fs.writeFileSync(dst, encodePNG(outW, outH, out));
  console.log(`\nDone: sprite sheet ${outW}x${outH} → ${dst}`);
  console.log('CSS: background-size needs to be updated to match frame dimensions!');
  console.log(`Each frame: ${fW}x${fH}px`);
}

main().catch(console.error);
