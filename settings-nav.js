// Settings side list: tapping a section scrolls the settings to it, and the list follows
// along as you scroll so it always shows where you are.
(() => {
  const view = document.querySelector('[data-panel="settings"]');
  const scroller = view?.querySelector(".settings-controls");
  const links = [...(view?.querySelectorAll("[data-settings-link]") || [])];
  if (!scroller || !links.length) return;
  const sectionFor = link => document.getElementById(`settings-section-${link.dataset.settingsLink}`);

  function markActive(link) {
    links.forEach(item => {
      const active = item === link;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "true"); else item.removeAttribute("aria-current");
    });
  }

  // While a tapped jump is scrolling, keep the tapped section highlighted. iOS smooth scrolling
  // can run longer than a fixed delay, so the pin holds until the scrolling has stopped.
  let pinned = false, pinTimer = null;
  const releasePinSoon = (delay = 160) => { clearTimeout(pinTimer); pinTimer = setTimeout(() => { pinned = false; }, delay); };

  links.forEach(link => link.addEventListener("click", () => {
    const section = sectionFor(link);
    if (!section) return;
    markActive(link);
    pinned = true;
    releasePinSoon(1500);
    // Measure at tap time from where the section is now, so a layout change since the page
    // opened (fonts, text size) cannot send the jump to the wrong place.
    const top = scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }));
  scroller.addEventListener("scrollend", () => { if (pinned) releasePinSoon(60); });

  let frame = null;
  scroller.addEventListener("scroll", () => {
    if (pinned) { releasePinSoon(); return; }
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const top = scroller.getBoundingClientRect().top + 24;
      const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      let current = links[0];
      for (const link of links) if (sectionFor(link)?.getBoundingClientRect().top <= top) current = link;
      markActive(atEnd ? links.at(-1) : current);
    });
  }, { passive: true });
})();
