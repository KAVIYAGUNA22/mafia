// Applies the mobile layout + phone chat changes to your project.
// Run from your project folder (the one with package.json):
//   node apply-mobile.mjs
// It needs these files next to it: mobile.css, mobile-chat.css, Chat-block.jsx
import fs from "node:fs";
import path from "node:path";

const APP = process.argv[2] || "src/App.jsx";
const read = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

function fail(msg) {
  console.error("\nStopped. Nothing was changed.\n -> " + msg);
  process.exit(1);
}

for (const f of [APP, "mobile.css", "mobile-chat.css", "Chat-block.jsx"]) {
  if (!fs.existsSync(f)) fail(`Can't find ${f}. Run this from your project folder with the 3 helper files next to it.`);
}

const original = fs.readFileSync(APP, "utf8");
const crlf = original.includes("\r\n");
let s = original.replace(/\r\n/g, "\n");

if (s.includes("mf-scene")) {
  console.log("App.jsx already has the mobile changes. Nothing to do.");
  process.exit(0);
}

// 1) mobile CSS goes at the very end of the css template string
const cssEnd = s.indexOf("`;\n\nconst Emblem");
if (cssEnd < 0) fail("Couldn't find the end of the css string (the line before 'const Emblem').");
s = s.slice(0, cssEnd) + "\n" + read("mobile.css") + "\n" + read("mobile-chat.css") + "\n" + s.slice(cssEnd);

// 2) wrap the background scene so the page can scroll on phones
const sceneOpen = /<>\s*<div className="mf-sky" \/>/;
const sceneClose = /(<div className="mf-slogan r">[\s\S]*?<\/div>)\s*<\/>/;
if (!sceneOpen.test(s) || !sceneClose.test(s)) fail("Couldn't find the Scene() markup.");
s = s.replace(sceneOpen, '<div className="mf-scene">\n      <div className="mf-sky" />');
s = s.replace(sceneClose, "$1\n    </div>");

// 3) new Chat component (popup bubbles + full-screen on phones)
const a = s.indexOf("function Chat(");
const b = s.indexOf("function Game(");
if (a < 0 || b < 0 || b < a) fail("Couldn't find the Chat and Game functions.");
s = s.slice(0, a) + read("Chat-block.jsx").trimEnd() + "\n\n" + s.slice(b);

// 4) move <Chat /> out of the card so it can cover the whole screen
const chatUse = /\{showChat && \(\s*<Chat[\s\S]*?\/>\s*\)\}/;
const found = s.match(chatUse);
if (!found) fail("Couldn't find the {showChat && (<Chat ... />)} block.");
if (!s.includes("</main>")) fail("Couldn't find </main>.");
s = s.replace(chatUse, "");
s = s.replace("</main>", "</main>\n\n      " + found[0]);

// ---- everything above worked: back up and write ----
fs.writeFileSync(APP + ".bak", original);
fs.writeFileSync(APP, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log(`OK   ${APP} updated (backup: ${APP}.bak)`);

// 5) phone-friendly viewport (keeps the keyboard from covering the chat box)
if (fs.existsSync("index.html")) {
  let h = fs.readFileSync("index.html", "utf8");
  if (!h.includes("interactive-widget")) {
    const meta = '<meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content" />';
    h = /<meta name="viewport"[^>]*>/.test(h)
      ? h.replace(/<meta name="viewport"[^>]*>/, meta)
      : h.replace("</head>", `  ${meta}\n  </head>`);
    fs.writeFileSync("index.html", h);
    console.log("OK   index.html viewport updated");
  }
}

// 6) bigger moon / sun on tall phone screens
const splash = path.join(path.dirname(APP), "PhaseSplash.jsx");
if (fs.existsSync(splash)) {
  const p = fs.readFileSync(splash, "utf8");
  const marker = "@media (prefers-reduced-motion:reduce){.ps{display:none}}";
  if (!p.includes("max-aspect-ratio") && p.includes(marker)) {
    fs.writeFileSync(
      splash,
      p.replace(marker, "@media (max-aspect-ratio:1/1){.ps-moon{width:min(78vw,46vh)}.ps-sun{width:min(84vw,50vh)}}\n" + marker)
    );
    console.log("OK   PhaseSplash.jsx updated");
  }
}

console.log("\nDone. Restart the dev server if it doesn't refresh by itself.");
