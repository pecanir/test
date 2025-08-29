import React, { useEffect, useRef, useState } from "react";

export default function App() {
  const [imageURL, setImageURL] = useState(null);
  const [imgBitmap, setImgBitmap] = useState(null);
  const [svgString, setSvgString] = useState("");
  const [dxfString, setDxfString] = useState("");
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);

  function onFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setImageURL(url);
    setSvgString(""); setDxfString("");
  }

  useEffect(() => {
    if (!imageURL) return;
    (async () => {
      const img = await createImageBitmap(await fetch(imageURL).then(r => r.blob()));
      setImgBitmap(img);
    })();
  }, [imageURL]);

  function getImageData(bmp) {
    const cvs = canvasRef.current;
    cvs.width = bmp.width; cvs.height = bmp.height;
    const ctx = cvs.getContext('2d');
    ctx.drawImage(bmp,0,0);
    return ctx.getImageData(0,0,cvs.width,cvs.height);
  }

  function hatch(img) {
    const w=img.width,h=img.height;
    const widthMM=200, heightMM=widthMM*(h/w);
    const paths=[];
    for(let y=0;y<heightMM;y+=2){
      paths.push(`<path d=\"M 0 ${y.toFixed(2)} L ${widthMM.toFixed(2)} ${y.toFixed(2)}\" stroke=\"black\" stroke-width=\"0.2\"/>`);
    }
    for(let x=0;x<widthMM;x+=2){
      paths.push(`<path d=\"M ${x.toFixed(2)} 0 L ${x.toFixed(2)} ${heightMM.toFixed(2)}\" stroke=\"black\" stroke-width=\"0.2\"/>`);
    }
    const svg=[`<svg xmlns='http://www.w3.org/2000/svg' width='${widthMM}mm' height='${heightMM}mm' viewBox='0 0 ${widthMM} ${heightMM}'>`,...paths,"</svg>"];
    const dxf=["0","SECTION","2","ENTITIES"];
    for(const p of paths){
      const coords=p.match(/[-0-9\.]+/g).map(Number);
      dxf.push("0","LWPOLYLINE","8","0","90","2","70","0","10",coords[1],"20",coords[2],"10",coords[3],"20",coords[4]);
    }
    dxf.push("0","ENDSEC","0","EOF");
    return {svg:svg.join("\n"), dxf:dxf.join("\n")};
  }

  async function generate(){
    if(!imgBitmap) return;
    setBusy(true);
    try{
      const img=getImageData(imgBitmap);
      const {svg,dxf}=hatch(img);
      setSvgString(svg); setDxfString(dxf);
    }finally{setBusy(false);}
  }

  function download(txt,ext){
    const blob=new Blob([txt],{type:'text/plain'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`hatching.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{padding:'1rem'}}>
      <h1>Hatching App (Demo Crosshatch)</h1>
      <input type="file" accept="image/*" onChange={onFileChange} />
      <div style={{marginTop:'1rem'}}>
        <button onClick={generate} disabled={!imgBitmap||busy}>{busy?"Generuji…":"Generovat"}</button>
        <button onClick={()=>download(svgString,'svg')} disabled={!svgString}>Stáhnout SVG</button>
        <button onClick={()=>download(dxfString,'dxf')} disabled={!dxfString}>Stáhnout DXF</button>
      </div>
      <div style={{border:'1px solid #ccc',marginTop:'1rem',height:'400px',overflow:'auto'}} dangerouslySetInnerHTML={{__html:svgString}} />
      <canvas ref={canvasRef} style={{display:'none'}}/>
    </div>
  );
}
