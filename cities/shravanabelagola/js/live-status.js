/* =========================================================
   Vihara — Live Open / Closed status
   ---------------------------------------------------------
   Turns a shop's static "status" badge into a live one that
   is calculated from its opening hours every time the page
   loads.

   Supported timing formats (from the *_data.json files):
     "7:00 AM - 9:30 PM"      -> Open Now / Closed by clock
     "6:30 AM - 11:00 AM"     -> Open Now / Closed by clock
     "24 Hours" / "Open 24 Hours" / "Open All Day" / "24 x 7"
                              -> always Open Now
   Anything we cannot understand (e.g. "Weekly · Morning to
   Evening") or entries with no timings at all (e.g. stays)
   are left with their original static status untouched.

   Also understands the retail-shop style fields
   openTime / closeTime ("08:00" / "20:00").
========================================================= */
(function (global) {
  "use strict";

  var OPEN_COLOR = "#27ae60";   // green
  var CLOSED_COLOR = "#c0392b"; // red

  // "7:00 AM" / "11 PM" / "9:30 pm"  ->  minutes since midnight
  function toMinutes(clock) {
    if (!clock) return null;
    var m = String(clock).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = m[2] ? parseInt(m[2], 10) : 0;
    if (h < 1 || h > 12 || min > 59) return null;
    if (h === 12) h = 0;                 // 12 AM = 0, 12 PM handled below
    if (m[3].toLowerCase() === "pm") h += 12;
    return h * 60 + min;
  }

  // "08:00" (24h) -> minutes since midnight
  function toMinutes24(clock) {
    if (!clock) return null;
    var m = String(clock).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /**
   * Work out whether a place is open right now from its timings text.
   * @returns {{open:boolean}|null}  null = "can't tell, leave as-is"
   */
  function evaluate(timings, now) {
    if (!timings) return null;
    now = now || new Date();
    var t = String(timings).toLowerCase();

    // Always-open phrasings
    if (/24\s*hours?/.test(t) || /24\s*x\s*7/.test(t) ||
        /24\s*\/\s*7/.test(t) || /all\s*day/.test(t)) {
      return { open: true };
    }

    // A "H:MM AM - H:MM PM" style range
    var range = t.match(
      /(\d{1,2}(?::\d{2})?\s*[ap]m)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*[ap]m)/i
    );
    if (!range) return null;

    var openMin = toMinutes(range[1]);
    var closeMin = toMinutes(range[2]);
    if (openMin === null || closeMin === null) return null;

    var cur = now.getHours() * 60 + now.getMinutes();

    // Range that runs past midnight, e.g. 6:00 PM - 2:00 AM
    if (closeMin <= openMin) {
      return { open: cur >= openMin || cur < closeMin };
    }
    return { open: cur >= openMin && cur < closeMin };
  }

  /**
   * Mutates shop.status / shop.statusColor to a live value when we can
   * work it out. Falls back to the existing static status otherwise.
   * @returns the same shop object (for chaining).
   */
  function applyLiveStatus(shop, now) {
    if (!shop) return shop;

    var timings = shop.timings;

    // Retail style: build a range from 24h open/close fields.
    if (!timings && shop.openTime && shop.closeTime) {
      var o = toMinutes24(shop.openTime);
      var c = toMinutes24(shop.closeTime);
      if (o !== null && c !== null) {
        now = now || new Date();
        var cur = now.getHours() * 60 + now.getMinutes();
        var open = (c <= o) ? (cur >= o || cur < c) : (cur >= o && cur < c);
        shop.status = open ? "Open Now" : "Closed";
        shop.statusColor = open ? OPEN_COLOR : CLOSED_COLOR;
        return shop;
      }
    }

    var res = evaluate(timings, now);
    if (!res) return shop;              // leave the static status alone

    shop.status = res.open ? "Open Now" : "Closed";
    shop.statusColor = res.open ? OPEN_COLOR : CLOSED_COLOR;
    return shop;
  }

  global.VihStatus = {
    applyLiveStatus: applyLiveStatus,
    evaluate: evaluate
  };
})(window);
