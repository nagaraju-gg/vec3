const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const root = __dirname;
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const docs = [
  {
    slug: "vec3",
    title: "Vec3",
    file: path.join(root, "Vec3.docx"),
  },
  {
    slug: "vec3-mathematics",
    title: "Vec3 Mathematics",
    file: path.join(root, "Vec3 Mathematics.docx"),
  },
];

function decodeXml(text) {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function esc(text) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const pageStyle = `<style>
  :root{color-scheme:light dark}
  body{margin:0;padding:32px;font:16px/1.6 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171916;background:#fff}
  article{max-width:1000px;margin:0 auto}
  h1{margin:0 0 12px;font-size:28px;line-height:1.2}
  h2{margin:20px 0 8px;font-size:22px;line-height:1.3}
  h3,h4{margin:16px 0 6px;font-size:18px;line-height:1.4}
  p{margin:0 0 14px;line-height:1.6}
  ul,ol{margin:0 0 14px 24px;padding:0}
  li{margin:4px 0}
  table{border-collapse:collapse;margin:14px 0;width:100%}
  td,th{border:1px solid #daddd5;padding:6px 10px;text-align:left;vertical-align:top;font-size:14px}
  hr{margin:20px 0;border:0;border-top:1px solid #daddd5}
  code{padding:2px 5px;border-radius:5px;background:#eef2ed;font:0.9em ui-monospace,SFMono-Regular,Menlo,monospace}
  @media(prefers-color-scheme:dark){body{background:#151a16;color:#eef3ec}td,th{border-color:#303a34}hr{border-color:#303a34}code{background:#202821}}
</style>`;

function wrapPage(body) {
  return `<!doctype html><html><head><meta charset="utf-8">${pageStyle}</head><body><article>${body}</article></body></html>`;
}

function docxToHtmlDirect(file) {
  return new Promise((resolve) => {
    execFile("unzip", ["-p", file, "word/document.xml"], { maxBuffer: 20 * 1024 * 1024 }, (error, xml = "") => {
      if (error) return resolve("");
      let body = xml;
      body = body.replace(/<m:oMath[^>]*>([\s\S]*?)<\/m:oMath>/g, (_, inner) => {
        const text = inner.replace(/<[^>]+>/g, "").trim();
        return text ? `<span class="eq">${esc(text)}</span>` : "";
      });
      body = body.replace(/<w:tbl[^>]*>([\s\S]*?)<\/w:tbl>/g, (_, tblXml) => {
        const rows = [];
        const rowRe = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
        let rm;
        while ((rm = rowRe.exec(tblXml)) !== null) {
          const cells = [];
          const cellRe = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/g;
          let cm;
          while ((cm = cellRe.exec(rm[1])) !== null) {
            const text = cm[1].replace(/<\/w:p>/g, " ").replace(/<[^>]+>/g, "").trim();
            cells.push(esc(decodeXml(text)));
          }
          if (cells.length) rows.push(cells);
        }
        if (!rows.length) return "";
        return `<table>${rows.map((r, i) => `<tr>${r.map((c) => `<${i === 0 ? "th" : "td"}>${c}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</table>\n`;
      });
      let html = "";
      const paraRe = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
      let pm;
      while ((pm = paraRe.exec(body)) !== null) {
        let text = pm[1].replace(/<[^>]+>/g, "").trim();
        text = decodeXml(text);
        if (!text) continue;
        if (/^\d+(\.\d+)?\s/.test(text) || text === "Abstract") {
          html += `<h2>${esc(text)}</h2>\n`;
        } else {
          html += `<p>${esc(text)}</p>\n`;
        }
      }
      resolve(html);
    });
  });
}

function docHtml(doc) {
  return new Promise((resolve) => {
    execFile("textutil", ["-convert", "html", "-stdout", doc.file], { maxBuffer: 50 * 1024 * 1024 }, (error, html = "") => {
      if (error) {
        docxToHtmlDirect(doc.file).then((body) => resolve(wrapPage(`<h1>${esc(doc.title)}</h1>\n${body}`)));
        return;
      }
      resolve(enhanceDocHtml(html));
    });
  });
}

function enhanceDocHtml(html) {
  const css = `<style>
    :root{color-scheme:light dark}
    html{background:#fff}
    body{box-sizing:border-box;max-width:1000px;margin:0 auto!important;padding:32px!important;background:#fff;color:#171916;font:16px/1.6 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
    h1,h1 *{font-size:28px!important;line-height:1.2!important;margin:0 0 12px!important}
    h2,h2 *{font-size:22px!important;line-height:1.3!important;margin:20px 0 8px!important}
    h3,h3 *,h4,h4 *{font-size:18px!important;line-height:1.4!important;margin:16px 0 6px!important}
    table{width:100%;margin:14px 0 18px;border-collapse:collapse}
    td,th{border:1px solid #daddd5!important;padding:6px 10px!important;vertical-align:top;font-size:14px!important;line-height:1.5!important}
    p,p *,li,li *,div,div *,span,font,[style*="font"],[style*="font-size"]{font-size:inherit!important;line-height:inherit!important}
    math,math *,mfrac,msqrt,msup,msub,mi,mo,mn{font-size:1em!important}
    @media(prefers-color-scheme:dark){
      html,body{background:#151a16!important;color:#eef3ec!important}
      p,span,td,th{color:#eef3ec!important}
      td,th{border-color:#303a34!important}
    }
  </style>`;
  return html.includes("</head>") ? html.replace("</head>", `${css}</head>`) : `${css}${html}`;
}

/*
  Kept for old bookmarks. The page now uses the individual /docs/*.html routes;
  /theory.html concatenates both docs in one view.
*/
async function legacyCombinedTheoryHtml() {
  const bodies = await Promise.all(docs.map((doc) => docxToHtmlDirect(doc.file).then((body) => `<h1>${esc(doc.title)}</h1>\n${body}`)));
  return wrapPage(bodies.join("\n<hr>\n"));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const htmlDocMatch = url.pathname.match(/^\/docs\/([a-z0-9-]+)\.html$/);
  if (htmlDocMatch) {
    const doc = docs.find((item) => item.slug === htmlDocMatch[1]);
    if (!doc) {
      res.writeHead(404);
      res.end("Document not found");
      return;
    }
    docHtml(doc).then((html) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    });
    return;
  }
  if (url.pathname === "/theory.html") {
    legacyCombinedTheoryHtml().then((html) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    });
    return;
  }
  if (url.pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.join(root, path.normalize(requested));

  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Vec3 Workbench running at http://localhost:${port}`);
});
