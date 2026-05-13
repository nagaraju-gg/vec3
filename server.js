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

function docxParagraphs(file) {
  return new Promise((resolve) => {
    execFile("unzip", ["-p", file, "word/document.xml"], { maxBuffer: 20 * 1024 * 1024 }, (error, xml = "") => {
      if (error) return resolve([`Unable to load ${path.basename(file)}.`]);
      resolve(
        xml
          .replace(/<w:tab\/>/g, " ")
          .replace(/<\/w:p>/g, "\n")
          .replace(/<[^>]+>/g, "")
          .split("\n")
          .map((line) => decodeXml(line).trim())
          .filter(Boolean),
      );
    });
  });
}

function paragraphsToMarkdown(title, paragraphs) {
  const body = paragraphs
    .map((paragraph) => (/^\d+(\.\d+)?\s/.test(paragraph) || paragraph === "Abstract" ? `## ${paragraph}` : paragraph))
    .join("\n\n");
  return `# ${title}\n\n${body}\n`;
}

async function docMarkdown(doc) {
  const paragraphs = await docxParagraphs(doc.file);
  return paragraphsToMarkdown(doc.title, paragraphs);
}

function docHtml(doc) {
  return new Promise((resolve) => {
    execFile("textutil", ["-convert", "html", "-stdout", doc.file], { maxBuffer: 50 * 1024 * 1024 }, (error, html = "") => {
      if (error) {
        docMarkdown(doc).then((markdown) => resolve(markdownHtml(markdown)));
        return;
      }
      resolve(enhanceDocHtml(html));
    });
  });
}

function esc(text) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function inlineMarkdown(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function markdownToHtml(markdown) {
  const blocks = markdown.trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const text = block.trim();
      if (!text) return "";
      if (/^-{3,}$/.test(text)) return "<hr>";
      const heading = text.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        return `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
      }
      const lines = text.split("\n");
      if (lines.every((line) => /^[-*]\s+/.test(line))) {
        return `<ul>${lines.map((line) => `<li>${inlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      }
      if (lines.every((line) => /^\d+\.\s+/.test(line))) {
        return `<ol>${lines.map((line) => `<li>${inlineMarkdown(line.replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
      }
      return `<p>${inlineMarkdown(text).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

function markdownHtml(markdown) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{color-scheme:light dark}
    body{margin:0;padding:38px;font:40px/1.72 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171916;background:#fff}
    article{max-width:1180px;margin:0 auto}
    h1{margin:0 0 28px;font-size:100px;line-height:1.04;letter-spacing:0}
    h2{margin:38px 0 16px;font-size:64px;line-height:1.18;letter-spacing:0}
    h3,h4{margin:30px 0 12px;font-size:48px;line-height:1.28}
    p{margin:0 0 20px}
    ul,ol{margin:0 0 22px 30px;padding:0}
    li{margin:8px 0}
    hr{margin:32px 0;border:0;border-top:1px solid #daddd5}
    code{padding:2px 5px;border-radius:5px;background:#eef2ed;font:0.92em ui-monospace,SFMono-Regular,Menlo,monospace}
    @media(prefers-color-scheme:dark){body{background:#151a16;color:#eef3ec}hr{border-color:#303a34}code{background:#202821}}
  </style></head><body><article>${markdownToHtml(markdown)}</article></body></html>`;
}

function enhanceDocHtml(html) {
  const css = `<style>
    :root{color-scheme:light dark}
    html{background:#fff}
    body{box-sizing:border-box;max-width:1240px;margin:0 auto!important;padding:38px!important;background:#fff;color:#171916;font:40px/1.72 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;zoom:2}
    h1,h1 *{font-size:100px!important;line-height:1.04!important}
    h2,h2 *{font-size:64px!important;line-height:1.18!important}
    h3,h3 *,h4,h4 *{font-size:48px!important;line-height:1.28!important}
    table{width:100%;margin:22px 0 28px;border-collapse:collapse}
    td,th{border-color:#daddd5!important;padding:10px 12px!important;vertical-align:top;font-size:36px!important;line-height:1.55!important}
    p,p *,li,li *,div,div *,span,font,[style*="font"],[style*="font-size"]{font-size:40px!important;line-height:1.72!important}
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
  /theory.html simply renders both markdown sources in one plain view.
*/
async function legacyCombinedTheoryHtml() {
  const parts = await Promise.all(docs.map((doc) => docxParagraphs(doc.file)));
  const body = parts
    .map((paragraphs, docIndex) => paragraphsToMarkdown(docs[docIndex].title, paragraphs))
    .join("\n\n---\n\n");
  return markdownHtml(body);
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
  const docMatch = url.pathname.match(/^\/docs\/([a-z0-9-]+)\.md$/);
  if (docMatch) {
    const doc = docs.find((item) => item.slug === docMatch[1]);
    if (!doc) {
      res.writeHead(404);
      res.end("Document not found");
      return;
    }
    docMarkdown(doc).then((markdown) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(markdownHtml(markdown));
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
