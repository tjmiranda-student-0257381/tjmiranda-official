/* ==========================================
   Auto-Sliding Carousel — tjmiranda.com
   Author: TJ Miranda

   Markup: <section class="carousel" data-carousel data-interval="6000">
   - Auto-advances every data-interval ms (default 6000)
   - Pauses on mouse hover, keyboard focus, and when the tab is hidden
   - Pause/play button, prev/next buttons, dot navigation
   - Swipe on touch screens, Left/Right arrow keys
   ========================================== */
(() => {
  "use strict";

  const SLIDE_MS = 700; // keep in sync with .carousel-slide transition in main.css
  const SWIPE_PX = 50;

  class Carousel {
    constructor(root) {
      this.root = root;
      this.slides = [...root.querySelectorAll(".carousel-slide")];
      this.viewport = root.querySelector(".carousel-viewport");
      this.dotsWrap = root.querySelector(".carousel-dots");
      this.toggleBtn = root.querySelector('[data-action="toggle"]');
      this.interval = Number(root.dataset.interval) || 6000;

      this.index = Math.max(0, this.slides.findIndex((s) => s.classList.contains("is-active")));
      this.busy = false;
      this.stopped = false; // user pressed pause
      this.hovering = false;
      this.focused = false;
      this.timer = null;
      this.remaining = this.interval;
      this.startedAt = 0;

      if (this.slides.length < 2) return;

      root.style.setProperty("--carousel-interval", `${this.interval}ms`);
      this.slides.forEach((slide, i) => {
        slide.setAttribute("role", "group");
        slide.setAttribute("aria-roledescription", "slide");
        slide.setAttribute("aria-label", `${i + 1} of ${this.slides.length}`);
        this.setSlideState(slide, i === this.index);
      });

      this.buildDots();
      this.bindEvents();
      this.updateDots();
      this.play();
    }

    /* ---------- Slides ---------- */
    setSlideState(slide, active) {
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
      slide.inert = !active; // keeps hidden "Learn More" buttons out of the tab order
    }

    goTo(target, dir) {
      const count = this.slides.length;
      target = (target + count) % count;
      if (target === this.index || this.busy) return;
      if (dir === undefined) dir = target > this.index ? 1 : -1;

      const from = this.slides[this.index];
      const to = this.slides[target];
      this.busy = true;

      // Park the incoming slide off-screen on the correct side, then slide both.
      to.style.transition = "none";
      to.style.transform = `translateX(${dir * 100}%)`;
      void to.offsetWidth; // force reflow so the next transform animates
      to.style.transition = "";
      from.style.transform = `translateX(${-dir * 100}%)`;
      to.style.transform = "translateX(0)";

      this.setSlideState(from, false);
      this.setSlideState(to, true);
      this.index = target;
      this.updateDots();
      this.restartTimer();

      window.setTimeout(() => {
        this.busy = false;
      }, SLIDE_MS);
    }

    next() {
      this.goTo(this.index + 1, 1);
    }

    prev() {
      this.goTo(this.index - 1, -1);
    }

    /* ---------- Dots ---------- */
    buildDots() {
      if (!this.dotsWrap) return;
      this.dots = this.slides.map((_, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "carousel-dot";
        dot.setAttribute("aria-label", `Go to slide ${i + 1}`);
        dot.addEventListener("click", () => this.goTo(i));
        this.dotsWrap.appendChild(dot);
        return dot;
      });
    }

    updateDots() {
      if (!this.dots) return;
      this.dots.forEach((dot, i) => {
        dot.setAttribute("aria-current", String(i === this.index));
      });
    }

    /* ---------- Autoplay timer ---------- */
    canPlay() {
      return !this.stopped && !this.hovering && !this.focused && !document.hidden;
    }

    play() {
      if (!this.canPlay()) {
        this.root.classList.add("is-paused");
        return;
      }
      this.root.classList.remove("is-paused");
      if (this.timer) return;
      this.startedAt = performance.now();
      this.timer = window.setTimeout(() => this.tick(), this.remaining);
    }

    pause() {
      if (this.timer) {
        window.clearTimeout(this.timer);
        this.timer = null;
        this.remaining = Math.max(0, this.remaining - (performance.now() - this.startedAt));
      }
      this.root.classList.add("is-paused");
    }

    restartTimer() {
      window.clearTimeout(this.timer);
      this.timer = null;
      this.remaining = this.interval;
      this.play();
    }

    tick() {
      this.timer = null;
      if (this.busy) {
        this.remaining = SLIDE_MS;
        this.play();
        return;
      }
      this.next();
    }

    toggle() {
      this.stopped = !this.stopped;
      this.root.classList.toggle("is-stopped", this.stopped);
      this.viewport.setAttribute("aria-live", this.stopped ? "polite" : "off");
      if (this.toggleBtn) {
        this.toggleBtn.setAttribute("aria-label", this.stopped ? "Play slideshow" : "Pause slideshow");
      }
      if (this.stopped) {
        this.pause();
      } else {
        this.restartTimer();
      }
    }

    /* ---------- Events ---------- */
    bindEvents() {
      this.viewport.setAttribute("aria-live", "off");

      this.root.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const action = btn.dataset.action;
          if (action === "next") this.next();
          if (action === "prev") this.prev();
          if (action === "toggle") this.toggle();
        });
      });

      // Hover pause (mouse only, so a tap on a phone doesn't freeze it)
      this.root.addEventListener("pointerenter", (e) => {
        if (e.pointerType !== "mouse") return;
        this.hovering = true;
        this.pause();
      });
      this.root.addEventListener("pointerleave", (e) => {
        if (e.pointerType !== "mouse") return;
        this.hovering = false;
        this.play();
      });

      // Keyboard focus pause
      this.root.addEventListener("focusin", (e) => {
        if (!e.target.matches(":focus-visible")) return;
        this.focused = true;
        this.pause();
      });
      this.root.addEventListener("focusout", (e) => {
        if (this.root.contains(e.relatedTarget)) return;
        this.focused = false;
        this.play();
      });

      this.root.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          this.next();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          this.prev();
        }
      });

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.pause();
        else this.play();
      });

      // Touch swipe
      let startX = null;
      let startY = 0;
      this.viewport.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse") return;
        startX = e.clientX;
        startY = e.clientY;
      });
      this.viewport.addEventListener("pointerup", (e) => {
        if (startX === null) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        startX = null;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) this.next();
          else this.prev();
        }
      });
      this.viewport.addEventListener("pointercancel", () => {
        startX = null;
      });
    }
  }

  document.querySelectorAll("[data-carousel]").forEach((el) => new Carousel(el));
})();
