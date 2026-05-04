// PNG background remover — no external dependencies
// Supports: white background (default) or green chroma key (--green flag)
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const SRC   = process.argv[2] || path.join(__dirname, 'horse_sprite.png');
const DST   = process.argv[3] || SRC.replace(/\.png$/i, '_nobg.png');
const MODE  = process.argv[4] || 'green'; // 'white' or 'green'

function u32(b, o){ return ((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0; }
function w32(b, v, o){ b[o]=v>>>24; b[o+1]=(v>>>16)&255; b[o+2]=(v>>>8)&255; b[o+3]=v&255; }

const CRC_TABLE = Array.from({length:256}, (_,i) => {
  let c = i; for(let j=0;j<8;j++) c=(c&1)?0xEDB88320^(c>>>1):c>>>1; return c>>>0;
});
function crc32(buf){ let c=0xFFFFFFFF; for(const b of buf){ c=((c>>>8)^CRC_TABLE[(c^b)&255]); } return (c^0xFFFFFFFF)>>>0; }

function chunk(type, data){
  const t=Buffer.from(type,'ascii'), d=Buffer.from(data);
  const buf=Buffer.alloc(12+d.length);
  w32(buf,d.length,0); t.copy(buf,4); d.copy(buf,8);
  w32(buf,crc32(Buffer.concat([t,d])),8+d.length);
  return buf;
}

const src = fs.readFileSync(SRC);
let pos=8, W, H, depth, ctype;
const idats = [];
while(pos < src.length-8){
  const len=u32(src,pos), type=src.slice(pos+4,pos+8).toString('ascii');
  const data=src.slice(pos+8,pos+8+len);
  if(type==='IHDR'){ W=u32(data,0); H=u32(data,4); depth=data[8]; ctype=data[9]; }
  else if(type==='IDAT') idats.push(data);
  pos+=12+len;
}
console.log(`Input: ${W}x${H} colorType=${ctype} mode=${MODE}`);

const raw = zlib.inflateSync(Buffer.concat(idats));
const bpp = ctype===2?3:ctype===6?4:ctype===0?1:ctype===4?2:3;

function unfilter(raw, W, H, bpp){
  const stride=W*bpp, out=Buffer.alloc(H*stride);
  let ri=0, oi=0;
  for(let y=0;y<H;y++){
    const ft=raw[ri++];
    const row=raw.slice(ri,ri+stride); ri+=stride;
    const prev=y>0?out.slice(oi-stride,oi):Buffer.alloc(stride);
    for(let x=0;x<stride;x++){
      const a=x>=bpp?out[oi+x-bpp]:0, b=prev[x], c=x>=bpp?prev[x-bpp]:0;
      let v=row[x];
      if(ft===1)      v=(v+a)&255;
      else if(ft===2) v=(v+b)&255;
      else if(ft===3) v=(v+Math.floor((a+b)/2))&255;
      else if(ft===4){ const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c); v=(v+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255; }
      out[oi+x]=v;
    }
    oi+=stride;
  }
  return out;
}

const pixels = unfilter(raw, W, H, bpp);
const rgba = Buffer.alloc(W*H*4);

for(let i=0;i<W*H;i++){
  let r,g,b,a=255;
  if(ctype===2){ r=pixels[i*3]; g=pixels[i*3+1]; b=pixels[i*3+2]; }
  else if(ctype===6){ r=pixels[i*4]; g=pixels[i*4+1]; b=pixels[i*4+2]; a=pixels[i*4+3]; }
  else { r=g=b=pixels[i]; }

  let isBg = false;
  if(MODE === 'cyan'){
    // cyan: both g and b high, r relatively low
    const cyanness = Math.min(g, b) - r;
    isBg = (cyanness > 30 && Math.min(g, b) > 90);
  } else if(MODE === 'green'){
    // green channel clearly dominates both r and b
    const gDom = g - Math.max(r, b);
    isBg = (gDom > 20 && g > 80);
  } else {
    // white background
    isBg = (r > 215 && g > 215 && b > 215);
  }
  if(isBg) a = 0;

  rgba[i*4]=r; rgba[i*4+1]=g; rgba[i*4+2]=b; rgba[i*4+3]=a;
}

// Re-encode as RGBA PNG
const rowData = Buffer.alloc(H*(1+W*4));
for(let y=0;y<H;y++){
  rowData[y*(1+W*4)]=0;
  rgba.copy(rowData, y*(1+W*4)+1, y*W*4, (y+1)*W*4);
}
const compressed = zlib.deflateSync(rowData);
const ihdr = Buffer.alloc(13);
w32(ihdr,W,0); w32(ihdr,H,4); ihdr[8]=8; ihdr[9]=6;

const out = Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR',ihdr), chunk('IDAT',compressed), chunk('IEND',Buffer.alloc(0))
]);
fs.writeFileSync(DST, out);
console.log(`Saved: ${DST} (${out.length} bytes)`);
