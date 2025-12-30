import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { compare } from "bcryptjs";

export const authOptions: NextAuthOptions = {
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
        
        const user = await prisma.user.findUnique({
          where: { email },
          include: { company: true }
        });

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
    async jwt({ token, account, profile, user, isNewUser, trigger }) {
      // When trigger === "update", this extends the session (called from SessionWarningModal)
      // NextAuth automatically refreshes the token expiry when this callback runs
      
      // Fetch user data from DB only on sign-in or when explicitly triggered
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
              // Store user data in token for future session callbacks (avoids DB query on every request)
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
              
              // Update user profile with Google data if this is a Google sign-in
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
            // Do not rethrow - allow auth to continue with existing token data
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
      // Use data from JWT token instead of querying DB on every request
      // This improves performance and prevents session issues from DB delays
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
        
        // Set user data from token (populated in jwt callback)
        // Validate token.sub before assigning to prevent invalid session creation
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

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };





