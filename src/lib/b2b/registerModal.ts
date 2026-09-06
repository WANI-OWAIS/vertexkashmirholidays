// Cross-tree "open the B2B registration modal" signal — the trigger buttons
// live scattered across the (server) B2B page and inside the global Navbar,
// neither of which shares a React tree with the modal's own state. Reuses the
// same window CustomEvent bus already established between BannerStrip and
// Navbar (see the "vk-strip" event in Navbar.tsx) rather than introducing a
// new Context provider just for this.
export const B2B_REGISTER_MODAL_EVENT = "vk-b2b-register-open";

export function openB2bRegisterModal(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(B2B_REGISTER_MODAL_EVENT));
}
