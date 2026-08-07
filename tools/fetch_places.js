#!/usr/bin/env node
/* =========================================================
   Vihara — Google Places auto-fetcher
   ---------------------------------------------------------
   Discovers a town's shops / temples / services from Google
   Places API (New) and writes them into the exact Vihara
   JSON + image structure so the static site just works.

   Usage:
     node tools/fetch_places.js <town> [options]

   Options:
     --name <Display Name>   Override the town's display name
     --state <State>         State, e.g. "Karnataka" (default "Karnataka")
     --key <API_KEY>         Google Places API key (or set GOOGLE_PLACES_API_KEY)
     --categories a,b,c      Only fetch these category slugs
     --no-copy               Don't copy template pages from the template town

   Example:
     node tools/fetch_places.js Hassan --state Karnataka --key AIza...

   Requires Node 18+ (built-in fetch). Billing must be enabled on the
   Places API (New): Text Search (New) + Place Photos (New).
   ========================================================= */

"use strict";

const fs = require("fs");
const path = require("path");
const config = require("./config");
const locations = require("./locations");

const ROOT = path.resolve(__dirname, "..");
const CITIES_DIR = path.join(ROOT, "cities");
const TEMPLATE_CITY = config.TEMPLATE_CITY;

/* ---------------- CLI arg parsing ---------------- */

function parseArgs(argv) {
  const args = { _: [], name: null, state: "Karnataka", key: null,
                 categories: null, copy: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name") args.name = argv[++i];
    else if (a === "--state") args.state = argv[++i];
    else if (a === "--key") args.key = argv[++i];
    else if (a === "--categories") args.categories = argv[++i];
    else if (a === "--radius") args.radius = argv[++i];
    else if (a === "--no-copy") args.copy = false;
    else args._.push(a);
  }
  return args;
}

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Resolve a town's centre once so category searches stay local.
async function resolveTownCentre(city, key) {
  if (city.center && city.center.latitude && city.center.longitude) return city.center;
  console.log(`Locating ${city.name}...`);
  const data = await textSearch(`${city.name}, ${city.region}`, key, null);
  const p = data.places && data.places[0];
  if (p && p.location && p.location.latitude) {
    city.center = { latitude: p.location.latitude, longitude: p.location.longitude };
    console.log(`  → centre ${city.center.latitude.toFixed(4)}, ${city.center.longitude.toFixed(4)}`);
    return city.center;
  }
  throw new Error(`Could not locate ${city.name}.`);
}

/* ---------------- API helpers ---------------- */

