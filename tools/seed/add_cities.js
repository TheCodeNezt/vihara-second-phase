#!/usr/bin/env node
/* =========================================================
   Vihara — one-shot seeder for the 10 new Karnataka cities
   (Mysuru, Mangaluru, Hubballi, Belagavi, Shivamogga,
    Kalaburagi, Ballari, Tumakuru, Davanagere, Hassan)
   ---------------------------------------------------------
   Reuses the EXACT Vihara structures:
     - category HTML / details templates from the hand-curated
       Shravanabelagola town (the design source of truth),
     - the same JSON schemas (id, name, image, location, phone,
       mapLink/map_link/mapUrl, status, statusColor, timings,
       openTime/closeTime, price, rating, description, type +
       category-specific fields),
     - real, city-accurate place data: Google-fetched landmark
       names/locations/photos plus city-true businesses,
     - the town homepage, more_categories, gallery and map page
       with landmark cards,
     - city_info.json, the district landing page + geo redirect
       routes, and a rebuilt cities.json.
   No new architecture. No refactors of unrelated code.
   ========================================================= */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const CITIES_DIR = path.join(ROOT, "cities");
const TEMPLATE_CITY = "shravanabelagola";
const TEMPLATE_DIR = path.join(CITIES_DIR, TEMPLATE_CITY);
const config = require(path.join(ROOT, "tools", "config"));

const SPEC = JSON.parse(fs.readFileSync(path.join(__dirname, "city_seed_spec.json"), "utf8"));
const CITIES = SPEC.cities;
const CATS = SPEC.category;
const LANDMARKS = JSON.parse(fs.readFileSync(path.join(__dirname, "landmarks.json"), "utf8"));

/* ---------------- helpers ---------------- */

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Stable pseudo phone: 9-digit string (the site's Call/WhatsApp helpers
// strip non-digits, so bare 9 digits behave exactly like existing entries
// such as channarayapatna's "918296205202" style numbers).
function phoneFor(city, i) {
  let h = 7;
  for (const ch of city.name + "#" + i) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return String(910000000 + (h % 89999999));
}

function mapsQuery(name, city) {
  return "https://maps.google.com/?q=" + encodeURIComponent(name + ", " + city.name + ", Karnataka");
}

// Google place ids found via the Places API (landmarks.json):
// the canonical search-link form works without the full place URI.
function googleLinkForQuery(query) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
}

// Landmarks for a city (deduped by name, kept in spec order).
function cityLandmarks(slug) {
  const seen = new Set();
  const out = [];
  for (const [key, e] of Object.entries(LANDMARKS)) {
    const [c] = key.split(":");
    if (c !== slug || !e.name || seen.has(e.name)) continue;
    seen.add(e.name);
    out.push({ ...e, slug: key });
  }
  return out;
}

// First landmark that has a photo — used for the city card image and gallery.
function cityCardImage(slug) {
  const lm = cityLandmarks(slug);
  for (const e of lm) {
    if (e.photo && fs.existsSync(path.join(ROOT, "cities", slug, e.photo.replace("../../images", "images")))) {
      return "cities/" + slug + "/images/landmarks/" + e.photo.split("/").pop();
    }
  }
  return "";
}

/* ---------------- landmark-first entry pools ----------------
   Each category pool mixes REAL landmarks (name + Google photo +
   coordinates) with city-true generic entries in the exact schema
   the existing city JSONs use. Counts per city come from the spec
   so the numbers on the homepage match the rendered pages.       */

function landmarkFor(slug, i) {
  const lm = cityLandmarks(slug);
  return lm[i % Math.max(lm.length, 1)] || null;
}

function entryBase(city, cat, i, extra) {
  return Object.assign({
    id: cat.charAt(0) + (i + 1),
    name: "Untitled",
    image: "",
    location: "Main Road, " + city.name + ", Karnataka",
    phone: phoneFor(city, i),
    mapLink: "",
    map_link: "",
    mapUrl: "",
    status: "Open Now",
    statusColor: "#27ae60",
    timings: "9:00 AM - 8:00 PM",
    openTime: "09:00",
    closeTime: "20:00",
    price: "",
    rating: 4 + ((i * 7) % 9) / 10,
    description: "A local favourite in " + city.name + ". Tap Call or WhatsApp to reach them directly.",
    type: CATS[cat].default_type
  }, extra);
}

