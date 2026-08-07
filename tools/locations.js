/* =========================================================
   Vihara — geographic taxonomy loader
   ---------------------------------------------------------
   Reads the district config files under data/locations/ and
   exposes typed helpers so the fetcher and build scripts can
   resolve a town's state / district / tier / focus.

   Each district config lives at:
       data/locations/<state>/<district>.json

   It is the single source of truth for tiering. This loader
   never writes — the fetcher reads from it to enrich the
   per-town city_info.json, and build_district.js reads from
   it to generate the district landing pages.
   ========================================================= */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOCATIONS_DIR = path.join(ROOT, "data", "locations");

function listStates() {
  if (!fs.existsSync(LOCATIONS_DIR)) return [];
  return fs.readdirSync(LOCATIONS_DIR).filter((d) => {
    const p = path.join(LOCATIONS_DIR, d);
    return fs.statSync(p).isDirectory();
  });
}

function listDistricts(state) {
  const dir = path.join(LOCATIONS_DIR, state);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

// Load one district config (=> { state, district, tiers, towns, ... }).
function loadDistrict(state, district) {
  const file = path.join(LOCATIONS_DIR, state, district + ".json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`Could not parse district config: ${file} — ${e.message}`);
  }
}

// Indexes towns with the resolved tier object attached.
function townsWithTiers(cfg) {
  if (!cfg || !Array.isArray(cfg.towns)) return [];
  return cfg.towns.map((t) => ({
    ...t,
    tierInfo: (cfg.tiers || {})[String(t.tier)] || null,
    canonicalSlug: `${cfg.state}/${cfg.district}/${t.slug}`
  }));
}

// Find the taxonomy entry for a town slug (the physical cities/<slug>/ dir).
// A town may live under any state/district; this scans all configs.
function findTownSlug(slug) {
  for (const state of listStates()) {
    for (const district of listDistricts(state)) {
      const cfg = loadDistrict(state, district);
      const found = (cfg && cfg.towns || []).find((t) => t.slug === slug);
      if (found) {
        return { ...found, state, stateDisplay: cfg.stateDisplay,
                 district, districtDisplay: cfg.districtDisplay, cfg };
      }
    }
  }
  return null;
}

// Canonical geo route for a town, e.g. "/karnataka/hassan/channarayapatna".
function canonicalRoute(state, district, town) {
  return `/${state}/${district}/${town}`;
}

module.exports = {
  ROOT,
  LOCATIONS_DIR,
  listStates,
  listDistricts,
  loadDistrict,
  townsWithTiers,
  findTownSlug,
  canonicalRoute
};