const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const docs = [
  { slug: "vec3", title: "Vec3", file: path.join(root, "Vec3.docx") },
  { slug: "vec3-mathematics", title: "Vec3 Mathematics", file: path.join(root, "Vec3 Mathematics.docx") },
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  const rawMatch = url.pathname.match(/^\/raw\/([a-z0-9-]+)$/);
  if (rawMatch) {
    const doc = docs.find((item) => item.slug === rawMatch[1]);
    if (!doc) {
      res.writeHead(404);
      res.end("Document not found");
      return;
    }
    const stream = fs.createReadStream(doc.file);
    stream.on("error", () => {
      res.writeHead(500);
      res.end("Error reading file");
    });
    res.writeHead(200, { "content-type": types[".docx"] });
    stream.pipe(res);
    return;
  }

  if (url.pathname.startsWith("/vendor/")) {
    const name = path.basename(url.pathname);
    const candidates = [
      path.join(root, "node_modules", "docx-preview", "dist", name),
      path.join(root, "node_modules", "jszip", "dist", name),
    ];
    const found = candidates.find((f) => f.startsWith(path.join(root, "node_modules")) && fs.existsSync(f));
    if (!found) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    fs.readFile(found, (error, data) => {
      if (error) {
        res.writeHead(500);
        res.end("Error");
        return;
      }
      res.writeHead(200, { "content-type": types[path.extname(found)] || "application/octet-stream" });
      res.end(data);
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
