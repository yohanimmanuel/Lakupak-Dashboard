import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { compare } from "bcryptjs";

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
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
          location: user.location,
          avatar: user.avatar,
          image: user.image,
          name: user.name,
          companyId: user.companyId,
          company: user.company,
          region: user.region,
          currency: user.currency,
          language: user.language,
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
              token.location = dbUser.location;
              token.avatar = dbUser.avatar || dbUser.image;
              token.companyId = dbUser.companyId;
              token.company = dbUser.company;
              token.region = dbUser.region;
              token.currency = dbUser.currency;
              token.language = dbUser.language;

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
          id: number;
          firstName: string | null;
          lastName: string | null;
          phone: string | null;
          bio: string | null;
          location: string | null;
          avatar: string | null;
          companyId: number | null;
          company: unknown;
          region: string | null;
          currency: string | null;
          language: string | null;
        };

        const userId = typeof token.sub === 'string' ? parseInt(token.sub, 10) : token.sub as number;

        if (isNaN(userId)) {
          console.error("[NextAuth][SECURITY] Invalid user ID in session token - aborting session creation", {
            tokenSub: token.sub,
            tokenSubType: typeof token.sub,
            parsedValue: userId,
            userEmail: session.user?.email,
            hasEmail: !!session.user?.email,
            timestamp: new Date().toISOString()
          });
          throw new Error("Invalid user ID in session token - session creation aborted");
        }

        extendedUser.id = userId;
        extendedUser.firstName = (token as { firstName?: string }).firstName || null;
        extendedUser.lastName = (token as { lastName?: string }).lastName || null;
        extendedUser.phone = (token as { phone?: string }).phone || null;
        extendedUser.bio = (token as { bio?: string }).bio || null;
        extendedUser.location = (token as { location?: string }).location || null;
        extendedUser.avatar = (token as { avatar?: string }).avatar || session.user?.image || null;
        extendedUser.companyId = (token as { companyId?: number }).companyId || null;
        extendedUser.company = (token as { company?: unknown }).company || null;
        extendedUser.region = (token as { region?: string }).region || null;
        extendedUser.currency = (token as { currency?: string }).currency || null;
        extendedUser.language = (token as { language?: string }).language || null;
      }
      return session;
    },
  },
};
