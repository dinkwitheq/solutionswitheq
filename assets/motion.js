/* ============================================================
   motion.js — GSAP motion layer for SolutionsWithEQ
   ------------------------------------------------------------
   Progressive enhancement, not a rewrite. The page works with this
   file absent: the original CSS keyframes and IntersectionObserver
   reveals are still in index-dynamic.html and take over whenever
   html.gsap-on is missing.

   html.gsap-on is added by a tiny inline script in <head> (so there
   is no flash of un-hidden content) and removed again here if GSAP
   failed to load. Everything below assumes it survived.

   ScrollTriggers are created top-to-bottom in page order, which is
   what GSAP wants for correct refresh sequencing with a pinned
   section in the middle.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------------------------------------------------------
     Fallback: GSAP never arrived (CDN blocked, offline, error).
     Strip the class so the CSS hidden states stop applying, then
     reveal anything that was waiting on JS.
     --------------------------------------------------------- */
  function fallback() {
    root.classList.remove('gsap-on');
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
    document.querySelectorAll('[data-count]').forEach(function (el) {
      el.textContent = el.getAttribute('data-count');
    });
  }

  if (!window.gsap || !window.ScrollTrigger) { fallback(); return; }

  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ duration: 0.8, ease: 'power3.out' });

  /* ---------------------------------------------------------
     Split a heading into per-word spans so words can rise out of
     a mask independently.

     Two constraints drove this over GSAP's SplitText: the page has
     gradient-filled <span class="grad-text"> runs inside its
     headings that must keep their background-clip intact, and we
     only want one extra CDN request. So we walk text nodes only —
     element children (the gradient spans) are recursed into rather
     than flattened, which preserves their styling.
     --------------------------------------------------------- */
  function splitWords(el) {
    if (!el || el.dataset.split === 'done') return [];
    var out = [];

    (function walk(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (child) {
        if (child.nodeType === 3) {
          var text = child.textContent;
          if (!/\S/.test(text)) return;
          var frag = document.createDocumentFragment();
          // Keep the whitespace between words as real text nodes so
          // line-breaking behaves exactly as it did before the split.
          text.split(/(\s+)/).forEach(function (chunk) {
            if (chunk === '') return;
            if (/^\s+$/.test(chunk)) { frag.appendChild(document.createTextNode(chunk)); return; }
            var frame = document.createElement('span');
            frame.className = 'w';
            var inner = document.createElement('span');
            inner.className = 'wi';
            inner.textContent = chunk;
            frame.appendChild(inner);
            frag.appendChild(frame);
            out.push(inner);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    })(el);

    el.dataset.split = 'done';
    return out;
  }

  var mm = gsap.matchMedia();

  mm.add({
    motionOK: '(prefers-reduced-motion: no-preference)',
    desktop: '(min-width: 901px)',
    finePointer: '(pointer: fine)'
  }, function (ctx) {
    var c = ctx.conditions;

    /* Reduced motion: show everything at rest and build nothing.
       Returning early inside matchMedia means no ScrollTriggers are
       created at all, so there is nothing to tear down later. */
    if (!c.motionOK) { fallback(); return; }

    /* ===== SCROLL PROGRESS =================================== */
    gsap.to('#progress', {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: { start: 0, end: 'max', scrub: 0.3 }
    });

    /* ===== HERO ============================================== */
    var heroWords = splitWords(document.querySelector('.hero h1'));
    var heroBits = gsap.utils.toArray('.hero-copy > *:not(h1)');
    var panels = gsap.utils.toArray('.hero .panel');

    /* The h1 itself is un-hidden immediately rather than inside the
       timeline: its words are already translated out of their .w masks,
       so there is nothing to see yet, and this way the heading is not
       depending on the first tick to become visible. */
    gsap.set('.hero h1', { opacity: 1 });

    var heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    heroTl
      .from(heroWords, {
        yPercent: 118,
        rotate: 2.5,
        duration: 0.95,
        // from:"start" keeps the reading order — the eye follows the
        // sentence rather than watching words appear out of sequence.
        stagger: { each: 0.045, from: 'start' }
      }, 0.1)
      /* fromTo, not from: motion.css parks these at opacity 0, and a
         from() tween would read that 0 as the *end* value and animate
         0 → 0. The end state has to be stated explicitly. */
      .fromTo(heroBits,
        { y: 22, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.75, stagger: 0.09 }, 0.34)
      .fromTo(panels,
        { y: 34, scale: 0.94, autoAlpha: 0 },
        { y: 0, scale: 1, autoAlpha: 1, duration: 0.9, stagger: 0.11 }, 0.5);

    /* ---- Headline safety net --------------------------------
       The masked reveal means a word that never finishes moving is a
       word nobody can read: .w clips to its own box, so a .wi still
       translated 118% down is simply gone. The headline is the single
       most important text on the page, so it must not depend on this
       timeline completing.

       Two guarantees. First, once the entrance finishes, strip the
       inline transforms and stop clipping — the h1 goes back to being
       ordinary text that nothing can hide again. Second, a timer
       failsafe: GSAP's ticker runs on requestAnimationFrame, which
       browsers suspend in background tabs, so a page opened in a
       background tab can sit at progress 0 indefinitely. setTimeout
       keeps running when rAF does not, so it can force the finish. */
    function settleHeadline() {
      gsap.set(heroWords, { clearProps: 'all' });
      document.querySelectorAll('.hero h1 .w').forEach(function (w) {
        w.style.overflow = 'visible';
      });
    }
    heroTl.eventCallback('onComplete', settleHeadline);
    setTimeout(function () {
      if (heroTl.progress() < 1) { heroTl.progress(1); }
      settleHeadline();
    }, 2600);

    /* The CSS float loop was killed in motion.css so the entrance
       and the idle drift don't write to transform at the same time.
       Restart it as a GSAP tween once the panels have landed. */
    heroTl.add(function () {
      panels.forEach(function (p, i) {
        gsap.to(p, {
          y: -12, duration: 3, ease: 'sine.inOut',
          repeat: -1, yoyo: true, delay: i * 0.35
        });
      });
    });

    /* Scroll-linked hero: copy drifts up and fades a little faster
       than the panels, which reads as depth without a parallax that
       fights the scroll. Aurora orbs move furthest — they're the
       back plane. */
    gsap.to('.hero .aurora .a1', {
      yPercent: 26, xPercent: 8, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
    });
    gsap.to('.hero .aurora .a2', {
      yPercent: 40, xPercent: -10, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
    });
    gsap.to('.hero .aurora .a3', {
      yPercent: 18, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
    });
    gsap.to('.hero-copy', {
      y: -46, autoAlpha: 0.25, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'center center', end: 'bottom top', scrub: 0.5 }
    });

    if (c.desktop) {
      // Panels lift at staggered rates so the cluster separates as
      // it leaves — the single clearest depth cue on the page.
      panels.forEach(function (p, i) {
        gsap.to(p, {
          y: -70 - i * 34, ease: 'none',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.7 }
        });
      });
    }

    /* ===== MARQUEE =========================================== */
    /* The track holds two identical runs of items, so travelling
       exactly -50% lands on a seamless repeat. */
    var track = document.querySelector('.marquee .track');
    if (track) {
      var loop = gsap.to(track, { xPercent: -50, ease: 'none', duration: 28, repeat: -1 });
      var marquee = document.querySelector('.marquee');

      ScrollTrigger.create({
        onUpdate: function (self) {
          var v = self.getVelocity();
          // Scroll speed pushes the strip; direction flips it. Clamped
          // so a flick of the wheel can't fling it across the screen.
          var boost = gsap.utils.clamp(-6, 6, v / 260);
          gsap.to(loop, {
            timeScale: self.direction === -1 ? -1 - Math.abs(boost) : 1 + Math.abs(boost),
            duration: 0.45, overwrite: true
          });
        }
      });
      // Settle back to a steady crawl once scrolling stops.
      ScrollTrigger.addEventListener('scrollEnd', function () {
        gsap.to(loop, { timeScale: 1, duration: 0.8 });
      });
      marquee.addEventListener('pointerenter', function () { gsap.to(loop, { timeScale: 0, duration: 0.4 }); });
      marquee.addEventListener('pointerleave', function () { gsap.to(loop, { timeScale: 1, duration: 0.4 }); });
    }

    /* ===== SECTION HEADINGS ================================== */
    /* Every h2 gets the same masked word rise as the hero, at a
       smaller amplitude so it punctuates rather than performs. */
    gsap.utils.toArray('.sec-head h2, .cta-band h2').forEach(function (h2) {
      var words = splitWords(h2);
      if (!words.length) return;
      gsap.from(words, {
        yPercent: 110, duration: 0.8, stagger: 0.035, ease: 'power3.out',
        scrollTrigger: { trigger: h2, start: 'top 86%', once: true },
        // Same reasoning as the headline: once it has played, the
        // heading stops being clipped so nothing can hide it later.
        onComplete: function () {
          gsap.set(words, { clearProps: 'all' });
          h2.querySelectorAll('.w').forEach(function (w) { w.style.overflow = 'visible'; });
        }
      });
    });

    /* ===== GENERIC REVEALS =================================== */
    /* batch() replaces the page's IntersectionObserver: same job,
       but items entering together animate as one staggered group
       instead of each firing its own independent transition.
       Steps are excluded — the pinned sequence below owns those. */
    var revealables = gsap.utils.toArray('.reveal').filter(function (el) {
      return !el.classList.contains('step');
    });
    gsap.set(revealables, { autoAlpha: 0, y: 26 });
    ScrollTrigger.batch(revealables, {
      start: 'top 88%',
      once: true,
      interval: 0.12,
      batchMax: 4,
      onEnter: function (batch) {
        gsap.to(batch, {
          autoAlpha: 1, y: 0, duration: 0.85, stagger: 0.1,
          ease: 'power3.out', overwrite: true,
          // Hand the element back to the stylesheet once it has landed,
          // so nothing carries an inline transform into hover states.
          clearProps: 'transform'
        });
      }
    });

    /* Safety net for the case where ScrollTrigger *initialises* at a
       non-zero scroll position — a deep link to /#pricing, or browser
       scroll restoration on reload. Everything above that point is
       already past its start and never gets crossed, so it is shown
       outright rather than relying on an enter event that may not come.
       Batch does handle a viewport that jumps past elements in one
       step, so this is belt-and-braces, not a fix for a known failure.
       Re-run on refresh: loading fonts changes what counts as above. */
    var passGuarded = [revealables];
    function showAlreadyPassed() {
      passGuarded.forEach(function (group) {
        group.forEach(function (el) {
          if (el.getBoundingClientRect().bottom < 0) {
            gsap.set(el, { autoAlpha: 1, y: 0, clearProps: 'transform' });
          }
        });
      });
    }
    showAlreadyPassed();
    ScrollTrigger.addEventListener('refresh', showAlreadyPassed);

    /* ===== SERVICES ========================================== */
    /* The two service cards are wide; drifting their mock device
       art against the card gives the section some internal motion
       without another entrance animation. */
    if (c.desktop) {
      gsap.utils.toArray('.svc .svc-visual').forEach(function (vis, i) {
        gsap.fromTo(vis, { y: 26 }, {
          y: -26, ease: 'none',
          scrollTrigger: { trigger: vis.closest('.svc'), start: 'top bottom', end: 'bottom top', scrub: 0.6 }
        });
      });
    }

    /* ===== CONCEPT WORK ====================================== */
    gsap.utils.toArray('.work .case').forEach(function (card) {
      var thumb = card.querySelector('.thumb');
      if (!thumb || !c.desktop) return;
      // Slow scale on the thumbnail as the card crosses the viewport.
      gsap.fromTo(thumb, { scale: 1.06 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: card, start: 'top bottom', end: 'center center', scrub: 0.5 }
      });
    });

    /* ===== PROCESS — pinned step sequence ==================== */
    var steps = gsap.utils.toArray('.process .step');
    var stepsWrap = document.querySelector('.process .steps');

    if (steps.length && stepsWrap) {
      if (c.desktop) {
        // Rail is injected rather than authored so index-dynamic.html
        // keeps the same markup as the original page.
        var rail = document.createElement('div');
        rail.className = 'steps-rail';
        rail.setAttribute('aria-hidden', 'true');
        rail.innerHTML = '<i></i>';
        stepsWrap.appendChild(rail);

        gsap.set(steps, { autoAlpha: 0.28, y: 18 });
        gsap.set(steps.map(function (s) { return s.querySelector('.num'); }), { scale: 0.82 });

        var procTl = gsap.timeline({
          scrollTrigger: {
            trigger: '.process',
            start: 'top top',
            end: '+=900',
            pin: true,
            scrub: 0.6,
            anticipatePin: 1
          }
        });

        procTl.to(rail.firstChild, { scaleX: 1, ease: 'none', duration: steps.length }, 0);

        steps.forEach(function (step, i) {
          procTl.to(step, {
            autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out'
          }, i * 0.9)
          .to(step.querySelector('.num'), {
            scale: 1, ease: 'back.out(2)', duration: 0.5
          }, i * 0.9);
        });
      } else {
        // No pin on small screens — pinning a tall stack on a phone
        // costs more than it communicates. Plain staggered reveal.
        gsap.set(steps, { autoAlpha: 0, y: 24 });
        ScrollTrigger.batch(steps, {
          start: 'top 88%', once: true,
          onEnter: function (batch) {
            gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.12, overwrite: true });
          }
        });
        // Same deep-link guard as the generic reveals above. Only needed
        // on this branch — the desktop steps are driven by the pinned
        // scrub, which sets its own state from scroll position.
        passGuarded.push(steps);
        showAlreadyPassed();
      }
    }

    /* ===== COUNT-UP ========================================== */
    /* Replaces the page's rAF counter. Tweening a plain object and
       writing on update keeps the easing consistent with everything
       else instead of a second hand-rolled cubic. */
    gsap.utils.toArray('[data-count]').forEach(function (el) {
      var target = +el.getAttribute('data-count');
      var obj = { v: 0 };
      gsap.to(obj, {
        v: target, duration: 1.4, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        onUpdate: function () { el.textContent = Math.round(obj.v); }
      });
    });

    /* ===== PRICING =========================================== */
    var pop = document.querySelector('.plan.pop');
    if (pop && c.desktop) {
      gsap.from(pop, {
        scale: 0.96, duration: 0.9, ease: 'back.out(1.4)', clearProps: 'scale',
        scrollTrigger: { trigger: '.price-grid', start: 'top 78%', once: true }
      });
    }

    /* ===== MAGNETIC BUTTONS ================================== */
    if (c.finePointer) {
      gsap.utils.toArray('.btn-primary').forEach(function (btn) {
        btn.classList.add('magnetic');
        // quickTo is the cheap path for continuous pointer input —
        // it reuses one tween instead of allocating per move event.
        var xTo = gsap.quickTo(btn, 'x', { duration: 0.45, ease: 'power3' });
        var yTo = gsap.quickTo(btn, 'y', { duration: 0.45, ease: 'power3' });

        btn.addEventListener('pointermove', function (ev) {
          var r = btn.getBoundingClientRect();
          // Cap the pull at ~18% of the button box so it never
          // detaches from where the cursor expects it to be.
          xTo((ev.clientX - r.left - r.width / 2) * 0.32);
          yTo((ev.clientY - r.top - r.height / 2) * 0.42);
        });
        btn.addEventListener('pointerleave', function () { xTo(0); yTo(0); });
      });
    }

    /* ===== REFRESH =========================================== */
    /* Self-hosted fonts land after first paint and change the height
       of every heading, which moves every trigger below them. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
  });
})();
