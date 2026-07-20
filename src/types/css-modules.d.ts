// Ambient declaration so `tsc` accepts side-effect CSS imports (e.g. Leaflet's
// stylesheet). Next.js/webpack extract these at build time; TypeScript needs
// the module to be declared.
declare module "*.css";
