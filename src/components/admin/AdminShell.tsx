"use client";

import { Suspense, useEffect, useState } from "react";
import { useNotificationSound } from "@/components/admin/connect/hooks/useNotificationSound";
import { GlobalCallNotification } from "@/components/admin/connect/GlobalCallNotification";
import { CallProvider } from "@/components/admin/connect/CallProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Package,
  MapPin,
  CalendarDays,
  Users,
  Images,
  FileText,
  Star,
  Globe,
  Settings,
  ShieldCheck,
  Inbox,
  Home,
  Info,
  Phone,
  ScrollText,
  Megaphone,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Map,
  Ticket,
  MessageSquare,
  Flag,
  Target,
  HelpCircle,
  History,
  Briefcase,
  UserCog,
  Wallet,
  CalendarOff,
  BedDouble,
  Handshake,
  ClipboardList,
  CalendarCheck2,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/atoms/ThemeToggle";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { ChatInbox } from "@/components/admin/ChatInbox";
import { PackageCalculator } from "@/components/admin/calculator/PackageCalculator";
import { NotificationsProvider } from "@/components/admin/NotificationsProvider";
import { MobileBottomTabs } from "@/components/admin/MobileBottomTabs";
import { PresenceStatusPicker } from "@/components/admin/PresenceStatusPicker";
import { PresenceHeartbeat } from "@/components/admin/connect/PresenceHeartbeat";
import { cn } from "@/lib/utils";
import { MODULES, type ModuleKey, type PermissionMap, type Role } from "@/lib/rbac";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/atoms/avatar";

const MODULE_ICONS: Record<ModuleKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  packages: Package,
  destinations: MapPin,
  activities: Ticket,
  bookings: CalendarDays,
  leads: Inbox,
  itinerary: Map,
  proposals: Layers,
  hotelSuppliers: BedDouble,
  users: Users,
  b2bAgents: Handshake,
  b2bRequests: ClipboardList,
  employees: UserCog,
  salary: Wallet,
  leave: CalendarOff,
  connect: MessageSquare,
  galleries: Images,
  blogs: FileText,
  faqs: HelpCircle,
  home: Home,
  about: Info,
  contact: Phone,
  legal: ScrollText,
  campaigns: Megaphone,
  offlineConversions: Target,
  banners: Flag,
  reviews: Star,
  seo: Globe,
  settings: Settings,
  roles: ShieldCheck,
  auditLog: History,
  careers: Briefcase,
};

const PAGE_TITLES: Record<string, string> = {
  ...Object.fromEntries(MODULES.map((m) => [m.href, m.label])),
  "/admin/b2b-bookings": "B2B Bookings",
};

// Sidebar section grouping — purely a display concern, layered on top of the
// flat MODULES/permission system. `label: null` renders its items with no
// section header (Dashboard/Connect up top).
//
// `extra` items are static nav links with no MODULES entry of their own —
// they're a filtered view of an existing module's data (e.g. B2B Bookings is
// just Bookings scoped to B2B-originated rows), so they piggyback on that
// module's own permission (`permKey`) instead of needing a new RBAC module +
// RolePermission seed. Mirrors MODULE_PATH_ALIASES in moduleGuard.tsx, which
// applies the same reuse for the actual page-view guard.
interface ExtraNavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  permKey: ModuleKey;
}
const NAV_GROUPS: { label: string | null; keys: ModuleKey[]; extra?: ExtraNavItem[] }[] = [
  { label: null, keys: ["dashboard", "connect"] },
  { label: "Catalog", keys: ["destinations", "packages", "activities", "campaigns"] },
  {
    label: "CRM",
    keys: ["leads", "itinerary", "proposals", "hotelSuppliers", "bookings", "users"],
  },
  {
    label: "B2B",
    keys: ["b2bAgents", "b2bRequests"],
    extra: [
      { href: "/admin/b2b-bookings", label: "B2B Bookings", Icon: CalendarCheck2, permKey: "bookings" },
    ],
  },
  { label: "Marketing", keys: ["offlineConversions"] },
  { label: "CMS", keys: ["home", "about", "contact", "legal", "banners", "galleries"] },
  { label: "Editorial", keys: ["blogs", "faqs", "seo", "reviews", "careers"] },
  { label: "HR", keys: ["employees", "salary", "leave"] },
  { label: "Admin", keys: ["settings", "roles", "auditLog"] },
];

interface AdminShellProps {
  children: React.ReactNode;
  userId: string;
  userName: string;
  userEmail: string;
  userImage: string | null;
  role: Role;
  permissions: PermissionMap;
}

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

