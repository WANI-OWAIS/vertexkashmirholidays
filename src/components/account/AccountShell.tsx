"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  CalendarDays,
  CreditCard,
  Star,
  UserCircle,
  LogOut,
  ClipboardList,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/atoms/ThemeToggle";
import { cn } from "@/lib/utils";

const BASE_NAV = [
  { href: "/account", label: "Overview", short: "Overview", Icon: LayoutDashboard },
  { href: "/account/bookings", label: "My Bookings", short: "Bookings", Icon: CalendarDays },
  { href: "/account/payments", label: "Payments", short: "Payments", Icon: CreditCard },
  { href: "/account/reviews", label: "My Reviews", short: "Reviews", Icon: Star },
  { href: "/account/profile", label: "Profile", short: "Profile", Icon: UserCircle },
];

// Shown only to B2B agents (agencyStatus set — any status, this is read-only
// history, see /account/requests). Normal customers never see this item.
const B2B_NAV_ITEM = {
  href: "/account/requests",
  label: "My Requests",
  short: "Requests",
  Icon: ClipboardList,
};

interface AccountShellProps {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  isB2bAgent?: boolean;
}

export function AccountShell({ children, userName, userEmail, isB2bAgent = false }: AccountShellProps) {
  const pathname = usePathname();
  const NAV = isB2bAgent ? [BASE_NAV[0], B2B_NAV_ITEM, ...BASE_NAV.slice(1)] : BASE_NAV;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <Logo href="/" />
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="min-w-0 text-right">
              <p className="truncate text-xs font-semibold text-foreground">{userName}</p>
              <p className="hidden truncate text-[12px] text-muted-foreground sm:block">
                {userEmail}
              </p>
            </div>
            <ThemeToggle />
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted sm:px-3"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-24 pt-6 lg:grid-cols-[220px_1fr] lg:px-6 lg:pb-6">
        {/* Sidebar — desktop only */}
        <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
          <nav className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-2">
            {NAV.map(({ href, label, Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground/70 hover:bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0">{children}</main>
      </div>

      {/* Bottom tab bar — mobile only */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.05)] lg:hidden">
        <div className="mx-auto flex max-w-md">
          {NAV.map(({ href, short, Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[12px] font-semibold transition-colors",
                  isActive ? "text-primary" : "text-foreground/55",
                )}
              >
                {isActive && (
                  <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" />
                )}
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
                {short}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
