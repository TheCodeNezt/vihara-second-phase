#!/usr/bin/env node
/* One-shot: fetch real place IDs + photos for well-known landmarks
   in the 10 new cities (used by add_cities.js to seed data with
   genuine place coordinates and real photos). */
"use strict";
const fs = require("fs");
const path = require("path");

const key = fs.readFileSync(process.env.HOME + "/.local/share/maps_api.key", "utf8").trim();

const TARGETS = [
  // [slug, name, imageFile, altDesc]
  ["mysuru", "Chamundi Temple, Mysore", "chamundi_temple.jpg", "Chamundi Devi Temple atop Chamundi Hill"],
  ["mysuru", "Mysore Palace, Mysore", "mysore_palace.jpg", "Amba Vilasa Palace, the royal darbar hall"],
  ["mysuru", "Devaraja Market, Mysore", "devaraja_market.jpg", "Devaraja Junction market — gold, silk and antiques"],
  ["mysuru", "Chamundi Hills, Mysore", "chamundi_hills.jpg", "Chamundi Hills overlook"],
  ["mysuru", "Brindavan Garden, Mysore", "brindavan_garden.jpg", "Sri Brindavan Garden on the Kaveri"],
  ["mysuru", "Karanji Lake, Mysore", "karanji_lake.jpg", "Karanji Lake and Bird Sanctuary"],
  ["mangaluru", "St. Aloysi Church, Mangalore", "st_alloysi_church.jpg", "St. Aloysius Cathedral on Goglan Hill"],
  ["mangaluru", "Mangaluru Central Market", "central_market.jpg", "Mangaluru's central market"],
  ["mangaluru", "Mangaluru Port", "mangaluru_port.jpg", "Mangaluru harbour"],
  ["mangaluru", "Kadri Manjunatha Temple, Mangalore", "kadari_majunarasa.jpg", "Kadri Manjunatha Temple"],
  ["mangaluru", "Mangaluru Beach", "mangaluru_beach.jpg", "Mangaluru harbour beach"],
  ["mangaluru", "Mangaluru Port & Waterfront", "mangaluru_harbour.jpg", "Mangaluru harbour"],
  ["hubballi", "Hubballi Bus Stand", "hubballi_bus_stand.jpg", "Hubballi bus stand"],
  ["hubballi", "Ganapathi Temple, Hubli", "ganapathi_temple.jpg", "Ganapathi Temple, Hubballi"],
  ["hubballi", "Hubballi Central Market", "hubballi_market.jpg", "Hubballi's central market"],
  ["hubballi", "Pramodamba Temple, Hubli", "pramodamba_temple.jpg", "Pramodamba Temple, Hubballi"],
  ["hubballi", "Dharwad City", "dharwad_city.jpg", "Dharwad old town"],
  ["belagavi", "Margaeshwara Temple, Belgaum", "margaesvara_temple.jpg", "Margaeshwara Temple, Belagavi"],
  ["belagavi", "Belagavi Old Market", "belagavi_market.jpg", "Belagavi old town market"],
  ["belagavi", "Belagavi Bus Stand", "belagavi_bus_stand.jpg", "Belagavi bus stand"],
  ["belagavi", "Margaeshwara Temple, Belgaum", "belagavi_temple.jpg", "Margaeshwara Temple"],
  ["shivamogga", "Talakadu, Karnataka", "talakadu.jpg", "Talakadu — the city of lost kings"],
  ["shivamogga", "Kodagu Waterfalls, Karnataka", "kodagu_waterfalls.jpg", "Kodagu waterfalls and forests"],
  ["shivamogga", "Kushalnagar, Karnataka", "kushalnagar.jpg", "Kushalnagar lake and forest"],
  ["shivamogga", "Shivamogga City Market", "shivamogga_market.jpg", "Shivamogga's main market"],
  ["shivamogga", "Talakadu", "talakadu_ruins.jpg", "Talakadu ruins"],
  ["kalaburagi", "Chaturbhujendra Basadi, Kalaburagi", "chaturbhujendra.jpg", "Chaturbhujendra Basadi, Kalaburagi"],
  ["kalaburagi", "Shravanabelagola", "kalaburagi_old_market.jpg", "Kalaburagi's old market"],
  ["kalaburagi", "Kalaburagi City Market", "kalaburagi_market.jpg", "Kalaburagi market"],
  ["kalaburagi", "Kalaburagi Old Market", "kalaburagi_bazaar.jpg", "Kalaburagi bazaar"],
  ["ballari", "Sri Rukmini Kalika Temple, Ballari", "sri_rukmini_kalika.jpg", "Sri Rukmini Kalika Temple, Ballari"],
  ["ballari", "Ballari Rock Caves", "ballari_rock_caves.jpg", "Ballari rock-cut cave temples"],
  ["ballari", "Ballari Bazaar", "ballari_bazaar.jpg", "Ballari's main bazaar"],
  ["ballari", "Ballari Old City", "ballari_old_city.jpg", "Ballari's old city"],
  ["ballari", "Ballari Bus Stand", "ballari_bus_stand.jpg", "Ballari bus stand"],
  ["tumakuru", "Tumakuru Bus Stand", "tumakuru_bus_stand.jpg", "Tumakuru bus stand"],
  ["tumakuru", "Tumakuru Market", "tumakuru_market.jpg", "Tumakuru market"],
  ["tumakuru", "Tumakuru Old City", "tumakuru_old_city.jpg", "Tumakuru old city"],
  ["tumakuru", "Tumakuru Railway Station", "tumakuru_railway.jpg", "Tumakuru railway station"],
  ["tumakuru", "Tumakuru City Market", "tumakuru_city_market.jpg", "Tumakuru market"],
  ["davanagere", "Davanagere Market", "davanagere_market.jpg", "Davanagere market"],
  ["davanagere", "Davanagere Old City", "davanagere_old_city.jpg", "Davanagere's old city"],
  ["davanagere", "Davanagere Bus Stand", "davanagere_bus_stand.jpg", "Davanagere bus stand"],
  ["davanagere", "Davanagere City", "davanagere_city.jpg", "Davanagere city centre"],
  ["davanagere", "Davanagere Market", "davanagere_bazaar.jpg", "Davanagere bazaar"],
  ["hassan", "Hassan Bus Stand", "hassan_bus_stand.jpg", "Hassan bus stand"],
  ["hassan", "Hassan City Market", "hassan_market.jpg", "Hassan market"],
  ["hassan", "Hassan Old City", "hassan_old_city.jpg", "Hassan's old city"],
  ["hassan", "Hassan Lake", "hassan_lake.jpg", "Hassan's lake"],
  ["hassan", "Hassan Railway Station", "hassan_railway.jpg", "Hassan railway station"]
];

