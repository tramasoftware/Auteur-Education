/** Folder open/close from prototype screen 08 (Your learning path). */

type Motion = {
  open: (index: number) => Promise<void>;
  close: (focusGenerate?: boolean) => void;
  dispose: () => void;
};

type MotionHandlers = {
  onOpen: (index: number) => void;
  onClose: () => void;
  onClass: (className: string) => void;
};

export function createPathRouteMotion(root: HTMLElement, handlers: MotionHandlers): Motion {
  const grid = root.querySelector<HTMLElement>(".caminos");
  const generate = root.parentElement?.querySelector<HTMLElement>(".cierre-o .btn");
  if (!grid) {
    return { open: async () => {}, close: () => {}, dispose: () => {} };
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let active = -1;
  let busy = false;
  let token = 0;
  let openedOnce = false;
  let flight: HTMLElement | null = null;
  const animations: Animation[] = [];

  function cards() {
    return Array.from(grid.querySelectorAll<HTMLElement>(":scope > .lomo"));
  }

  function details() {
    return Array.from(root.querySelectorAll<HTMLElement>(".ae-route-folder"));
  }

  function buttons() {
    return cards().map((card) => card.querySelector<HTMLButtonElement>(".ae-route-open"));
  }

  function animate(node: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
    const next = openedOnce
      ? { ...options, duration: Math.round(Number(options.duration ?? 0) * 0.94) }
      : options;
    const animation = node.animate(frames, next);
    animations.push(animation);
    return animation.finished.catch(() => undefined);
  }

  function cleanup() {
    animations.splice(0).forEach((animation) => animation.cancel());
    flight?.remove();
    flight = null;
    cards().forEach((card) => {
      card.style.visibility = "";
    });
    root.removeAttribute("aria-busy");
    grid.inert = active >= 0;
    busy = false;
    routeClass(active >= 0 ? "abierta" : "");
  }

  function routeClass(...parts: string[]) {
    handlers.onClass(parts.filter(Boolean).join(" "));
  }

  function display(index: number) {
    active = index;
    handlers.onOpen(index);
    details().forEach((detail, i) => {
      detail.inert = i !== index;
    });
    buttons().forEach((button, i) => {
      button?.setAttribute("aria-expanded", String(i === index));
    });
    grid.inert = true;
  }

  function focusDetail() {
    if (active < 0) {
      return;
    }
    details()[active]?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
  }

  function instant(index: number) {
    cleanup();
    display(index);
    routeClass("abierta");
    root.scrollIntoView({ behavior: "auto", block: "start" });
    focusDetail();
  }

  async function open(index: number) {
    const list = cards();
    const folder = details()[index];
    const card = list[index];
    if (busy || active >= 0 || !card || !folder) {
      return;
    }
    routeClass("");
    if (reduced.matches || typeof card.animate !== "function") {
      instant(index);
      return;
    }
    const run = ++token;
    busy = true;
    active = index;
    grid.inert = true;
    routeClass("ae-opening");
    root.setAttribute("aria-busy", "true");
    try {
      const rect = card.getBoundingClientRect();
      flight = document.createElement("div");
      flight.className = "ae-route-flight";
      flight.setAttribute("aria-hidden", "true");
      flight.inert = true;
      flight.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
      const clone = card.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      clone.querySelectorAll("button").forEach((node) => {
        (node as HTMLButtonElement).tabIndex = -1;
        node.removeAttribute("aria-controls");
      });
      flight.appendChild(clone);
      (root.closest(".proposals-screen") ?? document.body).appendChild(flight);
      card.style.visibility = "hidden";
      root.scrollIntoView({ behavior: "smooth", block: "start" });
      await Promise.all(
        list.map((item, i) => {
          if (i === index) {
            return Promise.resolve();
          }
          const box = item.getBoundingClientRect();
          const left = box.left + box.width / 2 < window.innerWidth / 2;
          const x = left ? -(box.right + 100) : window.innerWidth - box.left + 100;
          return animate(
            item,
            [
              { transform: "translate3d(0,0,0) rotate(0deg)", opacity: 1 },
              {
                transform: `translate3d(${x}px,36px,0) rotate(${left ? -9 : 9}deg)`,
                opacity: 0,
              },
            ],
            { duration: 580, easing: "cubic-bezier(.55,0,.8,.4)", fill: "forwards" },
          );
        }),
      );
      if (run !== token) {
        return;
      }
      display(index);
      routeClass("ae-opening", "abierta");
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (run !== token || !flight) {
        return;
      }
      const target = details()[index]?.getBoundingClientRect();
      if (!target || target.height < 8) {
        instant(index);
        return;
      }
      await animate(
        flight,
        [
          {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          },
          {
            left: `${target.left}px`,
            top: `${target.top}px`,
            width: `${target.width}px`,
            height: `${target.height}px`,
          },
        ],
        { duration: 620, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
      );
      if (run !== token) {
        return;
      }
      routeClass("ae-opening", "abierta", "ae-cover-opening");
      await animate(
        flight,
        [
          { transform: "perspective(1600px) rotateY(0deg)", opacity: 1 },
          { transform: "perspective(1600px) rotateY(-104deg)", opacity: 0 },
        ],
        { duration: 760, easing: "cubic-bezier(.25,.65,.25,1)", fill: "forwards" },
      );
      if (run !== token) {
        return;
      }
      cleanup();
      openedOnce = true;
      focusDetail();
    } catch {
      if (run === token) {
        instant(index);
      }
    }
  }

  function close(focusGenerate = false) {
    if (active < 0) {
      return;
    }
    const previous = active;
    token += 1;
    active = -1;
    cleanup();
    handlers.onClose();
    details().forEach((detail) => {
      detail.inert = true;
    });
    buttons().forEach((button) => button?.setAttribute("aria-expanded", "false"));
    routeClass("ae-returning");
    const target = focusGenerate && generate ? generate : root;
    target.scrollIntoView({
      behavior: reduced.matches ? "auto" : "smooth",
      block: focusGenerate ? "center" : "start",
    });
    const focusNode = focusGenerate && generate ? generate : buttons()[previous];
    focusNode?.focus({ preventScroll: true });
  }

  function settle() {
    if (busy) {
      const index = active;
      token += 1;
      instant(index);
    }
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && active >= 0) {
      event.preventDefault();
      close(false);
    }
  };
  const onHide = () => {
    token += 1;
    cleanup();
    if (active >= 0) {
      display(active);
    }
  };

  reduced.addEventListener("change", settle);
  window.addEventListener("resize", settle);
  window.addEventListener("pagehide", onHide);
  document.addEventListener("keydown", onKey);

  return {
    open,
    close,
    dispose() {
      token += 1;
      cleanup();
      reduced.removeEventListener("change", settle);
      window.removeEventListener("resize", settle);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("keydown", onKey);
    },
  };
}