function SidebarContent({
  pathname,
  navGroups,
  userName,
  userEmail,
  userImage,
  onClose,
}: {
  pathname: string;
  navGroups: NavGroup[];
  userName: string;
  userEmail: string;
  userImage: string | null;
  onClose?: () => void;
}) {
  return (
    <div className="flex flex-col h-full bg-card text-foreground border-r border-border">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-border">
        <Logo variant="auto" />
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className="lg:hidden text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {navGroups.map((group, i) => (
          <div key={group.label ?? `group-${i}`} className="space-y-0.5">
            {group.label && (
              <p className="px-3 pt-2 pb-1 text-[12px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {group.label}
              </p>
            )}
            {group.items.map(({ href, label, Icon }) => {
              const isActive =
                pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4.5 h-4.5 shrink-0",
                      isActive ? "text-primary-foreground" : "text-muted-foreground",
                    )}
                  />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Need Help card */}
      {/* <div className="px-4 pb-4">
        <div className="bg-brand-green/15 border border-brand-green/30 rounded-2xl p-4">
          <div className="w-8 h-8 rounded-full bg-brand-green/20 flex items-center justify-center mb-2">
            <Headphones className="w-4 h-4 text-brand-green" />
          </div>
          <p className="font-semibold text-white text-sm mb-0.5">Ready to Help?</p>
          <p className="text-white/45 text-xs mb-3 leading-relaxed">
            Get support from our technical team anytime.
          </p>
          <a
            href="mailto:support@vertexkashmirholidays.com"
            className="flex items-center justify-center gap-1 bg-brand-green hover:bg-brand-green/90 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
          >
            Get Support <ChevronRight className="w-3 h-3" />
          </a>
        </div>
      </div> */}

      {/* User info (links to profile) + sign out */}
      <div className="border-t border-border px-4 py-3 flex items-center gap-3">
        <Link
          href="/admin/profile"
          onClick={onClose}
          className="flex flex-1 min-w-0 items-center gap-3 rounded-lg -mx-1 px-1 py-1 transition-colors hover:bg-muted"
          title="My profile"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={userImage ?? undefined} alt="" />
            <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
              {userName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-foreground text-xs font-semibold truncate">{userName}</p>
            <p className="text-muted-foreground text-[12px] truncate">{userEmail}</p>
          </div>
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-muted-foreground hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function AdminShell({
  children,
  userId,
  userName,
  userEmail,
  userImage,
  permissions,
}: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop sidebar show/hide — defaults open (matches pre-existing behavior)
  // and persists across reloads via localStorage. Read after mount only, so
  // the server-rendered/first-paint markup always matches (avoids a hydration
  // mismatch from a stored "closed" preference).
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem("admin-sidebar-open");
    if (stored !== null) setDesktopSidebarOpen(stored === "true");
  }, []);
  function toggleDesktopSidebar() {
    setDesktopSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("admin-sidebar-open", String(next));
      return next;
    });
  }
  const pathname = usePathname();
  const { unlock } = useNotificationSound();
  const pageTitle =
    pathname === "/admin/profile" ? "My Profile" : (PAGE_TITLES[pathname] ?? "Admin");

  // Only show modules the current role may view, grouped into sidebar sections.
  // A group is dropped entirely if none of its modules are visible to this role.
  const navGroups: NavGroup[] = NAV_GROUPS.map((group) => ({
    label: group.label,
    items: [
      ...group.keys
        .filter((key) => permissions[key]?.view)
        .map((key) => {
          const mod = MODULES.find((m) => m.key === key)!;
          return { href: mod.href, label: mod.label, Icon: MODULE_ICONS[key] };
        }),
      ...(group.extra ?? [])
        .filter((item) => permissions[item.permKey]?.view)
        .map((item) => ({ href: item.href, label: item.label, Icon: item.Icon })),
    ],
  })).filter((group) => group.items.length > 0);

  return (
    <NotificationsProvider>
      <CallProvider currentUserId={userId} currentUserName={userName}>
        <div className="flex h-screen overflow-hidden bg-background" onClick={unlock}>
          {/* Desktop sidebar — collapses to 0 width when toggled off, rather
             than unmounting, so SidebarContent's own state isn't lost. */}
          <aside
            className={cn(
              "hidden shrink-0 overflow-hidden transition-[width] duration-200 lg:flex lg:flex-col",
              desktopSidebarOpen ? "w-56" : "w-0",
            )}
          >
            <div className="flex h-full w-56 flex-col">
              <SidebarContent
                pathname={pathname}
                navGroups={navGroups}
                userName={userName}
                userEmail={userEmail}
                userImage={userImage}
              />
            </div>
          </aside>

          {/* Mobile sidebar overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex">
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setSidebarOpen(false)}
              />
              <aside className="relative z-10 w-56 flex flex-col">
                <SidebarContent
                  pathname={pathname}
                  navGroups={navGroups}
                  userName={userName}
                  userEmail={userEmail}
                  userImage={userImage}
                  onClose={() => setSidebarOpen(false)}
                />
              </aside>
            </div>
          )}

          {/* Main content */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Topbar */}
            <header className="h-14 bg-card border-b border-border flex items-center justify-between px-5 shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden text-muted-foreground hover:text-foreground"
                  aria-label="Open sidebar"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <button
                  onClick={toggleDesktopSidebar}
                  className="hidden text-muted-foreground hover:text-foreground lg:inline-flex"
                  aria-label={desktopSidebarOpen ? "Hide navigation" : "Show navigation"}
                  title={desktopSidebarOpen ? "Hide navigation" : "Show navigation"}
                >
                  {desktopSidebarOpen ? (
                    <PanelLeftClose className="w-5 h-5" />
                  ) : (
                    <PanelLeftOpen className="w-5 h-5" />
                  )}
                </button>
                <h1 className="font-display font-bold text-foreground text-base">{pageTitle}</h1>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <Link
                  href="/"
                  target="_blank"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors hidden sm:inline"
                >
                  View Site
                </Link>
                <ThemeToggle />
                <PackageCalculator />
                <ChatInbox />
                <NotificationBell />
                <PresenceStatusPicker userImage={userImage} userName={userName} />
                <PresenceHeartbeat />
              </div>
            </header>

            {/* Page content — extra bottom padding on mobile so content clears the fixed bottom tab bar */}
            <main className="flex-1 overflow-y-auto px-1 sm:px-5 pt-1 sm:pt-5 pb-20 lg:p-6">
              {children}
            </main>
          </div>

          {/* Mobile bottom tab bar — quick access to the handful of sections staff need on a phone */}
          <MobileBottomTabs pathname={pathname} permissions={permissions} />

          {/* Global incoming call notification — rings from any page in the admin */}
          <Suspense>
            <GlobalCallNotification currentUserId={userId} />
          </Suspense>
        </div>
      </CallProvider>
    </NotificationsProvider>
  );
}
