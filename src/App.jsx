import React, { useEffect, useRef, useState } from "react";

/**
 * Color → Angle Hatching (SVG-first, SVG+DXF export)
 * - Nahraj SVG: appka vyčte fill barvy, každé nastavíš úhly (např. "0,45"), rozteč (mm) a tloušťku (mm)
 * - Výstup: jedno SVG v milimetrech (1:1) + DXF (LWPOLYLINE, INSUNITS=mm implicitně)
 * - Fallback: PNG/JPG (jednoduché chování – jedna vrstva)
 */

export default function App() {
  // soubory / režim
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState(null); // "svg" | "raster"
  const [svgText, setSvgText] = useState("");
  const [imgBitmap, setImgBitmap] = useState(null);

  // globální parametry
  const [docWidthMM, setDocWidthMM] = useState(200);
  const [samplesPerMM, setSamplesPerMM] = useState(1.4);
  const [mergeGapMM, setMergeGapMM] = useState(0.25);
  const [maxImageDim, setMaxImageDim] = useState(1800);

  // paleta (SVG)
  const [palette, setPalette] = useState([]); // [{id,color,enabled,anglesText,spacingMM,strokeMM,name}]
  const [autoAnglesStart, setAutoAnglesStart] = useState(0);
  const [autoAnglesStep, setAutoAnglesStep] = useState(45);

  // výstup
  const [svgOut, setSvgOut] = useState("");
  const [dxfOut, setDxfOut] = useState("");
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);

  function resetOut() { setSvgOut(""); setDxfOut(""); }

  // nahrání souboru
  function onFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); resetOut();
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (ext === "svg") {
      setKind("svg");
      const r = new FileReader();
      r.onload = () => { setSvgText(String(r.result||"")); setImgBitmap(null); };
      r.readAsText(f);
    } else {
      setKind("raster");
      const url = URL.createObjectURL(f);
      (async () => {
        const img = await createImageBitmap(await fetch(url).then(r=>r.blob()));
        // downscale kvůli rychlosti
        const scale = Math.min(1, maxImageDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.floor(img.width * scale));
        const h = Math.max(1, Math.floor(img.height * scale));
        const cvs = document.createElement("canvas");
        cvs.width = w; cvs.height = h;
        const ctx = cvs.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const bmp = await createImageBitmap(cvs);
        setImgBitmap(bmp);
      })();
    }
  }

  // pomocné funkce
  function getImageData(bmp) {
    const cvs = canvasRef.current;
    cvs.width = bmp.width; cvs.height = bmp.height;
    const ctx = cvs.getContext("2d");
    ctx.clearRect(0,0,cvs.width,cvs.height);
    ctx.drawImage(bmp,0,0);
    return ctx.getImageData(0,0,cvs.width,cvs.height);
  }
  function rotateXY(x,y,t){ const ct=Math.cos(t), st=Math.sin(t); return {u:x*ct+y*st, v:-x*st+y*ct}; }
  function irotateUV(u,v,t){ const ct=Math.cos(t), st=Math.sin(t); return {x:u*ct - v*st, y:u*st + v*ct}; }
  function maskSample(m, xMM, yMM, pxX, pxY, w, h){
    const x = Math.round(xMM * pxX), y = Math.round(yMM * pxY);
    if (x>=0 && x<w && y>=0 && y<h) return m[y*w + x] === 1;
    return false;
  }

  // extrakce fill barev ze SVG
  function extractFillColors(svg) {
    const set = new Set();
    const norm = (c)=>{
      c=String(c).trim().toLowerCase();
      if (!c.startsWith("#")) return "";
      if (c.length===4){ const r=c[1],g=c[2],b=c[3]; return `#${r}${r}${g}${g}${b}${b}`; }
      if (c.length>=7) return c.slice(0,7);
      return "";
    };
    const attr = Array.from(svg.matchAll(/fill\s*=\s*"(#[0-9a-fA-F]{3,6})"/g)).map(m=>norm(m[1])).filter(Boolean);
    attr.forEach(c=>set.add(c));
    const css = Array.from(svg.matchAll(/style\s*=\s*"[^"]*fill\s*:\s*(#[0-9a-fA-F]{3,6})/g)).map(m=>norm(m[1])).filter(Boolean);
    css.forEach(c=>set.add(c));
    return Array.from(set);
  }

  // vytvoří bitmapu, kde zůstane jen target barva (ostatní průhledné)
  function isolateColorToPNG(svg, targetHex, outW, outH) {
    const safe = targetHex.toLowerCase();
    const toFull = (c)=> c.length===4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`.toLowerCase() : c.slice(0,7).toLowerCase();
    const replaced = svg
      .replace(/fill\s*=\s*"(#[0-9a-fA-F]{3,6})"/g, (m,c)=> toFull(c)===safe? 'fill="#000000"' : 'fill="none"')
      .replace(/(fill\s*:\s*)(#[0-9a-fA-F]{3,6})/g, (m,pfx,c)=> toFull(c)===safe? `${pfx}#000000` : `${pfx}none`)
      .replace(/stroke\s*=\s*"(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)"/g, 'stroke="none"')
      .replace(/(stroke\s*:\s*)(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)/g, '$1none');
    const blob = new Blob([replaced], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    return fetch(url)
      .then(r=>r.blob())
      .then(createImageBitmap)
      .then(bmp=>{
        URL.revokeObjectURL(url);
        const cvs = document.createElement("canvas");
        cvs.width = outW; cvs.height = outH;
        const ctx = cvs.getContext("2d");
        ctx.clearRect(0,0,outW,outH);
        ctx.drawImage(bmp,0,0,outW,outH);
        return createImageBitmap(cvs);
      });
  }

  // hlavní hatching → polyline geometrie
  function hatchGeometry(img, cfgs, widthMM, samplesPMM, mergeGap) {
    const w = img.width, h = img.height;
    const heightMM = widthMM * (h / w);
    const pxX = w / widthMM, pxY = h / heightMM;
    const corners = [{x:0,y:0},{x:widthMM,y:0},{x:0,y:heightMM},{x:widthMM,y:heightMM}];
    const polylines = []; // {layer, strokeMM, points:[[x,y],...]}

    for (const layer of cfgs) {
      for (const angle of layer.angles) {
        const theta = (angle * Math.PI) / 180;
        const vs = corners.map(c => rotateXY(c.x,c.y,theta).v);
        const vmin = Math.min(...vs) - 1, vmax = Math.max(...vs) + 1;
        const us = corners.map(c => rotateXY(c.x,c.y,theta).u);
        const umin = Math.min(...us) - 1, umax = Math.max(...us) + 1;
        const stepU = 1 / Math.max(0.1, samplesPMM);

        for (let v=vmin; v<=vmax; v+=layer.spacingMM) {
          const segs = [];
          let on=false, seg=[];
          for (let u=umin; u<=umax; u+=stepU) {
            const pt = irotateUV(u,v,theta);
            if (pt.x>=0 && pt.x<=widthMM && pt.y>=0 && pt.y<=heightMM) {
              const inside = maskSample(layer.mask, pt.x, pt.y, pxX, pxY, w, h);
              if (inside) { if (!on){ seg=[[pt.x,pt.y]]; on=true; } else seg.push([pt.x,pt.y]); }
              else if (on) { if (seg.length>=2) segs.push(seg); seg=[]; on=false; }
            }
          }
          if (on && seg.length>=2) segs.push(seg);

          // slévání mezer
          const merged = [];
          if (segs.length) {
            let cur = segs[0];
            for (let i=1;i<segs.length;i++){
              const s=segs[i];
              const dx=s[0][0]-cur[cur.length-1][0], dy=s[0][1]-cur[cur.length-1][1];
              const gap=Math.hypot(dx,dy);
              if (gap<=mergeGap) cur=cur.concat(s); else { merged.push(cur); cur=s; }
            }
            merged.push(cur);
          }

          for (const s of merged) {
            if (s.length<2) continue;
            polylines.push({ layer: `${layer.name}_${angle}deg`, strokeMM: layer.strokeMM, points: s });
          }
        }
      }
    }
    return { widthMM, heightMM, polylines };
  }

  // export
  function geometryToSVG(geom) {
    const { widthMM, heightMM, polylines } = geom;
    const paths = polylines.map(pl=>{
      const d = "M " + pl.points.map(p=>`${p[0].toFixed(3)} ${p[1].toFixed(3)}`).join(" L ");
      return `<path d="${d}" stroke="black" stroke-width="${pl.strokeMM.toFixed(3)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    });
    return [`<svg xmlns="http://www.w3.org/2000/svg" width="${widthMM}mm" height="${heightMM}mm" viewBox="0 0 ${widthMM} ${heightMM}">`, ...paths, `</svg>`].join("\n");
  }
  function geometryToDXF(geom) {
    const { polylines } = geom;
    const lines = [];
    const push = (g,v)=>{ lines.push(String(g), String(v)); };
    // HEADER (INSUNITS=4 mm)
    push(0,"SECTION"); push(2,"HEADER"); push(9,"$INSUNITS"); push(70,4); push(0,"ENDSEC");
    // ENTITIES
    push(0,"SECTION"); push(2,"ENTITIES");
    for (const pl of polylines) {
      push(0,"LWPOLYLINE");
      push(8, pl.layer);
      push(90, pl.points.length);
      push(70, 0);
      const lw = Math.max(0, Math.min(211, Math.round(pl.strokeMM*100))); // 0.01mm units
      push(370, lw);
      for (const pt of pl.points){ push(10, pt[0]); push(20, pt[1]); }
    }
    push(0,"ENDSEC"); push(0,"EOF");
    return lines.join("\n");
  }

  // generování (SVG vstup)
  async function generateFromSVG() {
    setBusy(true);
    try {
      const active = palette.filter(p=>p.enabled);
      if (!active.length) { alert("Vyber aspoň jednu barvu v paletě."); return; }

      // raster rozměr z viewBoxu (jinak maxImageDim)
      const vb = svgText.match(/viewBox\s*=\s*"([\d.\-eE]+)\s+([\d.\-eE]+)\s+([\d.\-eE]+)\s+([\d.\-eE]+)"/);
      let outW = maxImageDim, outH = maxImageDim;
      if (vb) {
        const vbW = Math.max(1, parseFloat(vb[3]));
        const vbH = Math.max(1, parseFloat(vb[4]));
        if (vbW >= vbH){ outW=maxImageDim; outH = Math.round(maxImageDim * (vbH/vbW)); }
        else { outH=maxImageDim; outW = Math.round(maxImageDim * (vbW/vbH)); }
      }

      let baseImg = null;
      const cfgs = [];
      for (const layer of active) {
        const bmp = await isolateColorToPNG(svgText, layer.color, outW, outH);
        const img = getImageData(bmp);
        if (!baseImg) baseImg = img;
        const mask = new Uint8Array(img.width*img.height);
        for (let i=0;i<mask.length;i++){ const a=img.data[i*4+3]; if (a>10) mask[i]=1; }
        const angles = layer.anglesText.split(",").map(s=>parseFloat(s.trim())).filter(n=>!Number.isNaN(n)).map(a=>((a%180)+180)%180);
        cfgs.push({ mask, angles: angles.length?angles:[0], spacingMM: layer.spacingMM, strokeMM: layer.strokeMM, name: layer.name || "LAYER" });
      }
      if (!baseImg) { alert("Nepodařilo se rasterizovat SVG."); return; }

      const geom = hatchGeometry(baseImg, cfgs, docWidthMM, samplesPerMM, mergeGapMM);
      setSvgOut(geometryToSVG(geom));
      setDxfOut(geometryToDXF(geom));
    } finally { setBusy(false); }
  }

  // generování (raster fallback – jednoduché)
  async function generateFromRaster() {
    if (!imgBitmap) { alert("Nahraj PNG/JPG."); return; }
    setBusy(true);
    try{
      const img = getImageData(imgBitmap);
      // jedna „vrstva“ přes celé plátno, jednoduché úhly 0° (můžeš upravit na 0,45)
      const w=img.width,h=img.height;
      const widthMM=docWidthMM, heightMM=widthMM*(h/w);
      const mask = new Uint8Array(w*h).fill(1);
      const cfgs = [{ mask, angles:[0], spacingMM:0.9, strokeMM:0.28, name:"RASTER" }];
      const geom = hatchGeometry(img, cfgs, widthMM, samplesPerMM, mergeGapMM);
      setSvgOut(geometryToSVG(geom));
      setDxfOut(geometryToDXF(geom));
    } finally { setBusy(false); }
  }

  // inicializace palety po nahrání SVG
  useEffect(()=>{
    if (kind!=="svg" || !svgText) { setPalette([]); return; }
    const colors = extractFillColors(svgText);
    const layers = colors.map((c,i)=>({
      id: crypto.randomUUID(),
      color: c,
      enabled: true,
      anglesText: String((autoAnglesStart + i*autoAnglesStep)%180), // každý další o krok
      spacingMM: 0.9,
      strokeMM: 0.28,
      name: `L${i}`
    }));
    setPalette(layers);
  }, [svgText, kind, autoAnglesStart, autoAnglesStep]);

  function download(txt, name){
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 style={{marginBottom:12}}>Color → Angle Hatching (SVG-first)</h1>

      <div className="card row">
        <input type="file" accept=".svg,image/*" onChange={onFileChange} />
        <span className="label">Šířka výstupu</span>
        <input className="input" type="number" value={docWidthMM} onChange={e=>setDocWidthMM(Math.max(10, Number(e.target.value)||200))} />
        <span className="label">Vzorkování (/mm)</span>
        <input className="input" type="number" step="0.1" value={samplesPerMM} onChange={e=>setSamplesPerMM(Math.max(0.2, Number(e.target.value)||1.4))} />
        <span className="label">Slití mezer (mm)</span>
        <input className="input" type="number" step="0.05" value={mergeGapMM} onChange={e=>setMergeGapMM(Math.max(0, Number(e.target.value)||0.25))} />
        <span className="label">Max. raster (px)</span>
        <input className="input" type="number" value={maxImageDim} onChange={e=>setMaxImageDim(Math.max(256, Number(e.target.value)||1800))} />
      </div>

      {kind==="svg" && (
        <div className="card" style={{marginTop:12}}>
          <div className="row">
            <span className="label">Start úhel</span>
            <input className="input" type="number" value={autoAnglesStart} onChange={e=>setAutoAnglesStart((Number(e.target.value)||0)%180)} />
            <span className="label">Krok úhlu</span>
            <input className="input" type="number" value={autoAnglesStep} onChange={e=>setAutoAnglesStep(Math.max(1, Number(e.target.value)||45))} />
            <button className="btn" onClick={()=>setPalette(prev=>prev.map((p,i)=>({...p, anglesText: String((autoAnglesStart + i*autoAnglesStep)%180)})))}>Rozdat úhly</button>
          </div>

          {palette.length===0 && <div style={{opacity:.7, marginTop:8}}>Nahraj SVG s fill barvami – paleta se vygeneruje automaticky.</div>}

          {palette.map(l=>(
            <div key={l.id} className="row" style={{marginTop:8}}>
              <input type="checkbox" checked={l.enabled} onChange={e=>setPalette(prev=>prev.map(x=>x.id===l.id?{...x, enabled:e.target.checked}:x))}/>
              <div style={{width:24, height:24, borderRadius:6, border:"1px solid #e5e7eb", background:l.color}} />
              <span className="label" style={{minWidth:60}}>{l.color.toUpperCase()}</span>
              <span className="label">Úhly (např. 0,45)</span>
              <input className="input" style={{width:120}} value={l.anglesText} onChange={e=>setPalette(prev=>prev.map(x=>x.id===l.id?{...x, anglesText:e.target.value}:x))}/>
              <span className="label">Rozteč</span>
              <input className="input" type="number" step="0.05" value={l.spacingMM} onChange={e=>setPalette(prev=>prev.map(x=>x.id===l.id?{...x, spacingMM:Number(e.target.value)||0.9}:x))}/>
              <span className="label">Tloušťka</span>
              <input className="input" type="number" step="0.01" value={l.strokeMM} onChange={e=>setPalette(prev=>prev.map(x=>x.id===l.id?{...x, strokeMM:Number(e.target.value)||0.28}:x))}/>
              <span className="label">Vrstva</span>
              <input className="input" style={{width:100}} value={l.name} onChange={e=>setPalette(prev=>prev.map(x=>x.id===l.id?{...x, name:e.target.value}:x))}/>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{marginTop:12}}>
        {kind==="svg"
          ? <button className="btn primary" onClick={generateFromSVG} disabled={busy || !file}>{busy?"Generuji…":"Vygenerovat z SVG"}</button>
          : <button className="btn primary" onClick={generateFromRaster} disabled={busy || !imgBitmap}>{busy?"Generuji…":"Vygenerovat z PNG/JPG"}</button>
        }
        <button className="btn" onClick={()=>download(svgOut,"hatching.svg")} disabled={!svgOut}>Stáhnout SVG</button>
        <button className="btn" onClick={()=>download(dxfOut,"hatching.dxf")} disabled={!dxfOut}>Stáhnout DXF</button>
      </div>

      <div className="card" style={{marginTop:12}}>
        <div className="label" style={{marginBottom:8}}>Náhled</div>
        <div style={{border:"1px solid #e5e7eb", borderRadius:10, height:420, overflow:"auto", background:"#fff"}} dangerouslySetInnerHTML={{__html: svgOut || "<div style='padding:12px;opacity:.7'>Zatím nic – nahraj soubor a vygeneruj.</div>"}}/>
        <canvas ref={canvasRef} style={{display:"none"}}/>
      </div>
    </div>
  );
}
