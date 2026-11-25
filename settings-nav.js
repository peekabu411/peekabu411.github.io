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

  let pinnedUntil = 0;
  links.forEach(link => link.addEventListener("click", () => {
    const section = sectionFor(link);
    if (!section) return;
    if (typeof physicalFeedback === "function") physicalFeedback("press");
    markActive(link);
    pinnedUntil = Date.now() + 700; // keep the tapped section highlighted while the scroll runs
    scroller.scrollTo({ top: section.offsetTop - scroller.firstElementChild.offsetTop, behavior: "smooth" });
  }));

  let frame = null;
  scroller.addEventListener("scroll", () => {
    if (frame || Date.now() < pinnedUntil) return;
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
