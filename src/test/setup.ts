import "@testing-library/jest-dom";

// Radix (Select, Popover, etc.) llama estos métodos de puntero/scroll al
// abrir su contenido — jsdom no los implementa, sin este stub cualquier test
// que interactúe con un <Select> de shadcn/Radix tira "not a function".
// Primer test de componente del repo (2026-09-01, GridLayoutMapping/
// EavLayoutMapping) — se agrega acá para que sirva para cualquier test
// futuro que también use estos componentes, no solo para ese caso puntual.
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
