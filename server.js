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
  :root{color-scheme:light dark}
  body{margin:0;padding:32px;font:16px/1.6 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171916;background:#fff}
  article{max-width:1000px;margin:0 auto}
  h1{margin:0 0 12px;font-size:28px;line-height:1.2}
  h2{margin:20px 0 8px;font-size:22px;line-height:1.3}
  h3,h4{margin:16px 0 6px;font-size:18px;line-height:1.4}
  p{margin:0 0 14px}
  ul,ol{margin:0 0 14px 24px;padding:0}
  li{margin:4px 0}
  table{border-collapse:collapse;margin:14px 0;width:100%}
  td,th{border:1px solid #daddd5;padding:6px 10px;text-align:left;vertical-align:top;font-size:14px}
  hr{margin:20px 0;border:0;border-top:1px solid #daddd5}
  code{padding:2px 5px;border-radius:5px;background:#eef2ed;font:0.9em ui-monospace,SFMono-Regular,Menlo,monospace}
  @media(prefers-color-scheme:dark){body{background:#151a16;color:#eef3ec}td,th{border-color:#303a34}hr{border-color:#303a34}code{background:#202821}}
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
