# Vihara — Town Guide for Every Town

A fully static website that showcases towns across India — temples, street food,
markets, shops, transport, stays, healthcare and local services. Visitors browse
by town and category, then **Call, WhatsApp, or navigate** to any business
directly.

No backend, no build step — just HTML, CSS and vanilla JavaScript. Hosted for
free on GitHub Pages.

## 🚀 Host it on GitHub Pages

1. Upload **all** the files in this folder (keep the folder structure exactly
   as-is, with `index.html` at the top).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** = *Deploy from a branch*,
   **Branch** = `main`, **Folder** = `/ (root)`, then **Save**.
4. Wait a minute — your site goes live at
   `https://<your-username>.github.io/<repo-name>/`.

> `404.html` doubles as the "page not found" screen **and** redirects old
> Shravanabelagola URLs to the new `cities/shravanabelagola/` folder.

## 📁 Folder structure

```
.
├── index.html            # Universal homepage — pick a town
├── cities.json           # Town list (drives the homepage) — auto-generated
├── cities/               # One folder per town
│   └── <town>/
│       ├── index.html          # Town homepage (auto-generated for new towns)
│       ├── city_info.json      # Town meta (name, region, tagline)
│       ├── more_categories.html
│       ├── gallery.html + gallery_data.json
│       ├── map.html
│       ├── js/                 # Shared helpers (live-status, whatsapp)
│       ├── images/<category>/  # Photos
│       └── categories/<name>/
│           ├── <name>.html          # Listing page (reads the JSON below)
│           ├── <name>_details.html  # Single-place detail page
│           └── <name>_data.json     # The place data for that category
├── tools/                # Google Places auto-fetcher (Node, no deps)
│   ├── fetch_places.js
│   ├── config.js
│   └── templates/city_index.html
├── aboutus.html, privacy.html, add_button.html
└── 404.html
```

## 🏙️ Adding a new town automatically (Google Places)

The repo ships with a zero-dependency Node script that discovers a town's shops,
temples, stays and services from the **Google Places API (New)** and writes them
into the exact Vihara structure — categories, JSON data, photos and pages.

Requirements:
- Node.js 18+ (built-in `fetch`).
- A Google Cloud project with the **Places API (New)** enabled and **billing
  turned on** (Text Search (New) + Place Photos (New)).

Run it:

```bash
# from this folder
node tools/fetch_places.js Hassan --state Karnataka --key AIza...
```

It will:
1. Create `cities/hassan/` and copy the design templates (category pages + `js/`)
   from the hand-curated Shravanabelagola town.
2. Search Google for each of the 15 categories, dedupe, and download photos.
3. Write each category's `_data.json` in the existing schema.
4. Generate the town homepage, category grid, gallery and map page.
5. Update `cities.json` so the universal homepage shows the new town.

Other options:

```bash
node tools/fetch_places.js Hassan --key AIza... --categories food,stays,temples
node tools/fetch_places.js --regenerate            # rebuild cities.json only
```

> Set the API key with `--key` or the `GOOGLE_PLACES_API_KEY` environment
> variable. It is used only at fetch time — the key never ships with the site.

## ✏️ Adding or editing a place by hand

Open the town's category `_data.json` (e.g.
`cities/shravanabelagola/categories/food/food_data.json`) and add an object:

```json
{
  "id": "food9",
  "name": "New Restaurant",
  "image": "../../images/food/new_restaurant.jpg",
  "location": "Main Road, Shravanabelagola",
  "phone": "+919999999999",
  "mapLink": "https://www.google.com/maps/search/?api=1&query=New+Restaurant+Shravanabelagola",
  "status": "Open Now",
  "statusColor": "#27ae60",
  "timings": "9:00 AM - 9:00 PM",
  "description": "Short description shown on the details page."
}
```

- **`phone`** powers both the **Call** and **WhatsApp** buttons. Use the full
  international format: `+91` + number.
- **`image`** — drop the photo into the matching `images/<category>/` folder and
  point to it. If the image is missing, the card falls back to a placeholder.

## 🗺️ Geographic taxonomy (states → districts → tiers → towns)

Beyond the flat `cities/<town>/` folders, a data-driven taxonomy gives each town a
**canonical geo route** (`/<state>/<district>/<town>/`) and a **tier** (1–4) that
groups towns by commercial weight. The physical site keeps working off
`cities/<town>/`; the geo URLs are thin redirect pages generated from the config.

```
data/
└── locations/
    └── <state>/              e.g. karnataka/
        └── <district>.json   e.g. hassan.json   ← single source of truth
```

A district config (`data/locations/karnataka/hassan.json`) defines:

- `state` / `district` / `blurb` — breadcrumb + hero copy.
- `tiers` — the 4 tier objects (name, tagline, icon).
- `towns` — each with `slug`, `name`, `tier` (1–4), `focus`, and
  `primaryCategories` (the Vihara category slugs the town is known for).

This config is the **single source of truth**. Two tools consume it:

```bash
# Build the district landing page + geo redirect pages for every town:
node tools/build_district.js karnataka hassan
node tools/build_district.js --all            # every state/district

# The fetcher reads it too — running it for a town that appears in a district
# config automatically tags the town's city_info.json and cities.json with
# state / district / tier / focus.
node tools/fetch_places.js Channarayapatna --key AIza...
```

Outputs:

- `karnataka/hassan/index.html` — data-driven landing page grouping the
  district's towns by tier (live place-counts pulled from `cities.json`).
- `karnataka/hassan/<town>/index.html` — instant redirect to `cities/<town>/`.
- `cities/<town>/city_info.json` and `cities.json` — enriched with
  `state`, `district`, `tier`, `focus`, `primaryCategories`, so the universal
  homepage can show tier badges and district labels.

## 📥 How "Add your place" works

`add_button.html` has a form. When a business owner fills it in and taps **Send**,
WhatsApp opens with all the details pre-formatted, sent to the site owner's number.

👉 **Set your own WhatsApp number:** open `add_button.html` and change the
`ADMIN_WHATSAPP` value near the bottom of the file.

## 🖥️ Run it locally

The pages load data with `fetch()`, so opening the HTML directly (`file://`)
won't load the JSON. Serve it over HTTP instead:

```bash
# from this folder
python -m http.server 8000
# or
npx serve .
# then open http://localhost:8000
```

## 🔧 Things to personalise

- Replace `ADMIN_WHATSAPP` in `add_button.html` with your real number.
- Update the footer contact (email / phone) in `index.html`.
- Tune `tools/config.js` (search queries, categories, limits) for each town.
- Large images in `images/logo/` and `images/story/` are several MB each —
  compressing them will make the site load faster.
