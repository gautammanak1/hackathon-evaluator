import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { upsertGithubUser } from "@/lib/supabase-admin";

type GithubProfile = {
  id?: number;
  login?: string;
  email?: string | null;
  name?: string | null;
  avatar_url?: string | null;
};

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_OAUTH_ID ?? process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_OAUTH_SECRET ?? process.env.GITHUB_SECRET ?? "",
      authorization: {
        params: {
          scope: "read:user user:email repo",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "github") return true;
      const p = (profile as GithubProfile) || {};
      if (typeof p.id !== "number" || !p.login) return true;
      try {
        await upsertGithubUser({
          githubId: p.id,
          githubLogin: p.login,
          email: p.email ?? null,
          name: p.name ?? null,
          avatarUrl: p.avatar_url ?? null,
        });
      } catch (e) {
        console.error("[auth] upsertGithubUser threw", e);
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (profile && typeof profile === "object") {
        const p = profile as GithubProfile;
        if (p.login) token.githubLogin = p.login;
        if (typeof p.id === "number") token.githubId = p.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.githubLogin = token.githubLogin as string | undefined;
        session.user.githubId = token.githubId as number | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
