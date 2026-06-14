import Link from "next/link"

const ERRORS: Record<string, string> = {
  Configuration: "Problème de configuration du serveur.",
  AccessDenied: "Accès refusé. Tu as peut-être annulé la connexion.",
  Verification: "Le lien de vérification a expiré.",
  Default: "Une erreur est survenue lors de la connexion.",
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const message = ERRORS[error ?? "Default"] ?? ERRORS.Default

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="text-4xl">⚠️</div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-white">Erreur de connexion</h1>
          <p className="text-zinc-400 text-sm">{message}</p>
          {error && (
            <p className="text-zinc-600 text-xs font-mono">Code : {error}</p>
          )}
        </div>
        <Link
          href="/auth/signin"
          className="inline-block bg-white text-black font-semibold px-6 py-2.5 rounded-lg hover:bg-zinc-100 transition-colors text-sm"
        >
          Réessayer
        </Link>
      </div>
    </div>
  )
}
