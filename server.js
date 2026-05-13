const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const mammoth = require("mammoth");

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

const styleSheet = `<style>
  :root{color-scheme:light dark;--bg:#fff;--ink:#171916;--muted:#687068;--line:#daddd5;--code-bg:#eef2ed;--accent:#126a5a}
  body{margin:0;padding:28px;font:16px/1.65 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
  article{max-width:860px;margin:0 auto}
  h1{margin:32px 0 8px;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.01em}
  h1:first-child{margin-top:0}
  h2{margin:28px 0 6px;font-size:20px;line-height:1.3;font-weight:650}
  h3,h4{margin:22px 0 4px;font-size:17px;line-height:1.35;font-weight:620}
  p{margin:0 0 12px}
  ul,ol{margin:0 0 12px;padding:0 0 0 22px}
  li{margin:3px 0}
  table{border-collapse:collapse;margin:16px 0;width:100%;font-size:14px}
  th{background:#f2f5f1;border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top;font-weight:650}
  td{border:1px solid var(--line);padding:7px 10px;vertical-align:top}
  tr:nth-child(even) td{background:#f9faf8}
  hr{margin:24px 0;border:0;border-top:1px solid var(--line)}
  code{padding:1px 5px;border-radius:4px;background:var(--code-bg);font:0.88em/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  pre{background:#f2f5f1;padding:12px 14px;border-radius:6px;overflow-x:auto;font:0.88em/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}
  pre code{background:none;padding:0;border-radius:0}
  strong{font-weight:650}
  blockquote{margin:12px 0;padding:0 0 0 16px;border-left:3px solid var(--line);color:var(--muted)}
  a{color:var(--accent);text-decoration:underline;text-underline-offset:2px}
  a:hover{text-decoration:none}
  @media(prefers-color-scheme:dark){
    :root{--bg:#141914;--ink:#eef3ec;--muted:#8a978d;--line:#2d3630;--code-bg:#1e2620;--accent:#4fc0a2}
    th{background:#1a221d}
    tr:nth-child(even) td{background:#181e1a}
    pre{background:#1a221d}
    blockquote{border-color:#2d3630}
  }
</style>`;

function wrapHtml(body) {
  return `<!doctype html><html><head><meta charset="utf-8">${styleSheet}</head><body><article>${body}</article></body></html>`;
}

async function docHtml(doc) {
  try {
    const result = await mammoth.convertToHtml({ path: doc.file });
    return wrapHtml(result.value);
  } catch (err) {
    return wrapHtml(`<p>Unable to load ${doc.title}.</p>`);
  }
}

/*
  Kept for old bookmarks. The page now uses the individual /docs/*.html routes;
  /theory.html is kept only for backward compatibility.
*/
async function legacyCombinedTheoryHtml() {
  const results = await Promise.all(docs.map((doc) => mammoth.convertToHtml({ path: doc.file }).then((r) => r.value).catch(() => "")));
  return wrapHtml(results.filter(Boolean).join("\n<hr>\n"));
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
