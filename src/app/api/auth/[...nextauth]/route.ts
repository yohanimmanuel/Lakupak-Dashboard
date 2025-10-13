import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as ReturnType<typeof PrismaAdapter>,
  session: { strategy: "jwt" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      try {
        const email = user?.email?.toLowerCase();
        if (!email || !account) return false;

        // If a user with this email already exists, ensure the Google account is linked to it
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
        }
        return true;
      } catch (e) {
        return false;
      }
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google") {
        token.provider = "google";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({ 
          where: { email: session.user.email.toLowerCase() },
          include: {
            company: true
          }
        });
        if (dbUser) {
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
          
          extendedUser.id = dbUser.id;
          extendedUser.firstName = dbUser.firstName;
          extendedUser.lastName = dbUser.lastName;
          extendedUser.phone = dbUser.phone;
          extendedUser.bio = dbUser.bio;
          extendedUser.location = dbUser.location;
          // Use Google profile image if available, otherwise use database avatar
          extendedUser.avatar = session.user.image || dbUser.avatar;
          extendedUser.companyId = dbUser.companyId;
          extendedUser.company = dbUser.company;
          extendedUser.region = dbUser.region;
          extendedUser.currency = dbUser.currency;
          extendedUser.language = dbUser.language;
        }
      } else if (token?.sub) {
        const extendedUser = session.user as typeof session.user & { id: string };
        extendedUser.id = token.sub;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };





