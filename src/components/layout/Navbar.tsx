// src/components/layout/Navbar.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/atoms/ThemeToggle";
import { useSiteSettings, useWhatsAppLink } from "@/components/providers/SiteSettingsProvider";
import { motion, AnimatePresence } from "framer-motion";
import { User, Menu, X, Home, ShoppingBag, MapPin, type LucideIcon } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/brand";
import { trackWhatsappClick } from "@/lib/analytics";
import { openB2bRegisterModal } from "@/lib/b2b/registerModal";

export function Navbar() {
  const { siteName } = useSiteSettings();
  const wa = useWhatsAppLink();
  const planTripHref = wa(
    `Hi ${siteName}! I'd like to plan my Kashmir trip. Please help me build a custom itinerary.`,
  );
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Whether a sticky BannerStrip currently occupies the top of the viewport. The
  // navbar drops below it by the strip's height (top-9 / top-10) when present.
  const [stripVisible, setStripVisible] = useState(false);
  const pathname = usePathname();

  // Switches to the opaque pill just 40px into the scroll, on every
  // viewport, so it doesn't linger transparent over hero content underneath.
  useEffect(() => {
    const threshold = 40;
    const handleScroll = () => setScrolled(window.scrollY > threshold);

    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [pathname]);

  // Sync with the BannerStrip: seed from the DOM on mount (the strip may already
  // be rendered), then follow its show/dismiss events.
  useEffect(() => {
    setStripVisible(!!document.getElementById("vk-strip"));
    const onStrip = (e: Event) =>
      setStripVisible(Boolean((e as CustomEvent<{ visible: boolean }>).detail?.visible));
    window.addEventListener("vk-strip", onStrip);
    return () => window.removeEventListener("vk-strip", onStrip);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const navLinks = [
    { href: "/tours", label: "Tours" },
    { href: "/destinations", label: "Destinations" },
    { href: "/adventures", label: "Adventures" },
    { href: "/activities", label: "Things To Do" },
    { href: "/blog", label: "Travel Stories" },
    { href: "/reviews", label: "Reviews" },
  ];

  const bottomNavLinks: { href: string; label: string; Icon: LucideIcon }[] = [
    { href: "/", label: "Home", Icon: Home },
    { href: "/tours", label: "Tours", Icon: ShoppingBag },
    { href: "/destinations", label: "Destinations", Icon: MapPin },
  ];

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  // Pages that open with a full-bleed dark hero behind the navbar. Only on these
  // does the un-scrolled navbar go transparent with a white lockup; everywhere
  // else (booking, legal, etc.) it keeps the cream glass + ink/theme-aware logo.
  const heroRoutes = [
    "/",
    "/tours",
    "/adventures",
    "/destinations",
    "/activities",
    "/about",
    "/blog",
    "/contact",
    "/reviews",
  ];
  const hasHero =
    heroRoutes.includes(pathname) ||
    /^\/(tours|destinations|blog|activities)\/[^/]+$/.test(pathname);
  const overHero = hasHero && !scrolled;

  // On a tour detail page the sticky Book / Inquiry CTA bar (BookingMobileBar)
  // owns the bottom of the screen on phones, so we hide the global bottom tab
  // bar there to keep those CTAs visible and uncluttered.
  const isTourDetail = /^\/tours\/[^/]+$/.test(pathname);

  // On the B2B page, the header's primary right-side CTA switches from the
  // consumer "Plan My Trip" WhatsApp action to opening the B2B registration
  // modal — every other route keeps "Plan My Trip" unchanged.
  const isB2bPage = pathname === "/b2b-travel-partner-program";

  return (
    <>
      <header
        className={`fixed inset-x-0 z-50 px-3 transition-all duration-500 sm:px-4 lg:px-0 ${
          stripVisible ? "top-8" : "top-0"
        }`}
      >
        <nav
          className={`mx-auto mt-4 flex max-w-[1300px] items-center justify-between rounded-2xl px-4 py-3 transition-[background-color,box-shadow,border-color,backdrop-filter] duration-[250ms] ease-brand motion-reduce:transition-none sm:px-5 lg:px-6 ${
            overHero ? "bg-transparent" : "nav-pill-solid"
          }`}
        >
          {/* Logo — white lockup over the hero photo (transparent state), then
              theme-aware (navy on cream / white in dark) once the cream nav lands. */}
          <Logo variant={overHero ? "light" : "auto"} className="h-8" />

          {/* Desktop Navigation — light-on-dark over the hero, ink once landed. */}
          <ul
            className={`hidden items-center gap-7 text-[16px] font-semibold lg:flex ${
              overHero ? "text-white/80" : "text-foreground/75"
            }`}
          >
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`relative transition ${
                    overHero
                      ? isActive(link.href)
                        ? "text-white"
                        : "text-white/80 hover:text-white"
                      : isActive(link.href)
                        ? "text-foreground"
                        : "text-foreground/75 hover:text-foreground"
                  }`}
                >
                  {link.label}
                  {isActive(link.href) && (
                    <span
                      className={`absolute -bottom-1.5 left-0 h-[2px] w-full rounded-full ${
                        overHero ? "bg-white" : "bg-primary"
                      }`}
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop Actions */}
          <div className="hidden items-center gap-3 lg:flex">
            <ThemeToggle
              className={`grid h-9 w-9 place-items-center rounded-full border transition ${
                overHero
                  ? "border-white/30 text-white hover:bg-white hover:text-foreground"
                  : "border-foreground/20 text-foreground hover:bg-foreground hover:text-background"
              }`}
            />
            <Link
              href="/login"
              aria-label="Log in to your account"
              className={`grid h-9 w-9 place-items-center rounded-full border transition ${
                overHero
                  ? "border-white/30 text-white hover:bg-white hover:text-foreground"
                  : "border-foreground/20 text-foreground hover:bg-foreground hover:text-background"
              }`}
            >
              <User className="h-4 w-4" strokeWidth={2} />
            </Link>
            {isB2bPage ? (
              <button
                type="button"
                onClick={openB2bRegisterModal}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[14px] font-bold text-primary-foreground shadow-glow ring-inner transition hover:brightness-110"
              >
                Register as B2B Partner
              </button>
            ) : (
              <Link
                href={planTripHref}
                target="_blank"
                onClick={() => trackWhatsappClick("header")}
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[14px] font-bold text-primary-foreground shadow-glow ring-inner transition hover:brightness-110"
              >
                <WhatsAppIcon className="h-4 w-4" />
                Plan My Trip
              </Link>
            )}
          </div>

          {/* Mobile Top Bar - Only Theme Toggle */}
          <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle />
          </div>
        </nav>
      </header>

      {/* Mobile Bottom Tab Bar — hidden on tour detail pages where the sticky
          Book / Inquiry CTA bar takes over the bottom of the screen. */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-lg lg:hidden ${isTourDetail ? "hidden" : ""}`}
      >
        <div className="flex items-center justify-around py-2">
          {bottomNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 transition ${
                isActive(link.href) ? "text-primary" : "text-foreground/60 hover:text-foreground"
              }`}
            >
              <link.Icon className="h-5 w-5" strokeWidth={1.8} />
              <span className="text-[10px] font-medium">{link.label}</span>
            </Link>
          ))}

          {/* User Icon - Added before burger menu */}
          <Link
            href="/login"
            className={`flex flex-col items-center gap-0.5 px-3 py-1 transition ${
              pathname === "/login" ? "text-primary" : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <User className="h-5 w-5" strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Profile</span>
          </Link>

          {/* Burger Menu - Opens overlay */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 transition ${
              mobileMenuOpen ? "text-primary" : "text-foreground/60 hover:text-foreground"
            }`}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" strokeWidth={1.8} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.8} />
            )}
            <span className="text-[10px] font-medium">Menu</span>
          </button>
        </div>
      </div>

      {/* Floating Action Button - Plan Trip (Mobile - Always Visible) */}
      <motion.div
        initial={{ scale: 0, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{
          type: "spring",
          stiffness: 260,
          damping: 20,
          delay: 0.5,
        }}
        className="fixed bottom-20 right-4 z-50 lg:hidden"
      >
        <motion.div
          animate={{
            y: [0, -8, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
          }}
        >
          {isB2bPage ? (
            <button
              type="button"
              onClick={openB2bRegisterModal}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 shadow-xl ring-inner transition hover:brightness-110"
              style={{
                boxShadow: "0 4px 20px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1) inset",
              }}
            >
              <span className="text-sm font-bold text-primary-foreground">
                Register as B2B Partner
              </span>

              {/* Pulse ring animation */}
              <motion.span
                className="absolute inset-0 rounded-full"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.6, 0, 0.6],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{
                  border: "2px solid hsl(var(--primary))",
                  borderRadius: "9999px",
                }}
              />
            </button>
          ) : (
            <Link
              href={planTripHref}
              target="_blank"
              onClick={() => trackWhatsappClick("header_mobile")}
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 shadow-xl ring-inner transition hover:brightness-110"
              style={{
                boxShadow: "0 4px 20px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1) inset",
              }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                <WhatsAppIcon className="h-5 w-5" />
              </motion.div>
              <span className="text-sm font-bold text-primary-foreground">Plan My Trip</span>

              {/* Pulse ring animation */}
              <motion.span
                className="absolute inset-0 rounded-full"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.6, 0, 0.6],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{
                  border: "2px solid hsl(var(--primary))",
                  borderRadius: "9999px",
                }}
              />
            </Link>
          )}
        </motion.div>
      </motion.div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-background/95 backdrop-blur-lg lg:hidden"
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex h-full flex-col items-center justify-center gap-6 pt-10"
            >
              {navLinks.map((link, index) => (
                <motion.div
                  key={link.href}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link
                    href={link.href}
                    className={`text-[18px] font-medium transition hover:text-primary ${
                      isActive(link.href) ? "text-primary" : "text-foreground/80"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