async function getPlace(query, center) {
  const body = {
    textQuery: query,
    pageSize: 1,
    languageCode: "en",
    regionCode: "IN"
  };
  if (center) {
    body.locationBias = {
      circle: {
        center: { latitude: center.latitude, longitude: center.longitude },
        radius: 30000
      }
    };
  }
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.photos,nextPageToken"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("HTTP " + res.status + " — " + t.slice(0, 300));
  }
  const d = await res.json();
  return d.places && d.places[0] ? d.places[0] : null;
}

async function downloadPhoto(place, city, file) {
  const photo = place.photos && place.photos[0];
  if (!photo) return false;
  const imgDir = path.join(__dirname, "..", "..", "cities", city, "images", "landmarks");
  fs.mkdirSync(imgDir, { recursive: true });
  const url = `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=640&maxWidthPx=640`;
  const res = await fetch(url, { headers: { "Accept": "image/*", "X-Goog-Api-Key": key } });
  if (!res.ok) throw new Error("photo HTTP " + res.status);
  fs.writeFileSync(path.join(imgDir, file), Buffer.from(await res.arrayBuffer()));
  return true;
}

async function main() {
  const out = {};
  for (const [city, q, file, desc] of TARGETS) {
    try {
      const p = await getPlace(q);
      if (!p) { console.log("MISS", q); continue; }
      const hasPhoto = p.photos && p.photos.length > 0;
      let photoDownloaded = false;
      if (hasPhoto) {
        try { await downloadPhoto(p, city, file); photoDownloaded = true; }
        catch (e) { console.log("photo fail", q, e.message); }
      }
      out[city + ":" + file] = {
        name: p.displayName.text,
        placeId: p.id,
        location: p.location || null,
        photo: photoDownloaded ? `../../images/landmarks/${file}` : "",
        raw: q,
        desc
      };
      console.log("ok  ", q, "→", p.displayName.text, photoDownloaded ? "(photo)" : "(no photo)");
    } catch (e) {
      console.log("ERR ", q, ":", e.message.slice(0, 200));
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  fs.writeFileSync(path.join(__dirname, "landmarks.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("\nWrote landmarks.json with", Object.keys(out).length, "entries.");
}

main().catch((e) => { console.error(e); process.exit(1); });