async function fetchJson(url, options, key, retries = 3) {
  const res = await fetch(url, options);
  if (res.status === 429 || (res.status >= 500 && retries > 0)) {
    await sleep(2000);
    return fetchJson(url, options, key, retries - 1);
  }
  if (!res.ok) {
    let detail = "";
    try { detail = JSON.stringify(await res.json()).slice(0, 400); } catch (_) {}
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}\n  ${detail}`);
  }
  return res.json();
}

async function textSearch(query, key, pageToken, center) {
  const body = {
    textQuery: query,
    pageSize: 20,
    languageCode: "en",
    regionCode: "IN"
  };
  if (center) {
    body.locationBias = {
      circle: {
        center: { latitude: center.latitude, longitude: center.longitude },
        radius: config.MAX_RADIUS_KM * 1000
      }
    };
  }
  if (pageToken) body.pageToken = pageToken;

  return fetchJson(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": config.FIELD_MASK
      },
      body: JSON.stringify(body)
    },
    key
  );
}

async function downloadPhoto(photoName, key, filePath) {
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=640&maxWidthPx=640`;
  const res = await fetch(url, {
    headers: { "Accept": "image/*", "X-Goog-Api-Key": key }
  });
  if (!res.ok) throw new Error(`photo HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filePath, buf);
  return filePath;
}

/* ---------------- Data mapping ---------------- */

// Enrich a town with taxonomy metadata (state / district / tier / focus)
// read from the geographic config under data/locations/. This is the single
// place the taxonomy is applied, so both city_info.json and cities.json end
// up with identical geo fields. Unlisted towns simply keep their region.
function applyTaxonomy(city) {
  const found = locations.findTownSlug(city.slug);
  if (!found) return;
  city.state = found.state;
  city.district = found.district;
  city.tier = found.tier;
  city.focus = found.focus || "";
  city.primaryCategories = found.primaryCategories || [];
}

function humanizeType(type) {
  if (!type) return "";
  return type.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function priceToRupees(level) {
  switch (level) {
    case "PRICE_LEVEL_INEXPENSIVE": return "₹";
    case "PRICE_LEVEL_MODERATE": return "₹₹";
    case "PRICE_LEVEL_EXPENSIVE": return "₹₹₹";
    case "PRICE_LEVEL_VERY_EXPENSIVE": return "₹₹₹₹";
    default: return "";
  }
}

// "9:00 AM" -> "09:00" (24h) for the retail_shops openTime/closeTime fields.
function to24h(clock) {
  if (!clock) return "";
  const m = String(clock).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const min = m[2] ? m[2] : "00";
  if (m[3].toLowerCase() === "pm" && h !== 12) h += 12;
  if (m[3].toLowerCase() === "am" && h === 12) h = 0;
  return String(h).padStart(2, "0") + ":" + min;
}

// Google weekdayDescriptions -> Vihara "timings" + 24h open/close.
function parseHours(regularHours) {
  const out = { timings: "", openTime: "", closeTime: "" };
  if (!regularHours || !Array.isArray(regularHours.weekdayDescriptions)) return out;

  // descriptions start at Monday (index 0). JS getDay(): 0 = Sunday.
  // "6:30 - 10:30 AM" (suffix on the 2nd time only) -> "6:30 AM - 10:30 AM"
  // so live-status.js can parse it. Also normalises Unicode whitespace.
  function normalise(range) {
    let clean = String(range).replace(/[–—]/g, "-").replace(/[\u202f\u2009\u00a0]+/g, " ").trim();
    // Split schedules ("A - B, C - D") — keep the first range for simplicity.
    if (clean.includes(",")) clean = clean.split(",")[0].trim();
    const m = clean.match(/^(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)\s*([ap]m)$/i);
    if (m) {
      clean = `${m[1]} ${m[3].toUpperCase()} - ${m[2]} ${m[3].toUpperCase()}`;
    }
    return clean;
  }

  function apply(clean) {
    if (!clean) return;
    if (clean.toLowerCase() === "closed") return;
    if (clean.toLowerCase() === "open 24 hours") { out.timings = "24 Hours"; return; }
    out.timings = clean;
    const parts = clean.split("-").map((p) => p.trim());
    if (parts.length === 2) {
      out.openTime = to24h(parts[0]);
      out.closeTime = to24h(parts[1]);
    }
  }

  const dayIdx = (new Date().getDay() + 6) % 7; // Monday=0
  const desc = regularHours.weekdayDescriptions[dayIdx];
  if (desc) {
    const range = desc.split(":").slice(1).join(":").trim();
    if (range) apply(normalise(range));
  }

  // Fall back to the first day that isn't Closed.
  if (!out.timings) {
    for (const d of regularHours.weekdayDescriptions) {
      const range = d.split(":").slice(1).join(":").trim();
      if (range && range.toLowerCase() !== "closed") {
        apply(normalise(range));
        break;
      }
    }
  }
  return out;
}

function statusFor(place) {
  const hours = place.regularOpeningHours;
  if (hours && typeof hours.openNow === "boolean") {
    return hours.openNow
      ? { status: "Open Now", statusColor: "#27ae60" }
      : { status: "Closed", statusColor: "#c0392b" };
  }
  if (place.businessStatus === "CLOSED_TEMPORARILY" ||
      place.businessStatus === "CLOSED_PERMANENTLY") {
    return { status: "Closed", statusColor: "#c0392b" };
  }
  return { status: "Open", statusColor: "#27ae60" };
}

/* ---------------- Entry builder ---------------- */

function buildEntry(place, cat, city, idx, hasPhoto) {
  const hours = parseHours(place.regularOpeningHours);
  const st = statusFor(place);
  const primaryType = Array.isArray(place.types) ? place.types[0] : "";

  const entry = {
    id: cat.slug.charAt(0) + (idx + 1),
    name: place.displayName && place.displayName.text ? place.displayName.text : "Untitled",
    image: hasPhoto ? `../../images/${cat.slug}/${idx + 1}.jpg` : "",
    location: place.formattedAddress || "",
    phone: place.internationalPhoneNumber
      ? place.internationalPhoneNumber.replace(/[^0-9]/g, "")
      : (place.nationalPhoneNumber ? place.nationalPhoneNumber.replace(/[^0-9]/g, "") : ""),
    mapLink: place.googleMapsUri || "",
    map_link: place.googleMapsUri || "",
    mapUrl: place.googleMapsUri || "",
    status: st.status,
    statusColor: st.statusColor,
    timings: hours.timings,
    openTime: hours.openTime,
    closeTime: hours.closeTime,
    price: priceToRupees(place.priceLevel),
    rating: typeof place.rating === "number" ? place.rating : null,
    description: place.editorialSummary && place.editorialSummary.text
      ? place.editorialSummary.text
      : `A local favourite in ${city.name}. Tap Call or WhatsApp to reach them directly.`,
    type: humanizeType(primaryType)
  };

  // Merge per-category defaults so category templates never print "undefined".
  if (cat.defaults) {
    for (const k of Object.keys(cat.defaults)) {
      if (k === "_desc") continue;
      if (entry[k] === undefined || entry[k] === "" || entry[k] === null) {
        entry[k] = cat.defaults[k];
      }
    }
  }
  return entry;
}

/* ---------------- Template copying ---------------- */

function copyFileIfMissing(src, dest) {
  if (!fs.existsSync(src)) return false;
  if (fs.existsSync(dest)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function ensureCitySkeleton(city) {
  const cityDir = path.join(CITIES_DIR, city.slug);
  const tplDir = path.join(CITIES_DIR, TEMPLATE_CITY);
  if (!fs.existsSync(tplDir)) {
    throw new Error(`Template town missing: ${tplDir}`);
  }

  // js helpers
  copyFileIfMissing(path.join(tplDir, "js", "live-status.js"), path.join(cityDir, "js", "live-status.js"));
  copyFileIfMissing(path.join(tplDir, "js", "whatsapp.js"), path.join(cityDir, "js", "whatsapp.js"));

  // logo
  for (const f of fs.existsSync(path.join(tplDir, "images", "logo")) ? fs.readdirSync(path.join(tplDir, "images", "logo")) : []) {
    copyFileIfMissing(path.join(tplDir, "images", "logo", f), path.join(cityDir, "images", "logo", f));
  }

  // category HTML pages (listing + details) as design templates
  for (const cat of config.CATEGORIES) {
    const srcDir = path.join(tplDir, "categories", cat.slug);
    if (!fs.existsSync(srcDir)) continue;
    const dstDir = path.join(cityDir, "categories", cat.slug);
    for (const f of fs.readdirSync(srcDir)) {
      if (f.endsWith(".html")) {
        copyFileIfMissing(path.join(srcDir, f), path.join(dstDir, f));
      }
    }
  }

  // more_categories / gallery / map — copied then personalised below.
  return cityDir;
}

// The category templates fetch a specific JSON name (mostly "<cat>_data.json"
// but retail_shops uses "retail_shops.json"). Read it from the template so the
// generated data file always matches what the page actually fetches.
function getDataFilename(cat, cityDir) {
  const htmlPath = path.join(cityDir, "categories", cat.slug, cat.slug + ".html");
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, "utf8");
    const m = html.match(/fetch\(\s*['"]([^'"]+\.json)['"]\s*\)/);
    if (m && m[1]) {
      return m[1].replace(/^\.\//, "").replace(/^\/+/, "");
    }
  }
  return cat.slug + "_data.json";
}

function personalisePage(filePath, city) {
  if (!fs.existsSync(filePath)) return;
  let html = fs.readFileSync(filePath, "utf8");
  html = html.split(TEMPLATE_CITY === "shravanabelagola" ? "Shravanabelagola" : TEMPLATE_CITY)
             .join(city.name);
  fs.writeFileSync(filePath, html);
}

/* ---------------- Page generation ---------------- */

function buildQuickCards(activeCategories, city) {
  const order = ["temples", "street_food", "food", "markets", "retail_shops",
                 "transport", "stays", "healthcare", "services", "education",
                 "fitness", "travels", "nature", "bars", "bakeries"];
  const chosen = order
    .filter((s) => activeCategories.has(s))
    .map((s) => config.CATEGORIES.find((c) => c.slug === s));

  const cards = chosen.slice(0, 3).map((c) =>
    `  <a href="categories/${c.slug}/${c.slug}.html" class="quick-card">\n` +
    `    <i class="fas ${c.icon}"></i><h3>${c.label}</h3>\n` +
    `  </a>`
  );
  cards.push(
    `  <a href="more_categories.html" class="quick-card">\n` +
    `    <i class="fas fa-th-large"></i><h3>All Categories</h3>\n` +
    `  </a>`
  );
  return cards.join("\n");
}

function buildCategoryCards(activeCategories) {
  const cards = [];
  for (const c of config.CATEGORIES) {
    const count = activeCategories.get(c.slug) || 0;
    if (count === 0) continue;
    cards.push(
      `  <a href="categories/${c.slug}/${c.slug}.html" class="category-card">\n` +
      `    <div class="icon-square"><i class="fas ${c.icon}"></i></div>\n` +
      `    <h3>${c.label}</h3>\n` +
      `    <span>${c.tagline}</span>\n` +
      `    <span class="cat-count">${count} place${count > 1 ? "s" : ""}</span>\n` +
      `  </a>`
    );
  }
  return cards.join("\n");
}

function renderCityIndex(city, activeCategories) {
  const tplPath = path.join(__dirname, "templates", "city_index.html");
  let html = fs.readFileSync(tplPath, "utf8");
  const quick = buildQuickCards(activeCategories, city);
  const cats = buildCategoryCards(activeCategories);

  html = html
    .split("{{CITY_NAME}}").join(city.name)
    .split("{{CITY_SLUG}}").join(city.slug)
    .split("{{CITY_REGION}}").join(city.region)
    .split("{{CITY_TAGLINE}}").join(city.tagline || "")
    .split("{{QUICK_CARDS}}").join(quick)
    .split("{{CATEGORY_CARDS}}").join(cats);

  fs.writeFileSync(path.join(CITIES_DIR, city.slug, "index.html"), html);
}

function renderUtilityPages(city) {
  const cityDir = path.join(CITIES_DIR, city.slug);
  const tplDir = path.join(CITIES_DIR, TEMPLATE_CITY);

  for (const page of ["more_categories.html", "gallery.html", "map.html"]) {
    const src = path.join(tplDir, page);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(cityDir, page);
    if (!fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
    }
    personalisePage(dst, city);
  }

  // map.html — point the embed at the town itself.
  const mapPath = path.join(cityDir, "map.html");
  if (fs.existsSync(mapPath)) {
    let mapHtml = fs.readFileSync(mapPath, "utf8");
    mapHtml = mapHtml.replace(
      /src="https:\/\/www\.google\.com\/maps\/embed\?pb=[^"]*"/,
      `src="https://www.google.com/maps?q=${encodeURIComponent(city.name + ", " + city.region)}&output=embed"`
    );
    fs.writeFileSync(mapPath, mapHtml);
  }
}

function renderGalleryData(city, allEntries) {
  const items = [];
  for (const cat of config.CATEGORIES) {
    const entries = allEntries.get(cat.slug) || [];
    for (const e of entries.slice(0, 3)) {
      if (!e.image) continue;
      items.push({
        src: e.image.replace("../../images", "./images"),
        cat: cat.slug,
        desc: e.name
      });
    }
  }
  const json = JSON.stringify(items, null, 2);
  fs.writeFileSync(path.join(CITIES_DIR, city.slug, "gallery_data.json"), json);
}

/* ---------------- cities.json regeneration ---------------- */

function regenerateRootCitiesJson() {
  const cities = [];
  if (!fs.existsSync(CITIES_DIR)) return;

  for (const slug of fs.readdirSync(CITIES_DIR)) {
    const infoPath = path.join(CITIES_DIR, slug, "city_info.json");
    if (!fs.existsSync(infoPath)) continue;
    const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));

    let placesCount = 0;
    let categoriesCount = 0;
    let image = "";

    const catDir = path.join(CITIES_DIR, slug, "categories");
    if (fs.existsSync(catDir)) {
      for (const c of fs.readdirSync(catDir)) {
        const dataPath = path.join(catDir, c, c + "_data.json");
        const dataPath2 = path.join(catDir, c, c + ".json");
        const chosen = fs.existsSync(dataPath) ? dataPath : (fs.existsSync(dataPath2) ? dataPath2 : null);
        if (!chosen) continue;
        const list = JSON.parse(fs.readFileSync(chosen, "utf8"));
        if (Array.isArray(list) && list.length) {
          placesCount += list.length;
          categoriesCount++;
          if (!image && list[0].image) {
            // Data files store "../../images/..." relative to the category JSON.
            // cities.json is read from the repo root, so convert to root-relative.
            image = list[0].image
              .replace(/^\.\.\/\.\.\//, `cities/${slug}/`)
              .replace(/^\.\//, `cities/${slug}/`);
          }
        }
      }
    }

    cities.push({
      slug: info.slug,
      name: info.name,
      region: info.region || "",
      tagline: info.tagline || "",
      image: image || "",
      placesCount,
      categoriesCount,
      state: info.state || "",
      district: info.district || "",
      tier: info.tier || null,
      focus: info.focus || "",
      primaryCategories: info.primaryCategories || []
    });
  }

  // Keep the hand-curated template town first.
  cities.sort((a, b) => {
    if (a.slug === TEMPLATE_CITY) return -1;
    if (b.slug === TEMPLATE_CITY) return 1;
    return a.name.localeCompare(b.name);
  });

  fs.writeFileSync(path.join(ROOT, "cities.json"), JSON.stringify(cities, null, 2) + "\n");
  console.log(`\ncities.json updated — ${cities.length} town(s).`);
}

/* ---------------- Main ---------------- */

async function fetchCategory(cat, city, key, seenIds) {
  const queries = cat.queries.map((q) =>
    q.replace("{city}", city.name).replace("{state}", city.state)
  );
  const places = new Map();
  const allTypes = (cat.types && cat.types.length) ? cat.types : null;
  const center = city.center;
  const radius = config.MAX_RADIUS_KM;

  for (const query of queries) {
    let pageToken = null;
    for (let page = 0; page < config.MAX_PAGES_PER_CATEGORY; page++) {
      console.log(`  ↳ ${query}${pageToken ? ` (page ${page + 1})` : ""}`);
      const data = await textSearch(query, key, pageToken, center);
      const list = data.places || [];
      for (const p of list) {
        if (seenIds.has(p.id)) continue;
        const pName = (p.displayName && p.displayName.text) || "";
        if (config.NAME_BLACKLIST.some((re) => re.test(pName))) continue;
        if (allTypes) {
          if (!p.types || !p.types.some((t) => allTypes.includes(t))) continue;
        }
        // Hard locality check — drop anything outside the town bubble.
        if (center && p.location && p.location.latitude) {
          const dist = haversineKm(center.latitude, center.longitude,
            p.location.latitude, p.location.longitude);
          if (dist > radius) continue;
        }
        places.set(p.id, p);
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
      await sleep(config.NEXT_PAGE_DELAY_MS);
    }
    if (places.size > 40) break;
    await sleep(config.API_DELAY_MS);
  }

  return Array.from(places.values());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = (args._[0] || "").trim();

  if (raw === "--regenerate") {
    regenerateRootCitiesJson();
    return;
  }

  if (!raw) {
    console.log("Usage: node tools/fetch_places.js <town> [--name Name] [--state State] [--key KEY] [--categories a,b,c]");
    console.log("       node tools/fetch_places.js --regenerate   (rebuild cities.json only)");
    console.log("\nKnown towns (add more via city_info.json):");
    if (fs.existsSync(CITIES_DIR)) {
      for (const slug of fs.readdirSync(CITIES_DIR)) {
        const p = path.join(CITIES_DIR, slug, "city_info.json");
        if (fs.existsSync(p)) console.log("  - " + slug);
      }
    }
    process.exit(1);
  }

  const key = args.key || process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.error("ERROR: No Google Places API key.\n  Pass --key <KEY> or set GOOGLE_PLACES_API_KEY.");
    process.exit(1);
  }

  if (args.radius) {
    const r = parseFloat(args.radius);
    if (r && r > 0) config.MAX_RADIUS_KM = r;
  }

  const slug = slugify(raw);
  if (slug === slugify(TEMPLATE_CITY)) {
    console.error(`"${TEMPLATE_CITY}" is the hand-curated template town and is not fetched from Google.`);
    process.exit(1);
  }

  // Load or create city info.
  let city;
  const infoPath = path.join(CITIES_DIR, slug, "city_info.json");
  if (fs.existsSync(infoPath)) {
    city = JSON.parse(fs.readFileSync(infoPath, "utf8"));
  } else {
    city = {
      slug,
      name: args.name || raw,
      region: args.state || "Karnataka",
      tagline: `${raw}'s shops, stays, food and services — discover everything in one place.`
    };
  }
  if (args.name) city.name = args.name;
  if (args.state) city.region = args.state;
  city.fetchedAt = new Date().toISOString();
  city.slug = slug;

  // Pull tier / district / focus from the geographic taxonomy so the town's
  // meta file and the root cities.json stay in sync with data/locations/.
  applyTaxonomy(city);

  const wanted = args.categories
    ? args.categories.split(",").map((s) => s.trim())
    : null;

  console.log(`\nVihara fetcher → ${city.name}, ${city.region} (${city.slug})\n`);

  // Copy design templates from the hand-curated town.
  const cityDir = ensureCitySkeleton(city);

  // Resolve the town centre so searches stay local.
  try {
    await resolveTownCentre(city, key);
  } catch (e) {
    console.error(`  ${e.message}`);
    console.error("  Proceeding without a location bias — results may include nearby villages.");
  }

  const allEntries = new Map();
  const seenIds = new Set();

  for (const cat of config.CATEGORIES) {
    if (wanted && !wanted.includes(cat.slug)) continue;
    process.stdout.write(`Fetching ${cat.label}...`);
    try {
      const places = await fetchCategory(cat, city, key, seenIds);
      const entries = [];
      const imgDir = path.join(cityDir, "images", cat.slug);
      fs.mkdirSync(imgDir, { recursive: true });

      for (let i = 0; i < places.length; i++) {
        const place = places[i];
        seenIds.add(place.id);
        let hasPhoto = false;
        const entryIdx = entries.length;

        if (place.photos && place.photos.length) {
          try {
            const dest = path.join(imgDir, `${entryIdx + 1}.jpg`);
            if (!fs.existsSync(dest)) {
              await downloadPhoto(place.photos[0].name, key, dest);
            }
            hasPhoto = true;
          } catch (e) {
            console.log(`\n  ⚠ ${place.displayName?.text} photo failed: ${e.message}`);
          }
        }

        entries.push(buildEntry(place, cat, city, entryIdx, hasPhoto));
        await sleep(config.API_DELAY_MS);
      }

      allEntries.set(cat.slug, entries);
      const dataFile = getDataFilename(cat, cityDir);
      const dataJson = JSON.stringify(entries, null, 2);
      fs.writeFileSync(path.join(cityDir, "categories", cat.slug, dataFile), dataJson);
      console.log(` ${entries.length} place(s) ✓`);
    } catch (e) {
      console.log(` FAILED`);
      console.error(`  ${e.message}`);
      if (/403|REQUEST_DENIED|billing|disabled/i.test(e.message)) {
        console.error("\n  Hint: enable Places API (New) on the key and turn on billing.");
      }
    }
  }

  // Generate pages.
  const activeCats = new Map();
  for (const [slug, list] of allEntries) activeCats.set(slug, list.length);
  renderCityIndex(city, activeCats);
  renderUtilityPages(city);
  renderGalleryData(city, allEntries);

  // Persist city info.
  fs.mkdirSync(path.dirname(infoPath), { recursive: true });
  fs.writeFileSync(infoPath, JSON.stringify(city, null, 2) + "\n");

  regenerateRootCitiesJson();

  console.log(`\nDone. Open http://localhost:8000/ to view — or push to GitHub Pages.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
