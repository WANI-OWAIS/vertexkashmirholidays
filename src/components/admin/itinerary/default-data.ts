import { DEFAULT_HOTEL_IMAGES, ItineraryData } from "@/types/itinerary";

// Stable ids for the seed document. New rows added in the editor get runtime ids
// via genId(); these fixed ids keep the default deterministic.
export const DEFAULT_ITINERARY_DATA: ItineraryData = {
  coverTitle: "KASHMIR",
  subtitle: "Escape",
  duration: "5 NIGHTS · 6 DAYS",
  preparedFor: "Mr Farooq Sheikh",
  travelDates: "10 - 15 JUNE 2026",
  travelers: "2 ADULTS · 1 CHILD",
  packageType: "PREMIUM PACKAGE",
  totalCost: "Rs 30,500/-",
  coverImage: "/itinerary/hero.webp",
  // Overridden per-itinerary at creation time with the creating staff user's
  // own name/phone — see src/app/admin/itinerary/new/page.tsx.
  preparedByName: "",
  preparedByPhone: "",
  quoteNumber: "VKH-2026-0418",

  destinations: "Srinagar · Pahalgam · Gulmarg · Sonamarg",

  // Only 3 rows — Destinations is its own info-bar cell rendered directly
  // from `destinations` above (see ItineraryPdf.tsx), not duplicated here.
  info: [
    { id: "info-1", label: "Duration", value: "5 Nights / 6 Days", icon: "calendar" },
    { id: "info-3", label: "Vehicle", value: "Private Sedan", icon: "car" },
    { id: "info-4", label: "Rooms", value: "1 Room · 1 Extra Bed", icon: "stay" },
  ],

  days: [
    {
      id: "day-1",
      title: "Arrival in Srinagar",
      image: "/itinerary/srinagar.webp",
      dateLabel: "Wed 10 Jun",
      body: "Welcome to Kashmir! Meet our representative at the airport and transfer to your hotel. After check-in, enjoy sightseeing of Mughal Gardens including Shalimar Bagh, Nishat Bagh, and Cheshmashahi. Visit Shankaracharya Temple and Hazratbal Dargah. Evening free to explore Dal Lake.",
      meta: [
        { id: "m-1", label: "Meals", value: "Dinner" },
        { id: "m-2", label: "Stay", value: "Srinagar" },
        { id: "m-3", label: "Highlights", value: "Mughal Gardens, Dal Lake" },
      ],
    },
    {
      id: "day-2",
      title: "Gulmarg Excursion",
      image: "/itinerary/gulmarg.webp",
      dateLabel: "Thu 11 Jun",
      body: "After breakfast, drive to Gulmarg (Meadow of Flowers). Enjoy the scenic drive and explore Gulmarg's natural beauty. Take the Gondola cable car ride (subject to operation), enjoy horse riding to Strawberry Valley. Return to Srinagar for overnight stay.",
      meta: [
        { id: "m-4", label: "Meals", value: "Breakfast & Dinner" },
        { id: "m-5", label: "Stay", value: "Srinagar" },
        { id: "m-6", label: "Highlights", value: "Gondola Ride, Strawberry Valley" },
      ],
    },
    {
      id: "day-3",
      title: "Sonamarg Day Trip",
      image: "/itinerary/sonamarg.webp",
      dateLabel: "Fri 12 Jun",
      body: "Proceed to Sonamarg (Meadow of Gold), known for its stunning natural beauty, alpine flowers, and snow-capped mountains. Enjoy the breathtaking views and serene atmosphere. Return to Srinagar for overnight stay.",
      meta: [
        { id: "m-7", label: "Meals", value: "Breakfast & Dinner" },
        { id: "m-8", label: "Stay", value: "Srinagar" },
        { id: "m-9", label: "Highlights", value: "Thajiwas Glacier, Scenic Views" },
      ],
    },
    {
      id: "day-4",
      title: "Pahalgam Valley",
      image: "/itinerary/pahalgam.webp",
      dateLabel: "Sat 13 Jun",
      body: "Check out from hotel and drive to Pahalgam (Valley of Shepherds). Visit Lidder stream, enjoy pony rides along the trails. Explore Aru Valley and Betaab Valley with their beautiful campsites. Overnight stay in Pahalgam.",
      meta: [
        { id: "m-10", label: "Meals", value: "Breakfast & Dinner" },
        { id: "m-11", label: "Stay", value: "Pahalgam" },
        { id: "m-12", label: "Highlights", value: "Lidder Stream, Aru Valley" },
      ],
    },
    {
      id: "day-5",
      title: "Return to Srinagar & Local Sightseeing",
      image: "/itinerary/shikara.webp",
      dateLabel: "Sun 14 Jun",
      body: "Drive back to Srinagar. After check-in, enjoy local shopping and visit Pari Mahal, Chashme Shahi and Nishat Bagh. Evening free for leisure or Shikara ride (optional).",
      meta: [
        { id: "m-13", label: "Meals", value: "Breakfast & Dinner" },
        { id: "m-14", label: "Stay", value: "Srinagar" },
        { id: "m-15", label: "Highlights", value: "Pari Mahal, Shikara Ride" },
      ],
    },
    {
      id: "day-6",
      title: "Departure",
      image: "/itinerary/lidder-river.webp",
      dateLabel: "Mon 15 Jun",
      body: "Check out from hotel and drive to the airport with beautiful memories of your Kashmir trip.",
      meta: [
        { id: "m-16", label: "Meals", value: "Breakfast" },
        { id: "m-17", label: "Drop", value: "Srinagar Airport" },
      ],
    },
  ],

  hotels: [
    {
      id: "h-1",
      destination: "Srinagar (3N)",
      hotelDetails: "Hotel Grand MS",
      hotelAlt: "or Hotel Royal Heritage / similar category",
      checkIn: "Wed 10 Jun",
      checkOut: "Sat 13 Jun",
      nights: "3",
      roomType: "Double Sharing",
      rooms: "1",
      mealType: "Room + breakfast + one of lunch/dinner",
      image: "/itinerary/srinagar.webp",
      extraBed: "0",
      childWithBed: "0",
    },
    {
      id: "h-2",
      destination: "Gulmarg (1N)",
      hotelDetails: "Hotel Grand Hill View",
      hotelAlt: "or Hotel Welcome Resort / similar category",
      checkIn: "Sat 13 Jun",
      checkOut: "Sun 14 Jun",
      nights: "1",
      roomType: "Double Sharing",
      rooms: "1",
      mealType: "Room + breakfast + one of lunch/dinner",
      image: "/itinerary/gulmarg.webp",
      extraBed: "0",
      childWithBed: "0",
    },
    {
      id: "h-3",
      destination: "Pahalgam (1N)",
      hotelDetails: "Hotel Pahalgam",
      hotelAlt: "or similar category",
      checkIn: "Sun 14 Jun",
      checkOut: "Mon 15 Jun",
      nights: "1",
      roomType: "Double Sharing",
      rooms: "1",
      mealType: "Room + breakfast + one of lunch/dinner",
      image: "/itinerary/pahalgam.webp",
      extraBed: "0",
      childWithBed: "0",
    },
  ],
  hotelImages: DEFAULT_HOTEL_IMAGES,

  // Included Activities — Shikara Ride is the one activity common to almost
  // every Kashmir package, kept here as a starting point; fully removable
  // per itinerary via the editor's delete button (Add stays available even
  // at zero rows).
  activities: [
    {
      id: "act-1",
      name: "Shikara Ride",
      place: "Dal Lake, Srinagar",
      time: "1 Hour",
      image: "/itinerary/shikara.webp",
      day: "Day 05",
    },
  ],

  // "Available on the day" — paid-locally activities, indicative pricing set
  // by the local operator, not part of the package cost. One starting row
  // (not a fabricated full set) — staff add more per itinerary as needed.
  optionalActivities: [
    {
      id: "oa-1",
      name: "Gondola Ride",
      place: "Gulmarg",
      day: "Day 02",
      note: "Phase 1",
      price: "Rs. 840 pp",
    },
  ],

  trust: [
    { id: "t-1", title: "Handpicked Hotels", subtitle: "Comfortable & Well Located", icon: "home" },
    {
      id: "t-2",
      title: "Verified Properties",
      subtitle: "Trusted by 1000+ Travellers",
      icon: "shield",
    },
    { id: "t-3", title: "Best Price Guarantee", subtitle: "Value for Money Always", icon: "medal" },
    { id: "t-4", title: "24/7 Support", subtitle: "We're here for you Always", icon: "support" },
  ],

  // Why Choose Vertex — same real copy as the live site's WhyChooseItem rows
  // (see src/lib/itinerary/pdfTrustContent.ts), each given a distinct icon.
  // Also reused verbatim as the closing page's short trust badges.
  whyChoose: [
    {
      id: "wc-1",
      title: "Born in Kashmir",
      subtitle: "Our team is from Srinagar, Pahalgam & Gulmarg — not a Delhi call centre.",
      icon: "home",
    },
    {
      id: "wc-2",
      title: "Transparent Pricing",
      subtitle: "What you see is what you pay. No hidden driver tip or gondola extra.",
      icon: "medal",
    },
    {
      id: "wc-3",
      title: "Honest Itineraries",
      subtitle: "We tell you what's worth skipping. Real days. Real time.",
      icon: "star",
    },
    {
      id: "wc-4",
      title: "Hassle-free Travel",
      subtitle: "24/7 on-ground support. Verified hotels. Sanitised cars.",
      icon: "support",
    },
  ],

  transportType: "Sedan",
  transportDesc: "Private Vehicle for the entire trip",
  transportImage: "/itinerary/gurez.webp",
  transportSeats: "4 seats",
  transportBags: "2 large bags",
  transportDays: "Day 01 – 06",
  transportTags: ["Driver allowance", "Fuel", "Parking", "Tolls", "No tip expected"],

  // "Where a local taxi is required" — hidden from the editor for now (see
  // ItineraryEditor.tsx); left empty so the PDF's own `localTaxis.length > 0`
  // check keeps that section out of new itineraries too. The field/schema
  // stays in place in case this comes back later.
  localTaxis: [],

  // Grouped by `category` in the PDF (a heading renders whenever it differs
  // from the previous row) — keep same-category rows adjacent.
  inc: [
    { id: "inc-1", category: "Stay", text: "5 nights in deluxe rooms, hotel taxes paid" },
    { id: "inc-2", category: "Stay", text: "1 extra bed as quoted" },
    { id: "inc-3", category: "Meals", text: "Breakfast and dinner daily at your hotel" },
    { id: "inc-4", category: "Transport", text: "Private sedan for all 6 days" },
    { id: "inc-5", category: "Transport", text: "Driver allowance, fuel, parking and tolls" },
    { id: "inc-6", category: "Activities", text: "1 hour Shikara ride on Dal Lake" },
    { id: "inc-7", category: "Support", text: "On-ground team on call through your trip" },
  ],

  exc: [
    { id: "exc-1", category: "Travel to Kashmir", text: "Flights or train fare to and from Srinagar" },
    { id: "exc-2", category: "Activities on the day", text: "Gondola, horse and pony rides" },
    { id: "exc-3", category: "Activities on the day", text: "Monument and garden entry tickets" },
    {
      id: "exc-4",
      category: "Local taxis",
      text: "Union vehicles at Aru, Betaab, Chandanwari and Thajiwas",
    },
    { id: "exc-5", category: "Personal", text: "Lunch, snacks and drinks" },
    { id: "exc-6", category: "Personal", text: "Laundry, tips, phone and shopping" },
    { id: "exc-7", category: "Cover", text: "Travel insurance and medical expenses" },
  ],

  // Short tag pills shown under the "how payment works" card — the steps
  // themselves are payStep1/2 below.
  pay: ["GST included", "No card fee", "No UPI fee"],
  payStep1Title: "To confirm your booking",
  payStep1Desc: "10% advance, payable by UPI, card or bank transfer",
  payStep2Title: "On arrival in Srinagar",
  payStep2Desc: "Remaining 90%, same payment options",
  payNote: "The quoted price is what you pay. Nothing is added later.",

  cancel: [
    { id: "ct-1", label: "30 days or more", charge: "10%" },
    { id: "ct-2", label: "15 to 29 days", charge: "25%" },
    { id: "ct-3", label: "7 to 14 days", charge: "50%" },
    { id: "ct-4", label: "Less than 7 days", charge: "75%" },
  ],
  cancelNotes: [
    "Refunds within 15 working days",
    "Returned to the account you paid from",
    "No refund for no-shows",
  ],
};
