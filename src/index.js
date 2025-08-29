<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hatching – single file</title>
    <style>
      body{font-family:system-ui,ui-sans-serif;margin:16px}
      .btn{padding:8px 12px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer}
      .btn.primary{background:#000;color:#fff;border-color:#000}
      .wrap{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
      #preview{border:1px solid #e5e7eb;margin-top:12px;height:420px;overflow:auto;background:#fff}
    </style>
  </head>
  <body>
    <h1>Hatching (jednoduchý náhled bez build systému)</h1>
    <div class="wrap">
      <input id="file" type="file" accept="image/*" />
      <button id="gen" class="btn primary" disabled>Generovat</button>
      <button id="dlSvg" class="btn" disabled>Stáhnout SVG</button>
      <button id="dlDxf" class="btn" disabled>Stáhnout DXF</button>
    </div>
    <div id="preview"></div>
    <canvas id="cvs" style="display:none"></canvas>

    <script type="module">
      const fileEl = document.getElementById('file');
      const genEl  = document.getElementById('gen');
      const dlSvg  = document.getElementById('dlSvg');
      const dlDxf  = document.getElementById('dlDxf');
      const prev   = document.getElementById('preview');
      const cvs    = document.getElementById('cvs');
      const ctx    = cvs.getContext('2d');

      let bmp = null, svgStr = '', dxfStr = '';

      fileEl.addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const url = URL.createObjectURL(f);
        bmp = await createImageBitmap(await fetch(url).then(r=>r.blob()));
        genEl.disabled = false;
      });

      function hatch(img) {
        const w = img.width, h = img.height;
        const widthMM = 200, heightMM = widthMM * (h / w);
        // jednoduchý cross-hatch: vodorovné + svislé linky po 2 mm
        const paths = [];
        for (let y = 0; y <= heightMM; y += 2) {
          paths.push(`<path d="M 0 ${y.toFixed(2)} L ${widthMM.toFixed(2)} ${y.toFixed(2)}" stroke="black" stroke-width="0.2"/>`);
        }
        for (let x = 0; x <= widthMM; x += 2) {
          paths.push(`<path d="M ${x.toFixed(2)} 0 L ${x.toFixed(2)} ${heightMM.toFixed(2)}" stroke="black" stroke-width="0.2"/>`);
        }
        const svg = [
          `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMM}mm" height="${heightMM}mm" viewBox="0 0 ${widthMM} ${heightMM}">`,
          ...paths,
          `</svg>`
        ].join('\n');

        // minimální DXF (ENTITIES: LWPOLYLINE)
        const dxf = ["0","SECTION","2","ENTITIES"];
        for (const p of paths) {
          const nums = p.match(/-?\d+\.?\d*/g).map(Number); // x1 y1 x2 y2
          const [x1,y1,x2,y2] = nums;
          dxf.push("0","LWPOLYLINE","8","0","90","2","70","0","10",x1,"20",y1,"10",x2,"20",y2);
        }
        dxf.push("0","ENDSEC","0","EOF");

        return { svg, dxf: dxf.join("\n") };
      }

      genEl.addEventListener('click', async () => {
        if (!bmp) return;
        cvs.width = bmp.width; cvs.height = bmp.height;
        ctx.drawImage(bmp, 0, 0);
        const img = ctx.getImageData(0,0,cvs.width,cvs.height);
        const { svg, dxf } = hatch(img);
        svgStr = svg; dxfStr = dxf;
        prev.innerHTML = svgStr;
        dlSvg.disabled = false; dlDxf.disabled = false;
      });

      function download(txt, name) {
        const blob = new Blob([txt], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
      }
      dlSvg.addEventListener('click', ()=> download(svgStr, 'hatching.svg'));
      dlDxf.addEventListener('click', ()=> download(dxfStr, 'hatching.dxf'));
    </script>
  </body>
</html>
