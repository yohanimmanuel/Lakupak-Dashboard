import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { compare } from "bcryptjs";
import type { NextRequest } from "next/server";
import { loginRateLimiter } from "@/utils/rateLimiter";

/**
 * NextAuth's `authorize(credentials, req)` passes a partial request whose `headers`
 * is a plain object. Adapt it to the minimal shape the rate limiter needs — a
 * `Headers` instance exposing `.get()` for client-IP extraction.
 */
function toRateLimitRequest(req: unknown): NextRequest {
  const raw =
    (req as { headers?: Record<string, string | string[] | undefined> } | undefined)?.headers ?? {};
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) headers.set(key, value.join(","));
    else if (typeof value === "string") headers.set(key, value);
  }
  return { headers } as unknown as NextRequest;
}

const raw = process.env.AUTH_SECRET;
if (typeof raw !== "string" || raw.trim() === "") {
  throw new Error(
    "AUTH_SECRET is required for NextAuth. Set a non-empty AUTH_SECRET in your environment (e.g. .env)."
  );
}
const authSecret = raw.trim();

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  adapter: PrismaAdapter(prisma) as ReturnType<typeof PrismaAdapter>,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Throttle brute-force password guessing from the browser login form.
        // Parity with the mobile/driver login routes, which all apply loginRateLimiter.
        const rateLimited = await loginRateLimiter(toRateLimitRequest(req));
        if (rateLimited) {
          throw new Error("TOO_MANY_ATTEMPTS");
        }

        const email = credentials.email.trim().toLowerCase();

        let user;
        try {
          user = await prisma.user.findUnique({
            where: { email },
            include: { company: true }
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const full = err instanceof Error ? (err.stack || msg) : String(err);
          console.error("[NextAuth][authorize] User.findUnique failed:", msg);
          console.error("[NextAuth][authorize] Full error:", full);
          throw err;
        }

        if (!user || !user.password) {
          return null;
        }
        if (user.isSuspended) {
          // Prevent login for suspended distributor accounts.
          throw new Error("ACCOUNT_SUSPENDED");
        }

        const isValid = await compare(credentials.password, user.password);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          bio: user.bio,
          avatar: user.avatar,
          image: user.image,
          name: user.name,
          companyId: user.companyId,
          company: user.company,
          region: user.region,
          currency: user.currency,
          language: user.language,
          isSuspended: user.isSuspended ?? false,
        };
      }
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: false,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile"
        }
      }
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        const email = user?.email?.toLowerCase();
        if (!email || !account) return false;

        const googleName = (profile?.name as string) || user.name || '';
        const nameParts = googleName.trim().split(' ').filter(part => part.length > 0);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        const googleProfile = profile as { picture?: string } & typeof profile;
        const googleImage = googleProfile?.picture || user.image || null;

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          if (existing.isSuspended) {
            // Surface suspension to the client instead of silently denying.
            // NextAuth `signIn` callback supports returning a string to redirect.
            return '/login?error=ACCOUNT_SUSPENDED';
          }
          const linked = await prisma.account.findFirst({
            where: { provider: account.provider, providerAccountId: account.providerAccountId as string },
          });
          if (!linked) {
            await prisma.account.create({
              data: {
                userId: existing.id,
                type: account.type as string,
                provider: account.provider,
                providerAccountId: account.providerAccountId as string,
                access_token: (account as { access_token?: string }).access_token ?? null,
                refresh_token: (account as { refresh_token?: string }).refresh_token ?? null,
                expires_at: (account as { expires_at?: number }).expires_at ?? null,
                id_token: (account as { id_token?: string }).id_token ?? null,
              },
            });
          }

          const updateData: {
            firstName?: string;
            lastName?: string;
            avatar?: string | null;
            name?: string;
            image?: string | null;
          } = {};

          if ((!existing.firstName || existing.firstName.trim() === '') && firstName) {
            updateData.firstName = firstName;
          }
          if ((!existing.lastName || existing.lastName.trim() === '') && lastName) {
            updateData.lastName = lastName;
          }
          if ((!existing.avatar || existing.avatar.trim() === '') && googleImage) {
            updateData.avatar = googleImage;
          }
          if ((!existing.name || existing.name.trim() === '') && googleName) {
            updateData.name = googleName;
          }
          if ((!existing.image || existing.image.trim() === '') && googleImage) {
            updateData.image = googleImage;
          }

          if (Object.keys(updateData).length > 0) {
            await prisma.user.update({
              where: { id: existing.id },
              data: updateData,
            });
          }
        }
        return true;
      } catch {
        return false;
      }
    },
    async jwt({ token, account, profile, user, trigger }) {
      const shouldFetchUser = account?.provider === "google" || account?.provider === "credentials" || trigger === "update" || !token.sub;

      if (shouldFetchUser && (user?.email || token.email)) {
        const email = ((user?.email as string) || token.email)?.toLowerCase();
        if (email) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { email },
              include: { company: true }
            });

            if (dbUser) {
              token.sub = dbUser.id.toString();
              token.firstName = dbUser.firstName;
              token.lastName = dbUser.lastName;
              token.phone = dbUser.phone;
              token.bio = dbUser.bio;
              token.avatar = dbUser.avatar || dbUser.image;
              token.companyId = dbUser.companyId;
              token.company = dbUser.company;
              token.region = dbUser.region;
              token.currency = dbUser.currency;
              token.language = dbUser.language;
              token.isSuspended = dbUser.isSuspended ?? false;
              token.suspendedAt = dbUser.suspendedAt ? dbUser.suspendedAt.toISOString() : null;
              token.suspensionReason = dbUser.suspensionReason ?? null;

              if (account?.provider === "google" && profile) {
                const googleName = (profile.name as string) || '';
                const nameParts = googleName.trim().split(' ').filter(part => part.length > 0);
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';
                const googleProfile = profile as { picture?: string } & typeof profile;
                const googleImage = googleProfile?.picture || null;

                const updateData: {
                  firstName?: string;
                  lastName?: string;
                  avatar?: string | null;
                  name?: string;
                  image?: string | null;
                } = {};

                if ((!dbUser.firstName || dbUser.firstName.trim() === '') && firstName) {
                  updateData.firstName = firstName;
                  token.firstName = firstName;
                }
                if ((!dbUser.lastName || dbUser.lastName.trim() === '') && lastName) {
                  updateData.lastName = lastName;
                  token.lastName = lastName;
                }
                if ((!dbUser.avatar || dbUser.avatar.trim() === '') && googleImage) {
                  updateData.avatar = googleImage;
                  token.avatar = googleImage;
                }
                if ((!dbUser.name || dbUser.name.trim() === '') && googleName) {
                  updateData.name = googleName;
                }
                if ((!dbUser.image || dbUser.image.trim() === '') && googleImage) {
                  updateData.image = googleImage;
                }

                if (Object.keys(updateData).length > 0) {
                  await prisma.user.update({
                    where: { id: dbUser.id },
                    data: updateData,
                  });
                }
              }
            }
          } catch (error) {
            console.error("[NextAuth][JWT] Database error during user fetch/update - continuing with existing token", {
              email,
              errorMessage: error instanceof Error ? error.message : String(error),
              errorName: error instanceof Error ? error.name : 'Unknown',
              timestamp: new Date().toISOString(),
              trigger,
              provider: account?.provider,
              hasExistingToken: !!token.sub
            });
          }
        }
      }

      if (account?.provider === "google") {
        token.provider = "google";
      } else if (account?.provider === "credentials") {
        token.provider = "credentials";
      }

      return token;
    },
    async session({ session, token }) {
      if (token?.sub && session.user) {
        const extendedUser = session.user as typeof session.user & {
          id: string;
          firstName: string | null;
          lastName: string | null;
          phone: string | null;
          bio: string | null;
          avatar: string | null;
          companyId: number | null;
          company: unknown;
          region: string | null;
          currency: string | null;
          language: string | null;
          isSuspended?: boolean;
          suspendedAt?: string | null;
          suspensionReason?: string | null;
        };

        const userIdStr = String(token.sub);
        const userIdNum = Number.parseInt(userIdStr, 10);

        if (Number.isNaN(userIdNum)) {
          console.error("[NextAuth][SECURITY] Invalid user ID in session token - aborting session creation", {
            tokenSub: token.sub,
            tokenSubType: typeof token.sub,
            parsedValue: userIdNum,
            userEmail: session.user?.email,
            hasEmail: !!session.user?.email,
            timestamp: new Date().toISOString()
          });
          throw new Error("Invalid user ID in session token - session creation aborted");
        }

        extendedUser.id = userIdStr;
        extendedUser.firstName = (token as { firstName?: string }).firstName || null;
        extendedUser.lastName = (token as { lastName?: string }).lastName || null;
        extendedUser.phone = (token as { phone?: string }).phone || null;
        extendedUser.bio = (token as { bio?: string }).bio || null;
        extendedUser.avatar = (token as { avatar?: string }).avatar || session.user?.image || null;
        extendedUser.companyId = (token as { companyId?: number }).companyId || null;
        extendedUser.company = (token as { company?: unknown }).company || null;
        extendedUser.region = (token as { region?: string }).region || null;
        extendedUser.currency = (token as { currency?: string }).currency || null;
        extendedUser.language = (token as { language?: string }).language || null;
        extendedUser.isSuspended = token.isSuspended ?? false;
        extendedUser.suspendedAt = token.suspendedAt ?? null;
        extendedUser.suspensionReason = token.suspensionReason ?? null;
      }
      return session;
    },
  },
};
