/* Vihara — shared contact helper (WhatsApp + Call).
   If a listing has a phone number, WhatsApp opens the chat and Call dials as
   usual. If the number hasn't been added yet, a friendly popup is shown instead
   of launching WhatsApp with an empty recipient or dialling an empty number.

   Usage: give the buttons these attributes (phone may be empty):
     <a href="javascript:void(0)" data-wa="<phone>"   data-wa-name="<name>">     WhatsApp
     <a href="javascript:void(0)" data-call="<phone>" data-call-name="<name>">   Call
   Clicks are handled automatically. You can also call
   VihWhatsApp.open(phone, name) or VihWhatsApp.call(phone, name). */
(function () {
  "use strict";

  var POPUP_ID = "vih-wa-popup";

  function digitsOf(phone) {
    return (phone || "").replace(/[^0-9]/g, "");
  }

  function ensureStyles() {
    if (document.getElementById("vih-wa-style")) return;
    var css =
      "#vih-wa-popup{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;padding:20px;font-family:'Poppins',sans-serif;}" +
      "#vih-wa-popup.vih-open{display:flex;}" +
      "#vih-wa-popup .vih-wa-overlay{position:absolute;inset:0;background:rgba(0,0,0,.5);}" +
      "#vih-wa-popup .vih-wa-card{position:relative;background:#fff;max-width:340px;width:100%;border-radius:20px;padding:28px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.25);animation:vihWaPop .25s ease;}" +
      "@keyframes vihWaPop{from{transform:translateY(15px) scale(.96);opacity:0}to{transform:none;opacity:1}}" +
      "#vih-wa-popup .vih-wa-icon{width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:#fff3e0;color:#e67e22;display:flex;align-items:center;justify-content:center;font-size:1.7rem;}" +
      "#vih-wa-popup h3{margin:0 0 8px;color:#2c3e50;font-size:1.15rem;font-weight:600;}" +
      "#vih-wa-popup p{margin:0 0 22px;color:#666;font-size:.9rem;line-height:1.5;}" +
      "#vih-wa-popup button{background:#e67e22;color:#fff;border:none;padding:11px 30px;border-radius:50px;font-size:.9rem;font-weight:600;font-family:inherit;cursor:pointer;transition:.2s;}" +
      "#vih-wa-popup button:hover{background:#d35400;}";
    var style = document.createElement("style");
    style.id = "vih-wa-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildPopup() {
    ensureStyles();
    var existing = document.getElementById(POPUP_ID);
    if (existing) return existing;

    var wrap = document.createElement("div");
    wrap.id = POPUP_ID;
    wrap.innerHTML =
      '<div class="vih-wa-overlay"></div>' +
      '<div class="vih-wa-card" role="dialog" aria-modal="true">' +
      '<div class="vih-wa-icon"><i class="fas fa-phone-slash"></i></div>' +
      '<h3>Number not added yet</h3>' +
      '<p class="vih-wa-msg"></p>' +
      '<button type="button">Got it</button>' +
      "</div>";
    document.body.appendChild(wrap);

    function close() {
      wrap.classList.remove("vih-open");
    }
    wrap.querySelector(".vih-wa-overlay").addEventListener("click", close);
    wrap.querySelector("button").addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
    return wrap;
  }

  function showPopup(name, label) {
    label = label || "WhatsApp number";
    var popup = buildPopup();
    popup.querySelector(".vih-wa-msg").textContent = name
      ? "The " + label + " for " + name + " hasn't been updated yet. Please check back soon!"
      : "The " + label + " for this listing hasn't been updated yet. Please check back soon!";
    popup.classList.add("vih-open");
  }

  function open(phone, name) {
    var digits = digitsOf(phone);
    if (digits) {
      var text = "Hi, I found " + (name || "this place") + " on Vihara. I would like to know more.";
      window.open("https://wa.me/" + digits + "?text=" + encodeURIComponent(text), "_blank");
    } else {
      showPopup(name, "WhatsApp number");
    }
  }

  function call(phone, name) {
    var digits = digitsOf(phone);
    if (digits) {
      window.location.href = "tel:+" + digits;
    } else {
      showPopup(name, "phone number");
    }
  }

  // Delegated handler in the capture phase so it still fires even when a card
  // calls event.stopPropagation() on the button (e.g. the bakeries cards).
  document.addEventListener(
    "click",
    function (e) {
      if (!e.target || !e.target.closest) return;
      var waEl = e.target.closest("[data-wa]");
      if (waEl) {
        e.preventDefault();
        open(waEl.getAttribute("data-wa"), waEl.getAttribute("data-wa-name") || "");
        return;
      }
      var callEl = e.target.closest("[data-call]");
      if (callEl) {
        e.preventDefault();
        call(callEl.getAttribute("data-call"), callEl.getAttribute("data-call-name") || "");
      }
    },
    true
  );

  window.VihWhatsApp = { open: open, call: call, showPopup: showPopup };
})();
