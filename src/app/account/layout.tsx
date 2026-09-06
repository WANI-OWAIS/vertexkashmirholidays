import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { auth } from "@/lib/auth";
import { AccountShell } from "@/components/account/AccountShell";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SiteAnalytics } from "@/components/providers/SiteAnalytics";
import { CookieConsentManager } from "@/components/providers/CookieConsentManager";
import { OfflineBanner } from "@/components/layout/OfflineBanner";

// This layout already calls auth() (fully dynamic on every request
// regardless), so reading the CSP nonce via headers() here costs nothing
// extra. GTM does load on /account today (only /admin is excluded), so
// <SiteAnalytics> is included here to match that exactly.
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;

  // SessionProvider lets client components (e.g. the forced password-change form)
  // call useSession().update() to refresh the JWT after a server-side change.
  return (
    <SessionProvider session={session}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        nonce={nonce}
      >
        <SiteAnalytics nonce={nonce} />
        <CookieConsentManager />
        <OfflineBanner />
        <AccountShell
          userName={session.user.name ?? "Traveller"}
          userEmail={session.user.email ?? ""}
          isB2bAgent={session.user.agencyStatus !== null}
        >
          {children}
        </AccountShell>
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </SessionProvider>
  );
}
