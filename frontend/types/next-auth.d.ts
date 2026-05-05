import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      githubLogin?: string;
      githubId?: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubLogin?: string;
    githubId?: number;
    accessToken?: string;
  }
}
