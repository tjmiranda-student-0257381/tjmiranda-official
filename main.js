/* ==========================================
   Site Scripts — tjmiranda.com
   Author: TJ Miranda
   - Hamburger menu (all screen sizes)
   - Inquiry form: preselect a service from "Inquire Now" buttons
   ========================================== */
(() => {
  "use strict";

  /* ---------- Hamburger Menu ---------- */
  const menuBtn = document.querySelector(".hamburger");
  const panel = document.getElementById("site-menu");
  const backdrop = document.querySelector(".menu-backdrop");

  if (menuBtn && panel) {
    const focusables = () => [menuBtn, ...panel.querySelectorAll("a[href], button:not([disabled])")];
    const isOpen = () => document.body.classList.contains("menu-open");

    const openMenu = () => {
      document.body.classList.add("menu-open");
      menuBtn.setAttribute("aria-expanded", "true");
      menuBtn.setAttribute("aria-label", "Close menu");
      panel.setAttribute("aria-hidden", "false");
      const firstLink = panel.querySelector("a[href]");
      if (firstLink) window.setTimeout(() => firstLink.focus(), 50);
    };

    const closeMenu = (returnFocus) => {
      document.body.classList.remove("menu-open");
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.setAttribute("aria-label", "Open menu");
      panel.setAttribute("aria-hidden", "true");
      if (returnFocus) menuBtn.focus();
    };

    menuBtn.addEventListener("click", () => (isOpen() ? closeMenu(false) : openMenu()));
    if (backdrop) backdrop.addEventListener("click", () => closeMenu(false));
    panel.querySelectorAll("a[href]").forEach((link) => {
      link.addEventListener("click", () => closeMenu(false));
    });

    document.addEventListener("keydown", (e) => {
      if (!isOpen()) return;
      if (e.key === "Escape") {
        closeMenu(true);
        return;
      }
      if (e.key !== "Tab") return;
      // Keep keyboard focus inside the open menu
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  /* ---------- Inquiry Form: preselect service ---------- */
  const subject = document.getElementById("subject");

  if (subject) {
    const selectService = (value) => {
      const match = [...subject.options].find((opt) => opt.value === value);
      if (match) subject.value = match.value;
    };

    document.querySelectorAll("[data-service]").forEach((link) => {
      link.addEventListener("click", () => selectService(link.dataset.service));
    });

    // Also support services.html?service=...#inquire-now
    const fromUrl = new URLSearchParams(window.location.search).get("service");
    if (fromUrl) selectService(fromUrl);
  }
})();
