import { signIn } from "@/lib/auth"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"

export default async function SignInPage() {
  const session = await auth()
  if (session) redirect("/dashboard")

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-full max-w-sm space-y-8 px-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">IronCoach</h1>
          <p className="text-zinc-400 text-sm">Ton coach IRONMAN personnel</p>
        </div>

        <div className="space-y-3">
          <form
            action={async () => {
              "use server"
              await signIn("strava", { redirectTo: "/onboarding" })
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-[#FC4C02] hover:bg-[#e04402] text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              Continuer avec Strava
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-black px-2 text-zinc-500">ou</span>
            </div>
          </div>

          <form
            action={async (formData: FormData) => {
              "use server"
              await signIn("credentials", {
                email: formData.get("email"),
                password: formData.get("password"),
                redirectTo: "/dashboard",
              })
            }}
            className="space-y-3"
          >
            <input
              name="email"
              type="email"
              placeholder="Email"
              required
              className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-zinc-600"
            />
            <input
              name="password"
              type="password"
              placeholder="Mot de passe"
              required
              className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-zinc-600"
            />
            <button
              type="submit"
              className="w-full bg-white hover:bg-zinc-100 text-black font-semibold py-3 px-4 rounded-lg transition-colors text-sm"
            >
              Se connecter
            </button>
          </form>
        </div>

        <p className="text-center text-zinc-600 text-xs">
          Strava nous permet d'analyser ta forme actuelle pour créer un plan personnalisé.
        </p>
      </div>
    </div>
  )
}
