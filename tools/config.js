/* =========================================================
   Vihara — fetcher configuration
   ---------------------------------------------------------
   Defines the 15 categories, the Google Places search queries
   used to discover places for each, and the extra JSON fields
   each category's templates expect.

   Queries use {city} and {state} placeholders that are replaced
   with the actual town name when a fetch runs.
   ========================================================= */

"use strict";

module.exports = {
  // Google Places API (New) — Text Search field mask.
  FIELD_MASK: [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.types",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.googleMapsUri",
    "places.location",
    "places.rating",
    "places.userRatingCount",
    "places.priceLevel",
    "places.regularOpeningHours",
    "places.businessStatus",
    "places.photos",
    "places.editorialSummary",
    "nextPageToken"
  ].join(","),

  // Results are biased to a circle around the town centre and anything
  // farther than this (km) is dropped, so distant villages in the same
  // district don't pollute a town's directory.
  MAX_RADIUS_KM: 10,

  // Google's data is noisy for small towns — community organisations and
  // generic spots often get mis-tagged as places of worship etc. Names
  // matching any of these are dropped. Extend this list as needed.
  NAME_BLACKLIST: [
    /astro|naadi|astrology/i,
    /brahmana sangha|brahmin sangha/i,
    /prajwal/i,
    /^dhanush\b/i,
    /^devasthana$/i,
    /^mandir$|^temple$|^church$|^masjid$|^mosque$/i
  ],

  // Maximum text-search pages fetched per category (20 results each).
  MAX_PAGES_PER_CATEGORY: 3,

  // Delay between API calls (ms) to stay inside free quota.
  API_DELAY_MS: 400,

  // Delay before requesting the next text-search page (ms).
  NEXT_PAGE_DELAY_MS: 1500,

  // Where the original (hand-curated) town lives. Its HTML pages and
  // js/ helpers are copied from here as templates for new towns.
  TEMPLATE_CITY: "shravanabelagola",

  // Vihara's 15 categories.
  CATEGORIES: [
    {
      slug: "temples",
      label: "Temples",
      tagline: "Heritage & Basadis",
      icon: "fa-gopuram",
      queries: [
        "temples in {city}",
        "basadis in {city}",
        "places of worship in {city}"
      ],
      // Only specific religious types qualify — the generic
      // "place_of_worship" tag alone is unreliable in small towns.
      types: ["hindu_temple", "church", "mosque", "jain_temple", "temple"],
      defaults: {
        deity: "Heritage Temple",
        pooja: "Check on site"
      }
    },
    {
      slug: "street_food",
      label: "Street Food",
      tagline: "Local Snacks",
      icon: "fa-bowl-food",
      queries: [
        "street food in {city}",
        "food stalls in {city}",
        "chat bhandar in {city}"
      ],
      types: ["restaurant", "food", "meal_delivery"],
      defaults: { speciality: "" }
    },
    {
      slug: "food",
      label: "Food & Dining",
      tagline: "Messes & Hotels",
      icon: "fa-utensils",
      queries: [
        "restaurants in {city}",
        "hotels in {city}",
        "pure veg restaurants in {city}",
        "meals and mess in {city}"
      ],
      types: ["restaurant", "meal_takeaway", "meal_delivery", "food"],
      defaults: {
        cuisine: "Local Cuisine",
        diet: "Veg & Non-veg"
      }
    },
    {
      slug: "bakeries",
      label: "Bakeries",
      tagline: "Cakes & Snacks",
      icon: "fa-cake-candles",
      queries: [
        "bakeries in {city}",
        "cake shops in {city}",
        "biscuit and bakery in {city}"
      ],
      types: ["bakery", "store"],
      defaults: {
        type: "Bakery",
        bestseller: "",
        menu_image: ""
      }
    },
    {
      slug: "markets",
      label: "Markets",
      tagline: "Vegetables & More",
      icon: "fa-basket-shopping",
      queries: [
        "markets in {city}",
        "vegetable markets in {city}",
        "supermarkets in {city}",
        "weekly santhe in {city}"
      ],
      types: ["supermarket", "shopping_mall", "market", "store"],
      defaults: { type: "Market" }
    },
    {
      slug: "retail_shops",
      label: "Retail Shops",
      tagline: "Daily Groceries",
      icon: "fa-store",
      queries: [
        "grocery stores in {city}",
        "general stores in {city}",
        "clothing shops in {city}",
        "electronics shops in {city}",
        "provision stores in {city}"
      ],
      types: ["store", "grocery_or_supermarket", "clothing_store",
              "electronics_store", "shopping_mall"],
      defaults: {
        products: "",
        openTime: "",
        closeTime: ""
      }
    },
    {
      slug: "transport",
      label: "Transport",
      tagline: "Bus, Auto & Cabs",
      icon: "fa-bus",
      queries: [
        "bus stand in {city}",
        "taxi stand in {city}",
        "auto stand in {city}",
        "railway station in {city}",
        "travel agencies in {city}"
      ],
      types: ["bus_station", "transit_station", "taxi_stand", "travel_agency"],
      defaults: {
        type: "Transport",
        route: ""
      }
    },
    {
      slug: "stays",
      label: "Stays",
      tagline: "Lodges & Rooms",
      icon: "fa-bed",
      queries: [
        "hotels in {city}",
        "lodges in {city}",
        "guest houses in {city}",
        "homestays in {city}",
        "dharamshala in {city}"
      ],
      types: ["lodging", "hotel", "hostel", "motel", "campground"],
      defaults: {
        type: "Stay",
        amenities: "",
        checkin: "Check with the host",
        price: ""
      }
    },
    {
      slug: "healthcare",
      label: "Healthcare",
      tagline: "Clinics & Meds",
      icon: "fa-heart-pulse",
      queries: [
        "hospitals in {city}",
        "clinics in {city}",
        "pharmacies in {city}",
        "medical stores in {city}",
        "doctors in {city}"
      ],
      types: ["hospital", "doctor", "pharmacy", "dentist", "health"],
      defaults: { owner: "" }
    },
    {
      slug: "services",
      label: "Services",
      tagline: "Repairs & More",
      icon: "fa-briefcase",
      queries: [
        "electricians in {city}",
        "plumbers in {city}",
        "repair services in {city}",
        "beauty parlours in {city}",
        "tailors in {city}",
        "car mechanics in {city}",
        "locksmiths in {city}"
      ],
      types: [],
      defaults: {
        type: "Service",
        charge: "",
        experience: ""
      }
    },
    {
      slug: "education",
      label: "Education",
      tagline: "Schools & Tuitions",
      icon: "fa-graduation-cap",
      queries: [
        "schools in {city}",
        "colleges in {city}",
        "coaching institutes in {city}",
        "tuition classes in {city}"
      ],
      types: ["school", "university", "secondary_school", "primary_school",
              "college_university", "tutoring_center"],
      defaults: { type: "Education" }
    },
    {
      slug: "fitness",
      label: "Fitness",
      tagline: "Gym & Yoga",
      icon: "fa-dumbbell",
      queries: [
        "gyms in {city}",
        "fitness centres in {city}",
        "yoga classes in {city}"
      ],
      types: ["gym", "health"],
      defaults: {
        type: "Fitness",
        features: "",
        price: ""
      }
    },
    {
      slug: "travels",
      label: "Travels",
      tagline: "Tour Operators",
      icon: "fa-map-marked-alt",
      queries: [
        "tourist attractions in {city}",
        "tour operators in {city}",
        "travel agencies in {city}"
      ],
      types: ["tourist_attraction", "travel_agency"],
      defaults: {
        type: "Travel",
        fleet: "",
        packages: ""
      }
    },
    {
      slug: "nature",
      label: "Nature",
      tagline: "Parks & Views",
      icon: "fa-tree",
      queries: [
        "parks in {city}",
        "lakes in {city}",
        "hills in {city}",
        "gardens in {city}",
        "view points in {city}"
      ],
      types: ["park", "natural_feature", "tourist_attraction"],
      defaults: {
        type: "Nature",
        bestTime: "Early morning",
        difficulty: "Easy"
      }
    },
    {
      slug: "bars",
      label: "Bars",
      tagline: "Drinks & Lounges",
      icon: "fa-wine-glass",
      queries: [
        "bars in {city}",
        "pubs in {city}",
        "wine shops in {city}"
      ],
      types: ["bar", "restaurant", "liquor_store"],
      defaults: {
        type: "Bar",
        ambiance: ""
      }
    }
  ]
};
