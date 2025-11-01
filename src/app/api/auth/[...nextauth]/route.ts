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
    async signIn({ user, account, profile }) {
      try {
        const email = user?.email?.toLowerCase();
        if (!email || !account) return false;

        // Extract firstName, lastName from Google profile name
        const googleName = (profile?.name as string) || user.name || '';
        const nameParts = googleName.trim().split(' ').filter(part => part.length > 0);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        // Get Google profile image (Google provider includes picture in profile)
        const googleProfile = profile as { picture?: string } & typeof profile;
        const googleImage = googleProfile?.picture || user.image || null;

        // If a user with this email already exists, ensure the Google account is linked to it
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          // Link Google account if not already linked
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
          
          // Update user profile if firstName, lastName, or avatar are missing
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
          
          // Also update NextAuth's name and image fields if missing
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
        } else {
          // New user - PrismaAdapter will create the user, but we need to update it with firstName, lastName, avatar
          // We'll do this after the adapter creates the user in the jwt callback
        }
        return true;
      } catch (e) {
        return false;
      }
    },
    async jwt({ token, account, profile, user, isNewUser }) {
      if (account?.provider === "google") {
        token.provider = "google";
        
        // For new Google users or when account is present (first sign-in), extract and store firstName, lastName, avatar
        if (account && (isNewUser || user?.email) && profile) {
          const email = ((user?.email as string) || token.email)?.toLowerCase();
          if (!email) return token;
          
          // Extract name parts from Google profile
          const googleName = (profile.name as string) || (user?.name as string) || '';
          const nameParts = googleName.trim().split(' ').filter(part => part.length > 0);
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';
          
          // Get Google profile image (Google provider includes picture in profile)
          const googleProfile = profile as { picture?: string } & typeof profile;
          const googleImage = googleProfile?.picture || (user?.image as string) || null;
          
          // Find the user (newly created by adapter or existing)
          const dbUser = await prisma.user.findUnique({ where: { email } });
          
          if (dbUser) {
            // Update user with firstName, lastName, avatar if missing
            const updateData: {
              firstName?: string;
              lastName?: string;
              avatar?: string | null;
              name?: string;
              image?: string | null;
            } = {};
            
            if ((!dbUser.firstName || dbUser.firstName.trim() === '') && firstName) {
              updateData.firstName = firstName;
            }
            if ((!dbUser.lastName || dbUser.lastName.trim() === '') && lastName) {
              updateData.lastName = lastName;
            }
            if ((!dbUser.avatar || dbUser.avatar.trim() === '') && googleImage) {
              updateData.avatar = googleImage;
            }
            
            // Also update NextAuth's name and image fields
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
          extendedUser.firstName = dbUser.firstName || dbUser.name?.split(' ')[0] || '';
          extendedUser.lastName = dbUser.lastName || dbUser.name?.split(' ').slice(1).join(' ') || '';
          extendedUser.phone = dbUser.phone;
          extendedUser.bio = dbUser.bio;
          extendedUser.location = dbUser.location;
          // Use database avatar first, then NextAuth image, then session image
          extendedUser.avatar = dbUser.avatar || dbUser.image || session.user.image || null;
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





