import type { DefaultSession } from "next-auth";
import type { Role, B2BAgentStatus } from "@/lib/rbac";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      mustChangePassword: boolean;
      mfaPending: boolean;
      // Null for every non-B2B-agent user (the overwhelming majority). Never
      // used to gate login — only B2B-capability routes check this, and only
      // for ACTIVE (see .ai B2B architecture report, Phase 1).
      agencyStatus: B2BAgentStatus | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: Role;
    mustChangePassword?: boolean;
    agencyStatus?: B2BAgentStatus | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    mustChangePassword?: boolean;
    mfaPending?: boolean;
    agencyStatus?: B2BAgentStatus | null;
  }
}
