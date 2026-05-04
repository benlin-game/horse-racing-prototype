// 把 3×2 sprite sheet 轉成 1×6 單行
// 用法: node stitch_sprite.js [input] [output]
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const SRC = process.argv[2] || path.join(__dirname, 'horse_nobg.png');
const DST = process.argv[3] || path.join(__dirname, 'horse_1x6.png');

// ── PNG decode ──────────────────────────────────────────────
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
      if(ft===1)v=(v+a)&255;
      else if(ft===2)v=(v+b)&255;
      else if(ft===3)v=(v+Math.floor((a+b)/2))&255;
      else if(ft===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v=(v+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255;}
      pixels[oi+x]=v;
    }
    oi+=stride;
  }
  // 統一轉成 RGBA
  const rgba=Buffer.alloc(W*H*4);
  for(let i=0;i<W*H;i++){
    if(ctype===6){pixels.copy(rgba,i*4,i*4,i*4+4);}
    else if(ctype===2){rgba[i*4]=pixels[i*3];rgba[i*4+1]=pixels[i*3+1];rgba[i*4+2]=pixels[i*3+2];rgba[i*4+3]=255;}
    else{rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=pixels[i];rgba[i*4+3]=255;}
  }
  return {W,H,rgba};
}

function encodePNG(W,H,rgba){
  const rowData=Buffer.alloc(H*(1+W*4));
  for(let y=0;y<H;y++){rowData[y*(1+W*4)]=0;rgba.copy(rowData,y*(1+W*4)+1,y*W*4,(y+1)*W*4);}
  const comp=zlib.deflateSync(rowData);
  const ihdr=Buffer.alloc(13);w32(ihdr,W,0);w32(ihdr,H,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',comp),pngChunk('IEND',Buffer.alloc(0))]);
}

// ── Stitch ──────────────────────────────────────────────────
const {W,H,rgba}=decodePNG(SRC);
const cols=3,rows=2,fW=Math.floor(W/cols),fH=Math.floor(H/rows);
const outW=fW*6,outH=fH;
const out=Buffer.alloc(outW*outH*4,0);

let dstCol=0;
for(let row=0;row<rows;row++){
  for(let col=0;col<cols;col++){
    for(let y=0;y<fH;y++){
      for(let x=0;x<fW;x++){
        const si=((row*fH+y)*W+(col*fW+x))*4;
        const di=(y*outW+(dstCol*fW+x))*4;
        rgba.copy(out,di,si,si+4);
      }
    }
    dstCol++;
  }
}

fs.writeFileSync(DST,encodePNG(outW,outH,out));
console.log(`Done: ${outW}×${outH} → ${DST}`);
