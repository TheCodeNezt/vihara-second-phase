#!/usr/bin/env node
/* =========================================================
   Vihara — district landing page builder
   ---------------------------------------------------------
   Builds one data-driven landing page per district config:
       data/locations/<state>/<district>.json  ->  <state>/<district>/index.html

   The page groups the district's towns by tier and links each
   to its canonical geo route /<state>/<district>/<town> (and,
   as a fallback anchor, the physical cities/<town>/ page).

   Usage:
     node tools/build_district.js [state] [district]
     node tools/build_district.js --all        (rebuild every district)
   ========================================================= */

"use strict";

const fs = require("fs");
const path = require("path");
const locations = require("./locations");

const TEMPLATE = path.join(__dirname, "templates", "district_index.html");
const ROOT = locations.ROOT;

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Reads cities.json to attach live place-counts to each town card,
// matching the folder slug against the taxonomy slug.
function placeCountsBySlug() {
  const counts = {};
  const file = path.join(ROOT, "cities.json");
  if (!fs.existsSync(file)) return counts;
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const c of list) counts[c.slug] = c.placesCount || 0;
  } catch (_) {}
  return counts;
}

function buildTierSection(tierKey, tier, towns, counts) {
  const cards = towns.map((t, i) => {
    const places = counts[t.slug];
    const meta = places
      ? `${places} place${places === 1 ? "" : "s"} listed`
      : "Not listed yet";
    return (
      `    <a class="town-card" href="./${t.slug}/">\n` +
      `      <div class="num">${i + 1}</div>\n` +
      `      <div>\n` +
      `        <h3>${escapeHtml(t.name)}</h3>\n` +
      `        <div class="focus">${escapeHtml(t.focus || tier.tagline)}</div>\n` +
      `        <div class="meta">${escapeHtml(meta)}</div>\n` +
      `      </div>\n` +
      `    </a>`
    );
  }).join("\n");

  return (
    `<div class="section">\n` +
    `  <div class="section-header">\n` +
    `    <h2><i class="fas ${tier.icon || "fa-layer-group"}"></i>${escapeHtml(tier.name)}</h2>\n` +
    `    <p>${escapeHtml(tier.tagline || "")}</p>\n` +
    `  </div>\n` +
    `  <div class="town-grid">\n${cards}\n  </div>\n` +
    `</div>`
  );
}

// Each canonical geo route /<state>/<district>/<town>/ needs to physically
// exist on GitHub Pages. We generate a tiny redirect page for every town so
// the geo slug always resolves, forwarding to the real cities/<town>/ page.
function renderTownRedirect(state, district, town) {
  const outDir = path.join(ROOT, state, district, town.slug);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "index.html");
  const rel = "../../../cities/" + town.slug + "/";
  const html =
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n` +
    `<meta charset="UTF-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">\n` +
    `<title>${escapeHtml(town.name)} | Vihara</title>\n` +
    `<meta http-equiv="refresh" content="0; url=${rel}">\n` +
    `<link rel="canonical" href="${rel}">\n` +
    `<script>location.replace("${rel}");</script>\n` +
    `</head>\n<body style="font-family:sans-serif;background:#f8f9fa;color:#333;display:flex;align-items:center;justify-content:center;height:100vh;">\n` +
    `  <div style="text-align:center;">\n` +
    `    <h2 style="color:#2c3e50;">${escapeHtml(town.name)}</h2>\n` +
    `    <p>Taking you to the town page&hellip;</p>\n` +
    `    <a href="${rel}">Continue</a>\n` +
    `  </div>\n` +
    `</body>\n</html>\n`;
  fs.writeFileSync(outFile, html);
  return outFile;
}

function renderDistrict(state, district) {
  const cfg = locations.loadDistrict(state, district);
  if (!cfg) throw new Error(`No district config for ${state}/${district}`);

  const tpl = fs.readFileSync(TEMPLATE, "utf8");
  const counts = placeCountsBySlug();

  const towns = cfg.towns || [];
  const tierKeys = Object.keys(cfg.tiers || {}).sort((a, b) => +a - +b);

  const tierSections = tierKeys
    .map((k) => {
      const tierTowns = towns.filter((t) => String(t.tier) === k);
      if (!tierTowns.length) return "";
      return buildTierSection(k, cfg.tiers[k], tierTowns, counts);
    })
    .filter(Boolean)
    .join("\n");

  const placeCount = towns.reduce((sum, t) => sum + (counts[t.slug] || 0), 0);

  // Physical geo routes for each town under the district page.
  for (const t of towns) renderTownRedirect(state, district, t);

  const html = tpl
    .split("{{STATE_DISPLAY}}").join(escapeHtml(cfg.stateDisplay || state))
    .split("{{DISTRICT_NAME}}").join(escapeHtml(cfg.districtDisplay || district))
    .split("{{DISTRICT_BLURB}}").join(escapeHtml(cfg.blurb || ""))
    .split("{{TOWN_COUNT}}").join(towns.length)
    .split("{{TIER_COUNT}}").join(tierKeys.length)
    .split("{{PLACE_COUNT}}").join(placeCount)
    .split("{{TIER_SECTIONS}}").join(tierSections);

  const outDir = path.join(ROOT, state, district);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "index.html");
  fs.writeFileSync(outFile, html);
  console.log(`Built ${outFile} (${towns.length} towns, ${placeCount} places).`);
}

function buildAll() {
  for (const state of locations.listStates()) {
    for (const district of locations.listDistricts(state)) {
      try { renderDistrict(state, district); }
      catch (e) { console.error(`  x ${state}/${district}: ${e.message}`); }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--all")) { buildAll(); return; }

  const state = args[0];
  const district = args[1];
  if (!state || !district) {
    console.log("Usage: node tools/build_district.js <state> <district>");
    console.log("       node tools/build_district.js --all");
    process.exit(1);
  }
  try { renderDistrict(state, district); }
  catch (e) { console.error(`  x ${e.message}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
