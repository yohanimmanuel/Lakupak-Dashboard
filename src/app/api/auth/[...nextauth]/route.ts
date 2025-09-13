import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
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
                access_token: (account as any).access_token ?? null,
                refresh_token: (account as any).refresh_token ?? null,
                expires_at: (account as any).expires_at ?? null,
                id_token: (account as any).id_token ?? null,
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
          
          (session.user as any).id = dbUser.id;
          (session.user as any).firstName = dbUser.firstName;
          (session.user as any).lastName = dbUser.lastName;
          (session.user as any).phone = dbUser.phone;
          (session.user as any).bio = dbUser.bio;
          (session.user as any).location = dbUser.location;
          // Use Google profile image if available, otherwise use database avatar
          (session.user as any).avatar = session.user.image || dbUser.avatar;
          (session.user as any).companyId = dbUser.companyId;
          (session.user as any).company = dbUser.company;
          (session.user as any).region = dbUser.region;
          (session.user as any).currency = dbUser.currency;
        }
      } else if (token?.sub) {
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
