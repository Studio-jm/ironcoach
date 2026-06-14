import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import type { Adapter, AdapterAccount } from "next-auth/adapters"
import Strava from "next-auth/providers/strava"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"

// Strava renvoie l'athleteId en Int — on force tout en String
// pour correspondre au champ providerAccountId: String de Prisma
function stravaCompatibleAdapter(adapter: Adapter): Adapter {
  return {
    ...adapter,
    getUserByAccount: async (params) =>
      adapter.getUserByAccount!({
        ...params,
        providerAccountId: String(params.providerAccountId),
      }),
    linkAccount: async (account: AdapterAccount) => {
      await adapter.linkAccount!({
        ...account,
        providerAccountId: String(account.providerAccountId),
      })
    },
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: stravaCompatibleAdapter(PrismaAdapter(prisma)),
  providers: [
    Strava({
      clientId: process.env.STRAVA_CLIENT_ID!,
      clientSecret: process.env.STRAVA_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "read,activity:read_all,profile:read_all",
        },
      },
      // Strava ne fournit pas d'email — on génère une identité synthétique
      profile(profile) {
        return {
          id: String(profile.id),
          name: `${profile.firstname ?? ""} ${profile.lastname ?? ""}`.trim() || `Athlete ${profile.id}`,
          email: `${profile.id}@strava.athlete`,
          image: profile.profile_medium ?? profile.profile,
        }
      },
    }),
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user) return null

        // TODO: bcrypt compare quand on ajoute le champ password
        return user
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
  events: {
    // Se déclenche APRÈS que l'utilisateur et le compte soient créés
    async linkAccount({ user, account }) {
      if (account.provider !== "strava" || !account.access_token) return
      if (!user.id) return

      try {
        await prisma.stravaToken.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            athleteId: parseInt(String(account.providerAccountId)),
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? "",
            expiresAt: new Date((account.expires_at ?? 0) * 1000),
            scope: account.scope ?? "",
          },
          update: {
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? "",
            expiresAt: new Date((account.expires_at ?? 0) * 1000),
            scope: account.scope ?? "",
          },
        })
      } catch (e) {
        console.error("[strava-token-save]", e)
      }
    },
    async signIn({ user, account }) {
      // Refresh du token Strava à chaque connexion (pour utilisateurs existants)
      if (account?.provider !== "strava" || !account.access_token || !user.id) return

      try {
        await prisma.stravaToken.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            athleteId: parseInt(String(account.providerAccountId)),
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? "",
            expiresAt: new Date((account.expires_at ?? 0) * 1000),
            scope: account.scope ?? "",
          },
          update: {
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? "",
            expiresAt: new Date((account.expires_at ?? 0) * 1000),
            scope: account.scope ?? "",
          },
        })
      } catch (e) {
        console.error("[strava-token-refresh]", e)
      }
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  session: { strategy: "database" },
})