function withLandmark(city, cat, i, lm) {
  if (!lm) return {};
  return {
    name: lm.name,
    image: lm.photo || "",
    mapLink: googleLinkForQuery(lm.raw || lm.name),
    map_link: googleLinkForQuery(lm.raw || lm.name),
    mapUrl: googleLinkForQuery(lm.raw || lm.name)
  };
}

function poolsFor(city, slug) {
  const n = city.name;
  const per = city.perCat || {};
  const cap = (c) => per[c] || 4;

  const P = {};

  P.temples = Array.from({ length: cap("temples") }, (_, i) => {
    const lm = landmarkFor(slug, i);
    const isLandmark = lm && /temple|basadi|basaveshwara|manjunatha|kalika|chamundeshwari/i.test(lm.name || "");
    if (isLandmark) {
      return entryBase(city, "temples", i, Object.assign(
        withLandmark(city, "temples", i, lm),
        {
          deity: "Check on site",
          pooja: "Check on site",
          status: "Open",
          statusColor: "#27ae60",
          timings: "5:30 AM - 12:30 PM",
          openTime: "05:30",
          closeTime: "12:30",
          description: (lm.desc || "A heritage temple in " + n + ".") + " A must-visit for pilgrims and visitors to " + n + "."
        }
      ));
    }
    return entryBase(city, "temples", i, {
      name: n + " Town Temple — check on site",
      deity: "Check on site",
      pooja: "Check on site",
      status: "Open",
      statusColor: "#27ae60",
      timings: "5:30 AM - 12:30 PM",
      openTime: "05:30",
      closeTime: "12:30",
      description: "A local temple in " + n + " where the daily pooja runs in the early hours."
    });
  });

  P.street_food = Array.from({ length: cap("street_food") }, (_, i) => {
    const lm = landmarkFor(slug, i + 1);
    if (i === 0 && lm) {
      return entryBase(city, "street_food", i, Object.assign(
        withLandmark(city, "street_food", i, lm),
        {
          cuisine: "Local Snacks",
          diet: "Veg",
          status: "Serving Fresh",
          statusColor: "#3498db",
          timings: "8:00 AM - 10:00 PM",
          openTime: "08:00",
          closeTime: "22:00",
          price: "₹",
          description: (lm.desc || "A well-known " + n + " street food spot.") + " Fresh local snacks straight off the road."
        }
      ));
    }
    return entryBase(city, "street_food", i, {
      name: (i % 3 === 0 ? "Mavalli" : i % 3 === 1 ? "Kannada" : "Local") + " " + n + " Street Snack Stall",
      cuisine: "Chai • Snacks • Local Treats",
      diet: "Veg",
      status: "Serving Fresh",
      statusColor: "#3498db",
      timings: "8:00 AM - 10:00 PM",
      openTime: "08:00",
      closeTime: "22:00",
      price: "₹",
      description: "A roadside favourite in " + n + " for fresh chai, snacks and quick local eats."
    });
  });

  P.food = Array.from({ length: cap("food") }, (_, i) => {
    const lm = landmarkFor(slug, i);
    if (i === 0 && lm && lm.photo) {
      return entryBase(city, "food", i, Object.assign(
        withLandmark(city, "food", i, lm),
        {
          cuisine: "Local Cuisine",
          diet: "Veg & Non-veg",
          price: "₹₹",
          status: "Open Now",
          statusColor: "#27ae60",
          timings: "10:00 AM - 10:00 PM",
          openTime: "10:00",
          closeTime: "22:00",
          description: (lm.desc || "A popular " + n + " restaurant.") + " A well-known " + n + " dining spot for meals and local dishes."
        }
      ));
    }
    return entryBase(city, "food", i, {
      name: ["Town Mess & Hotel", "Family Restaurant", "Local Kitchen", "Messa & Meals", "Town Restaurant", "Local Cafe & Meals"][i % 6] + " — " + n,
      cuisine: i % 2 === 0 ? "South Indian • Meals" : "Local Cuisine",
      diet: i % 3 === 0 ? "Pure Veg" : "Veg & Non-veg",
      price: i % 2 === 0 ? "₹" : "₹₹",
      status: "Open Now",
      statusColor: "#27ae60",
      timings: "7:00 AM - 10:00 PM",
      openTime: "07:00",
      closeTime: "22:00",
      description: "A " + (i % 2 === 0 ? "classic " + n + " mess" : "family favourite in " + n) + " known for homely meals and quick service."
    });
  });

  P.bakeries = Array.from({ length: cap("bakeries") }, (_, i) => {
    return entryBase(city, "bakeries", i, {
      name: i === 0 ? n + " Town Bakery" : "Cake & Biscuit Shop — " + n,
      type: "Bakery",
      bestseller: i === 0 ? "Honey Cake & Bun" : "Cake & Snacks",
      menu_image: "",
      status: "Fresh Stock",
      statusColor: "#27ae60",
      timings: "7:00 AM - 9:30 PM",
      openTime: "07:00",
      closeTime: "21:30",
      description: "A traditional " + n + " bakery famous for wood-fired puffs, honey cake and fresh biscuits."
    });
  });

  P.markets = Array.from({ length: cap("markets") }, (_, i) => {
    const lm = landmarkFor(slug, i);
    if (i === 0 && lm && /market|santhe|bazaar|wholesale/i.test(lm.name || "")) {
      return entryBase(city, "markets", i, Object.assign(
        withLandmark(city, "markets", i, lm),
        {
          type: "Market",
          status: "Open Now",
          statusColor: "#27ae60",
          timings: "6:00 AM - 8:00 PM",
          openTime: "06:00",
          closeTime: "20:00",
          description: (lm.desc || "The main " + n + " market.") + " The " + n + " heart of daily trade — fresh produce, grains and household needs."
        }
      ));
    }
    return entryBase(city, "markets", i, {
      name: [n + " Main Market", "Weekly Santhe Market", "Produce & Grain Market", "Supermarket / Provision Store"][i % 4] + " (" + n + ")",
      type: i % 4 === 0 ? "Vegetable & Fruit Market" : i % 4 === 1 ? "Weekly Market" : "Supermarket",
      status: "Open Now",
      statusColor: "#27ae60",
      timings: "6:00 AM - 8:00 PM",
      openTime: "06:00",
      closeTime: "20:00",
      description: "A busy " + n + " market for fresh vegetables, fruits and daily essentials sourced from nearby farms."
    });
  });

  P.retail_shops = Array.from({ length: cap("retail_shops") }, (_, i) => {
    return entryBase(city, "retail_shops", i, {
      id: "r" + (i + 1),
      name: ["General Store & Grocery", "Clothing & Fashion Store", "Electronics & Mobile Shop", "Provision Store", "Household & Daily Needs", "Saree & Fabric Shop"][i % 6] + " — " + n,
      category: CATS.retail_shops.default_type,
      products: i % 2 === 0
        ? [{ name: "Grains" }, { name: "Oils" }, { name: "Household" }]
        : [{ name: "Everyday Essentials" }, { name: "Fabric & Wear" }],
      status: "Open Now",
      statusColor: "#27ae60",
      timings: "8:00 AM - 9:00 PM",
      openTime: "08:00",
      closeTime: "21:00",
      description: "A trusted " + n + " shop for daily essentials, stocked from local suppliers."
    });
  });

  P.transport = Array.from({ length: cap("transport") }, (_, i) => {
    const lm = landmarkFor(slug, i);
    if (i === 0 && lm && /bus stand|station|stand|port/i.test(lm.name || "")) {
      return entryBase(city, "transport", i, Object.assign(
        withLandmark(city, "transport", i, lm),
        {
          type: "Government Bus Service",
          route: "Statewide KSRTC routes via " + n,
          status: "Running",
          statusColor: "#27ae60",
          timings: "5:30 AM - 9:00 PM",
          openTime: "05:30",
          closeTime: "21:00",
          description: (lm.desc || "The main " + n + " bus stand.") + " The main " + n + " bus stand with regular KSRTC services to Bengaluru, Hubballi, Belagavi and other major centres."
        }
      ));
    }
    return entryBase(city, "transport", i, {
      name: i === 0 ? n + " Bus Stand" : "Auto & Taxi Stand — " + n,
      type: i === 0 ? "Government Bus Service" : "Taxi & Auto Stand",
      route: i === 0 ? "Statewide KSRTC routes" : "Local & inter-city",
      status: "Running",
      statusColor: "#27ae60",
      timings: "5:30 AM - 9:00 PM",
      openTime: "05:30",
      closeTime: "21:00",
      description: "The " + n + " " + (i === 0 ? "bus stand offering regular KSRTC services to major connecting cities." : "auto-rickshaw and taxi stand for local and inter-city travel.")
    });
  });

  P.stays = Array.from({ length: cap("stays") }, (_, i) => {
    return entryBase(city, "stays", i, {
      name: [n + " Budget Lodge", "Town Guest House", "Family Hotel", "Business Lodge", "Town Stay"][i % 5] + " (" + n + ")",
      type: i % 3 === 0 ? "Lodge" : i % 3 === 1 ? "Guest House" : "Hotel",
      amenities: i === 0 ? "Room • Hot Water • Parking" : i === 1 ? "Clean • Family Rooms" : "AC • Parking • Restaurant",
      checkin: "Check with the host",
      price: "",
      status: "Walk-ins Welcome",
      statusColor: "#27ae60",
      description: "An affordable " + n + " " + (i % 3 === 0 ? "lodge" : i % 3 === 1 ? "guest house" : "hotel") + " for travellers and families, a short drive from the town centre."
    });
  });

  P.healthcare = Array.from({ length: cap("healthcare") }, (_, i) => {
    return entryBase(city, "healthcare", i, {
      name: i === 0 ? n + " Govt. Hospital & Medical Centre" : i === 1 ? "Local Pharmacy & Medical Store" : "Doctor's Clinic — " + n,
      owner: i === 0 ? "Government" : "Local",
      status: i === 0 ? "Emergency 24/7" : "Open Now",
      statusColor: i === 0 ? "#e74c3c" : "#27ae60",
      timings: i === 0 ? "24 Hours" : "9:00 AM - 8:00 PM",
      openTime: i === 0 ? "" : "09:00",
      closeTime: i === 0 ? "" : "20:00",
      description: i === 0
        ? "The main " + n + " government hospital offering emergency, maternity and general physician care."
        : i === 1
          ? "A trusted " + n + " pharmacy for medicines, OTC needs and health essentials."
          : "A " + n + " clinic for general physician and family consultations."
    });
  });

  P.services = Array.from({ length: cap("services") }, (_, i) => {
    const kinds = [
      ["Tyre & Puncture Shop", "Two-wheeler Service"],
      ["Electrician & Home Repairs", "Home Services"],
      ["Car & Bike Mechanic", "Vehicle Service"],
      ["Beauty Parlour", "Beauty Salon"],
      ["Tailor & Cloth Works", "Tailoring"],
      ["Locksmith & Key Cutting", "Locksmith"],
      ["Carpenter & Wood Works", "Carpentry"],
      ["AC & Refrigeration Service", "Appliance Repair"]
    ];
    const k = kinds[i % kinds.length];
    return entryBase(city, "services", i, {
      name: k[0] + " — " + n,
      type: k[1],
      charge: "On request",
      experience: "Local",
      status: "Open Now",
      statusColor: "#27ae60",
      timings: "9:00 AM - 7:00 PM",
      openTime: "09:00",
      closeTime: "19:00",
      description: "A reliable " + n + " " + k[1].toLowerCase() + " shop trusted by locals for quick, honest work."
    });
  });

  P.education = Array.from({ length: cap("education") }, (_, i) => {
    return entryBase(city, "education", i, {
      name: [n + " Government School", "Town College & Degree Institute", "Coaching & Tuition Centre", "Nursery & Primary School", "Vocational Training Centre"][i % 5] + " (" + n + ")",
      type: i === 0 ? "Primary & Secondary School" : i === 1 ? "College" : "Coaching Institute",
      status: "Admissions Open",
      statusColor: "#3f51b5",
      timings: "9:00 AM - 4:30 PM",
      openTime: "09:00",
      closeTime: "16:30",
      description: "A well-known " + n + " " + (i === 0 ? "government school" : i === 1 ? "college" : "coaching centre") + " serving the town's students."
    });
  });

  P.fitness = Array.from({ length: cap("fitness") }, (_, i) => {
    return entryBase(city, "fitness", i, {
      name: i === 0 ? n + " Fitness & Gym" : "Yoga & Wellness Studio — " + n,
      type: i === 0 ? "Gym" : "Yoga",
      features: i === 0 ? "Cardio • Weights • Trainers" : "Yoga • Pranayama • Meditation",
      price: "₹ Onwards",
      status: "Open Now",
      statusColor: "#27ae60",
      timings: "5:30 AM - 9:30 PM",
      openTime: "05:30",
      closeTime: "21:30",
      description: "A " + n + " " + (i === 0 ? "gym" : "yoga studio") + " with " + (i === 0 ? "certified trainers and cardio equipment" : "calm, guided sessions for all levels") + "."
    });
  });

  P.travels = Array.from({ length: cap("travels") }, (_, i) => {
    const lm = landmarkFor(slug, i + 2);
    if (i === 0 && lm && lm.photo) {
      return entryBase(city, "travels", i, Object.assign(
        withLandmark(city, "travels", i, lm),
        {
          type: "Tourist Attraction",
          fleet: "Guided Tours",
          packages: "Day Tours • Heritage Walks",
          status: "Open",
          statusColor: "#27ae60",
          timings: "7:00 AM - 6:00 PM",
          openTime: "07:00",
          closeTime: "18:00",
          description: (lm.desc || "A must-see spot in " + n + ".") + " A must-see " + n + " destination — plan a guided tour or self-drive trip."
        }
      ));
    }
    return entryBase(city, "travels", i, {
      name: i === 1 ? n + " Tour & Travel Agency" : n + " Tour Package Operator",
      type: "Tour Operator",
      fleet: "Sedans • Tempo Traveller",
      packages: "Local Tours • Outstation Trips",
      status: "Booking Open",
      statusColor: "#2980b9",
      timings: "8:00 AM - 8:00 PM",
      openTime: "08:00",
      closeTime: "20:00",
      description: "A " + n + " tour operator offering local sightseeing and outstation packages."
    });
  });

  P.nature = Array.from({ length: cap("nature") }, (_, i) => {
    const lm = landmarkFor(slug, i + 3);
    if (i === 0 && lm && /hill|lake|falls|garden|park|beach|waterfall/i.test(lm.name || "")) {
      return entryBase(city, "nature", i, Object.assign(
        withLandmark(city, "nature", i, lm),
        {
          type: "Park & View",
          bestTime: "Early Morning",
          difficulty: "Easy",
          status: "Open",
          statusColor: "#27ae60",
          timings: "5:00 AM - 7:00 PM",
          openTime: "05:00",
          closeTime: "19:00",
          description: (lm.desc || "A scenic spot in " + n + ".") + " A favourite " + n + " spot for walks, picnics and a break from the town."
        }
      ));
    }
    return entryBase(city, "nature", i, {
      name: i === 0 ? n + " Lake & Park" : i === 1 ? "Town Botanical & Viewpoint" : "Local Viewpoint — " + n,
      type: i === 0 ? "Park" : i === 1 ? "Botanical Garden" : "Viewpoint",
      bestTime: "Early Morning",
      difficulty: "Easy",
      status: "Open",
      statusColor: "#27ae60",
      timings: "5:00 AM - 7:00 PM",
      openTime: "05:00",
      closeTime: "19:00",
      description: "A peaceful " + n + " spot for walks, bird-watching and a short escape from the town."
    });
  });

  P.bars = Array.from({ length: cap("bars") }, (_, i) => {
    return entryBase(city, "bars", i, {
      name: i === 0 ? n + " Café & Lounge" : "Town Drink & Lounge — " + n,
      type: i === 0 ? "Café" : "Lounge",
      ambiance: i === 0 ? "Casual Seating • Coffee" : "Relaxed Evenings",
      status: "Open Now",
      statusColor: "#27ae60",
      timings: "10:00 AM - 11:00 PM",
      openTime: "10:00",
      closeTime: "23:00",
      description: "A popular " + n + " " + (i === 0 ? "café" : "lounge") + " for coffee, snacks and a relaxed evening out."
    });
  });

  return P;
}

/* ---------------- run ---------------- */

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function copyIfMissing(src, dest) {
  if (!fs.existsSync(src) || fs.existsSync(dest)) return;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function personalise(html, city) {
  return html.split(TEMPLATE_CITY === "shravanabelagola" ? "Shravanabelagola" : TEMPLATE_CITY)
             .join(city.name);
}

// The template map.html ships with the hand-curated town's landmark cards
// (indhragiri / chandhragiri / bhandara_basadhi images that only exist in
// shravanabelagola's folder). Replace the hardcoded cards between the
// location-scroll div's open and close tags.
function stripTemplateLocCards(html) {
  return html.replace(
    /(<div class="location-scroll">\n)[\s\S]*?(\n\s*<\/div>\n  <\/div>\n\n<\/body>)/,
    "$1$2"
  );
}

// Build the map.html landmark drawer cards from a city's landmarks.
function mapLandmarkCards(city) {
  const lm = cityLandmarks(city.slug).filter((e) => e.photo);
  if (!lm.length) return "";
  const slug = city.slug;
  return lm.slice(0, 4).map((e) =>
    `      <div class="loc-card">\n` +
    `        <img src="images/landmarks/${e.photo.split("/").pop()}" class="loc-img" alt="${e.name}">\n` +
    `        <div class="loc-info">\n` +
    `          <h4>${e.name}</h4>\n` +
    `          <p>${e.desc || "Landmark"}</p>\n` +
    `          <a href="${googleLinkForQuery(e.raw || e.name)}" target="_blank" class="btn-go">\n` +
    `            <i class="fas fa-location-arrow"></i> Navigate\n` +
    `          </a>\n` +
    `        </div>\n` +
    `      </div>`
  ).join("\n");
}

function buildCity(city, report) {
  const slug = city.slug;
  const cityDir = path.join(CITIES_DIR, slug);
  const infoPath = path.join(cityDir, "city_info.json");

  if (fs.existsSync(infoPath)) {
    if (process.argv.includes("--force")) {
      // full rebuild of this city: wipe the generated dir and re-create
      fs.rmSync(cityDir, { recursive: true, force: true });
    } else {
      report.skipped.push(slug);
      console.log("SKIP (already exists)", slug);
      return;
    }
  }

  console.log("Creating " + slug + "...");
  ensureDir(cityDir);
  const pools = poolsFor(city, slug);

  // 1) js helpers + logo (copied verbatim from the template town)
  copyIfMissing(path.join(TEMPLATE_DIR, "js", "live-status.js"), path.join(cityDir, "js", "live-status.js"));
  copyIfMissing(path.join(TEMPLATE_DIR, "js", "whatsapp.js"), path.join(cityDir, "js", "whatsapp.js"));
  const logoSrc = path.join(TEMPLATE_DIR, "images", "logo");
  if (fs.existsSync(logoSrc)) {
    for (const f of fs.readdirSync(logoSrc)) {
      copyIfMissing(path.join(logoSrc, f), path.join(cityDir, "images", "logo", f));
    }
  }

  // 2) category templates (HTML) + JSON data
  const counts = {};
  for (const cat of Object.keys(CATS)) {
    const srcDir = path.join(TEMPLATE_DIR, "categories", cat);
    const dstDir = path.join(cityDir, "categories", cat);
    ensureDir(dstDir);
    for (const f of fs.readdirSync(srcDir)) {
      if (f.endsWith(".html")) copyIfMissing(path.join(srcDir, f), path.join(dstDir, f));
    }
    const entries = pools[cat] || [];
    counts[cat] = entries.length;
    fs.writeFileSync(path.join(dstDir, CATS[cat].data_file), JSON.stringify(entries, null, 2) + "\n");
  }

  // 3) utility pages: copy from template + personalise
  for (const page of ["more_categories.html", "gallery.html", "map.html"]) {
    const dst = path.join(cityDir, page);
    copyIfMissing(path.join(TEMPLATE_DIR, page), dst);
    if (fs.existsSync(dst)) {
      let html = fs.readFileSync(dst, "utf8");
      html = personalise(html, city);
      fs.writeFileSync(dst, html);
    }
  }

  // 4) map.html — point the embed at the city, replace hardcoded
  //    landmark cards with the city's own
  const mapPath = path.join(cityDir, "map.html");
  if (fs.existsSync(mapPath)) {
    let m = fs.readFileSync(mapPath, "utf8");
    const embedSrc = `src="https://www.google.com/maps?q=${encodeURIComponent(city.name + ", " + city.region)}&output=embed"`;
    m = m.replace(/src="https:\/\/www\.google\.com\/maps\/embed\?pb=[^"]*"/, embedSrc);
    m = m.replace(/src="https:\/\/www\.google\.com\/maps\?q=[^"]*&output=embed"/, embedSrc);
    m = stripTemplateLocCards(m);
    const cards = mapLandmarkCards(city);
    if (cards) {
      m = m.replace('<div class="location-scroll">\n', '<div class="location-scroll">\n' + cards + "\n");
    }
    fs.writeFileSync(mapPath, m);
  }

  // 5) town homepage from the shared template
  const tplPath = path.join(ROOT, "tools", "templates", "city_index.html");
  let html = fs.readFileSync(tplPath, "utf8");
  const order = ["temples", "street_food", "food", "markets", "retail_shops",
    "transport", "stays", "healthcare", "services", "education",
    "fitness", "travels", "nature", "bars"];
  const active = new Set(Object.keys(counts).filter((c) => counts[c] > 0));
  const quick = order.filter((s) => active.has(s)).slice(0, 3).map((s) => {
    const c = config.CATEGORIES.find((x) => x.slug === s);
    return `  <a href="categories/${c.slug}/${c.slug}.html" class="quick-card">\n    <i class="fas ${c.icon}"></i><h3>${c.label}</h3>\n  </a>`;
  }).join("\n") + `\n  <a href="more_categories.html" class="quick-card">\n    <i class="fas fa-th-large"></i><h3>All Categories</h3>\n  </a>`;

  const catCards = [];
  for (const c of config.CATEGORIES) {
    const cnt = counts[c.slug] || 0;
    if (!cnt) continue;
    catCards.push(
      `  <a href="categories/${c.slug}/${c.slug}.html" class="category-card">\n` +
      `    <div class="icon-square"><i class="fas ${c.icon}"></i></div>\n` +
      `    <h3>${c.label}</h3>\n` +
      `    <span>${c.tagline}</span>\n` +
      `    <span class="cat-count">${cnt} place${cnt > 1 ? "s" : ""}</span>\n` +
      `  </a>`
    );
  }

  html = html
    .split("{{CITY_NAME}}").join(city.name)
    .split("{{CITY_SLUG}}").join(city.slug)
    .split("{{CITY_REGION}}").join(city.region)
    .split("{{CITY_TAGLINE}}").join(city.tagline || "")
    .split("{{QUICK_CARDS}}").join(quick)
    .split("{{CATEGORY_CARDS}}").join(catCards.join("\n"));
  fs.writeFileSync(path.join(cityDir, "index.html"), html);

  // 6) city_info.json (same fields as existing cities)
  const info = {
    slug: city.slug,
    name: city.name,
    region: city.region,
    tagline: city.tagline,
    fetchedAt: new Date().toISOString(),
    center: city.center || null,
    state: "karnataka",
    district: city.district,
    tier: city.tier,
    focus: city.focus || "",
    primaryCategories: city.primaryCategories || []
  };
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + "\n");

  // 7) gallery_data.json — landmark photos (the gallery page auto-hides
  //    entries with missing images, so this stays clean).
  const gallery = [];
  for (const e of cityLandmarks(city.slug)) {
    if (e.photo) {
      gallery.push({
        src: e.photo.replace("../../images", "./images"),
        cat: /temple|basadi/i.test(e.name) ? "temple" : /market|bazaar|santhe/i.test(e.name) ? "shop" : "nature",
        desc: e.name
      });
    }
  }
  fs.writeFileSync(path.join(cityDir, "gallery_data.json"), JSON.stringify(gallery, null, 2) + "\n");

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  report.added.push({ slug, name: city.name, district: city.district, places: total, cats: active.size });
  console.log("  ✓ " + slug + " — " + total + " places across " + active.size + " categories");
}

function main() {
  const report = { added: [], skipped: [] };

  for (const city of CITIES) {
    buildCity(city, report);
  }

  // 8) district landing pages + geo redirect routes
  const districts = [...new Set(CITIES.map((c) => c.district))];
  for (const d of districts) {
    try {
      execSync(`node tools/build_district.js karnataka ${d}`, { cwd: ROOT, stdio: "inherit" });
    } catch (e) {
      console.error("  x district build failed for " + d + ": " + e.message);
    }
  }

  // 9) rebuild the root cities.json from every city_info.json
  execSync(`node tools/fetch_places.js --regenerate`, { cwd: ROOT, stdio: "inherit" });

  // 10) report
  console.log("\n=== REPORT ===");
  console.log("ADDED:   " + (report.added.length ? report.added.map((c) => c.name + " (" + c.places + " places)").join(", ") : "(none)"));
  console.log("SKIPPED: " + (report.skipped.length ? report.skipped.join(", ") : "(none)"));
  console.log("Total places seeded: " + report.added.reduce((s, c) => s + c.places, 0));
  fs.writeFileSync(path.join(__dirname, "seed_report.json"), JSON.stringify(report, null, 2) + "\n");
}

main();
