export const IRONMAN_SYSTEM_PROMPT = `Tu es IronCoach, un coach triathlon expert spécialisé dans la préparation IRONMAN et Half-IRONMAN.

## Tes compétences
- Périodisation de l'entraînement triathlon sur 20-32 semaines
- Zones d'entraînement (Z1-Z5) en natation, vélo, course à pied
- Training Stress Score (TSS), Chronic Training Load (CTL), Acute Training Load (ATL)
- Nutrition, récupération, prévention des blessures
- Adaptation du volume et de l'intensité selon la fatigue de l'athlète
- Intégration de plans externes (coach trail, etc.) sans empiéter sur leur logique

## Disciplines IRONMAN
- Natation : 3,8 km
- Vélo : 180 km
- Course à pied : 42,2 km

## Phases d'un plan IRONMAN type
1. **Base** (semaines 1-8) : volume faible, endurance aérobie, technique
2. **Build 1** (semaines 9-14) : volume croissant, seuil lactique
3. **Build 2** (semaines 15-20) : intensité spécifique, briques
4. **Peak** (semaines 21-24) : charge maximale, simulations de course
5. **Taper** (semaines 25-26) : réduction du volume, maintien de l'intensité
6. **Race Week** (semaine 27+) : activation, récupération

## Format des sessions
Chaque session doit inclure :
- discipline (swim / bike / run / strength / brick)
- durée en minutes
- zone d'intensité (Z1=récupération, Z2=endurance, Z3=tempo, Z4=seuil, Z5=VO2max)
- description courte (ex: "45min Z2 + 4x5min Z4")
- TSS estimé
- source : "ai" (généré) ou "external" (Campus Coach) ou "strength" (renfo libre)

## Règles de coaching
- Ne jamais augmenter la charge de plus de 10% par semaine
- Semaine de récupération toutes les 3-4 semaines (volume -30%)
- Toujours prioriser la récupération si fatigue > 7/10
- Les sorties longues (vélo, run) doivent être placées le weekend (samedi ou dimanche)
- Les briques (vélo→run) idéalement le dimanche
- Le weekend autorise 2 séances par jour (ex: natation matin / vélo après-midi)
- Lundi est généralement le jour de repos
- Adapter les séances à la disponibilité réelle de l'athlète
- Répondre en français`

// ─────────────────────────────────────────────────────────────────────────────

type CampusCoachSession = {
  num: number
  type: string
  duree_min: number
  intensite?: string
  structure?: unknown
  denivele_positif_m?: { min: number; max: number }
}

type CampusCoachWeek = {
  semaine: number
  dates: string
  type_semaine?: string
  seances: CampusCoachSession[]
}

type CampusCoachPlan = {
  programme_running: {
    duree_semaines: number
    seances_par_semaine: number
    semaines: CampusCoachWeek[]
  }
}

type Race = {
  date: string
  name: string
  distanceKm: number
  elevationM: number
  priority: string
  type: string
}

// Convertit les types Campus Coach vers le format IronCoach
function campusCoachTypeToZone(type: string): string {
  const map: Record<string, string> = {
    endurance_fondamentale: "Z2",
    seuil: "Z4",
    vo2max_lignes_droites: "Z5",
    sortie_longue: "Z2",
    tempo: "Z3",
    recuperation: "Z1",
  }
  return map[type] ?? "Z2"
}

function describeCampusCoachSession(s: CampusCoachSession): string {
  if (s.structure) {
    const struct = s.structure as {
      echauffement_min?: number
      intervalles?: { repetitions: number; effort_min?: number; effort_sec?: number; recuperation_min?: number; recuperation_sec?: number }
      retour_calme_min?: number
    }
    const parts: string[] = []
    if (struct.echauffement_min) parts.push(`éch. ${struct.echauffement_min}min`)
    if (struct.intervalles) {
      const i = struct.intervalles
      const effort = i.effort_min ? `${i.effort_min}min` : `${i.effort_sec}s`
      const recup = i.recuperation_min ? `${i.recuperation_min}min` : `${i.recuperation_sec}s`
      parts.push(`${i.repetitions}×(${effort}/${recup})`)
    }
    if (struct.retour_calme_min) parts.push(`retour ${struct.retour_calme_min}min`)
    return parts.join(" + ")
  }
  const denivele = s.denivele_positif_m
    ? ` (${s.denivele_positif_m.min}-${s.denivele_positif_m.max}m D+)`
    : ""
  return `${s.duree_min}min ${s.intensite ?? ""}${denivele}`.trim()
}

// Estime un TSS approximatif depuis le type de séance Campus Coach
function estimateTss(s: CampusCoachSession): number {
  const baseRate: Record<string, number> = {
    endurance_fondamentale: 0.7,
    sortie_longue: 0.8,
    seuil: 1.4,
    tempo: 1.1,
    vo2max_lignes_droites: 1.6,
    recuperation: 0.5,
  }
  const rate = baseRate[s.type] ?? 0.9
  return Math.round(s.duree_min * rate)
}

// Sérialise le plan Campus Coach pour Claude (forme lisible)
export function serializeCampusCoachForClaude(plan: CampusCoachPlan): unknown {
  return {
    duree_semaines: plan.programme_running.duree_semaines,
    seances_par_semaine: plan.programme_running.seances_par_semaine,
    semaines: plan.programme_running.semaines.map((w) => ({
      semaine: w.semaine,
      dates: w.dates,
      type_semaine: w.type_semaine ?? "normale",
      seances: w.seances.map((s) => ({
        externalRef: `run_w${w.semaine}_s${s.num}`,
        type: s.type,
        durationMin: s.duree_min,
        zone: campusCoachTypeToZone(s.type),
        description: describeCampusCoachSession(s),
        tss: estimateTss(s),
        // Suggestion de placement (sortie longue → weekend, seuil → milieu de semaine)
        preferredDay:
          s.type === "sortie_longue" ? "saturday" :
          s.type === "seuil" || s.type === "vo2max_lignes_droites" ? "wednesday" :
          "tuesday",
      })),
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function buildPlanPrompt(params: {
  profile: Record<string, unknown>
  stravaSnapshot: Record<string, unknown>
  planConfig: {
    targetEvent: string
    targetGoal: string
    targetDate: string | null
    weeklySwimHours: number
    weeklyBikeHours: number
    restDays: string[]
    strengthDays: string[]
    startDate: string
    runManagementMode: "external_run" | "manage_run"
  }
  externalRunPlan: CampusCoachPlan | null
  targetRaces: Race[]
}) {
  const externalPlanBlock =
    params.externalRunPlan && params.planConfig.runManagementMode === "external_run"
      ? `## Plan course à pied externe (Campus Coach)
L'athlète suit un plan de course à pied externe pour les ${params.externalRunPlan.programme_running.duree_semaines} prochaines semaines.
Tu dois **placer ces séances dans le planning sans les modifier** (durée, intensité, structure).
Marque-les avec source: "external" et garde leur externalRef.

\`\`\`json
${JSON.stringify(serializeCampusCoachForClaude(params.externalRunPlan), null, 2)}
\`\`\`

⚠️ Règles strictes pour le placement des runs externes :
- Sortie longue (type "sortie_longue") → samedi de préférence, sinon dimanche
- Seuil ou VO2max → milieu de semaine (mardi/mercredi/jeudi), pas la veille d'une autre séance dure
- Endurance facile → mardi ou jeudi pour répartir
- Aucun run le lundi (repos) ni le vendredi (renfo)
- Ces séances sont NON MODIFIABLES — tu les recopies telles quelles
`
      : params.planConfig.runManagementMode === "manage_run"
      ? `## Course à pied
L'athlète n'a pas de coach externe pour la course. Tu génères les séances run normalement (3 par semaine recommandé pour un IRONMAN).`
      : `## Course à pied
Mode dégradé : pas de plan externe fourni pour ce bloc. Génère 3 séances run minimalistes (endurance Z2, surtout) en attendant le prochain plan Campus Coach.`

  const racesBlock = params.targetRaces.length > 0
    ? `## Courses intermédiaires
L'athlète participe à ces courses avant l'IRONMAN principal :

${params.targetRaces.map((r) => `- **${r.date}** : ${r.name} — ${r.distanceKm}km${r.elevationM > 0 ? ` / ${r.elevationM}m D+` : ""} (priorité ${r.priority}, type ${r.type})`).join("\n")}

Règles pour ces courses :
- Priorité A : taper 10 jours avant (semaine de course = Race Week), récupération complète après (-50%)
- Priorité B : taper 5-7 jours avant (réduire natation et vélo), récup -30% la semaine d'après
- Priorité C : pas de taper, juste un long facile la veille
- Ne jamais programmer de séance dure dans les 3 jours qui précèdent
`
    : ""

  const strengthBlock = params.planConfig.strengthDays.length > 0
    ? `## Renforcement (placeholder)
L'athlète gère son renforcement lui-même les jours suivants : ${params.planConfig.strengthDays.join(", ")}.
Pour CHAQUE semaine détaillée, ajoute une séance avec :
- day: <un de ces jours>
- discipline: "strength"
- source: "strength"
- durationMin: 60
- zone: "Z2"
- description: "Renforcement (géré par l'athlète)"
- tss: 0
N'ajoute AUCUNE autre séance sur ces jours.`
    : ""

  return `Génère un plan d'entraînement complet pour un athlète souhaitant réaliser un ${params.planConfig.targetEvent}.

## Profil athlète
${JSON.stringify(params.profile, null, 2)}

## Données Strava (12 dernières semaines)
${JSON.stringify(params.stravaSnapshot, null, 2)}

## Configuration du plan
- Objectif : ${params.planConfig.targetGoal}
- Date de la course : ${params.planConfig.targetDate ?? "Non définie — préparation continue"}
- Début du plan : ${params.planConfig.startDate}
- Disponibilité natation : ${params.planConfig.weeklySwimHours}h/semaine
- Disponibilité vélo : ${params.planConfig.weeklyBikeHours}h/semaine
- Jours de repos : ${params.planConfig.restDays.join(", ")}
- Jours de renforcement (gérés par l'athlète) : ${params.planConfig.strengthDays.join(", ") || "aucun"}

${externalPlanBlock}

${racesBlock}

${strengthBlock}

## Tâche
Génère :
1. L'**overview complet** du plan (phases, total de semaines, analyse Strava)
2. Le plan **détaillé des 4 premières semaines** :
   - Pour chaque jour, planifie les séances en respectant strictement :
     - Jours de repos : aucune séance
     - Jours de renforcement : uniquement le placeholder strength
     - Sorties longues et briques le weekend (samedi/dimanche)
     - Runs externes placés selon leur type (cf. règles ci-dessus)
   - Le weekend, 2 séances/jour autorisées (ex: natation matin + vélo après-midi)
3. Le **squelette des semaines restantes** (juste weekNumber, phase, plannedTSS estimé)

Format JSON exact :

\`\`\`json
{
  "overview": {
    "totalWeeks": 24,
    "phases": [
      { "name": "Base", "weeks": "1-8", "focus": "Endurance aérobie, technique" }
    ],
    "initialAssessment": "Analyse de la forme actuelle basée sur Strava...",
    "keyRecommendations": ["Conseil 1", "Conseil 2"]
  },
  "detailedWeeks": [
    {
      "weekNumber": 1,
      "phase": "Base 1",
      "plannedTSS": 200,
      "aiNotes": "Semaine d'adaptation...",
      "sessions": [
        {
          "day": "monday",
          "discipline": "swim",
          "durationMin": 45,
          "zone": "Z2",
          "description": "Endurance aérobie, technique crawl",
          "tss": 40,
          "source": "ai",
          "externalRef": null
        }
      ]
    }
  ],
  "skeletonWeeks": [
    { "weekNumber": 5, "phase": "Base 2", "plannedTSS": 220 }
  ]
}
\`\`\`

Règles :
- detailedWeeks : EXACTEMENT 4 semaines (numéros 1, 2, 3, 4) ou autant que le plan Campus Coach en couvre
- skeletonWeeks : toutes les autres semaines jusqu'à totalWeeks
- Total = detailedWeeks + skeletonWeeks = totalWeeks
- Réponds UNIQUEMENT avec le JSON, sans markdown.`
}

// ─────────────────────────────────────────────────────────────────────────────

export function buildCheckInPrompt(params: {
  currentWeek: Record<string, unknown>
  nextWeekDraft: Record<string, unknown>
  checkIn: {
    fatigueScore: number
    motivationScore: number
    sorenessScore: number
    sessionsDone: number
    sessionsPlanned: number
    notes: string
    sickDays: number
    travelDays: number
  }
  recentStravaActivities: Record<string, unknown>[]
  externalRunPlan?: CampusCoachPlan | null
  targetRaces?: Race[]
  strengthDays?: string[]
  runManagementMode?: "external_run" | "manage_run"
}) {
  const compliance = Math.round((params.checkIn.sessionsDone / params.checkIn.sessionsPlanned) * 100)

  const externalBlock = params.externalRunPlan
    ? `\n## Plan course externe en cours\n\`\`\`json\n${JSON.stringify(serializeCampusCoachForClaude(params.externalRunPlan), null, 2)}\n\`\`\`\nUtilise les séances correspondant à la semaine suivante. Source: "external".`
    : ""

  const racesBlock = params.targetRaces && params.targetRaces.length > 0
    ? `\n## Courses à venir\n${params.targetRaces.map((r) => `- ${r.date} : ${r.name} (${r.priority})`).join("\n")}`
    : ""

  const strengthBlock = params.strengthDays && params.strengthDays.length > 0
    ? `\n## Jours de renfo (placeholder)\nGarde un placeholder strength sur : ${params.strengthDays.join(", ")}`
    : ""

  return `Analyse le check-in hebdomadaire et ajuste le plan de la semaine suivante.

## Semaine écoulée (planifiée)
${JSON.stringify(params.currentWeek, null, 2)}

## Check-in de l'athlète
- Fatigue : ${params.checkIn.fatigueScore}/10
- Motivation : ${params.checkIn.motivationScore}/10
- Courbatures : ${params.checkIn.sorenessScore}/10 (10 = aucune)
- Séances réalisées : ${params.checkIn.sessionsDone}/${params.checkIn.sessionsPlanned} (${compliance}%)
- Jours maladie : ${params.checkIn.sickDays}
- Jours voyage/contrainte : ${params.checkIn.travelDays}
- Notes : ${params.checkIn.notes || "Aucune"}

## Activités Strava réelles (semaine)
${JSON.stringify(params.recentStravaActivities, null, 2)}

## Plan initial semaine suivante
${JSON.stringify(params.nextWeekDraft, null, 2)}
${externalBlock}${racesBlock}${strengthBlock}

## Tâche
Analyse la situation et génère le plan ajusté pour la semaine suivante en JSON :

\`\`\`json
{
  "adjustment": "normal|reduce|increase|recovery",
  "rationale": "Explication courte de l'ajustement...",
  "adjustedSessions": [
    {
      "day": "monday",
      "discipline": "swim",
      "durationMin": 45,
      "zone": "Z2",
      "description": "...",
      "tss": 40,
      "source": "ai",
      "externalRef": null
    }
  ],
  "plannedTSS": 220,
  "coachMessage": "Message motivant personnalisé pour l'athlète..."
}
\`\`\`

Règles :
- Si fatigue >= 8 → semaine de récupération obligatoire (-30% volume)
- Si compliance < 50% → réduire le volume de 20%
- Si compliance > 90% ET motivation >= 8 → possible légère augmentation (+5%)
- Toujours expliquer le raisonnement à l'athlète
- Les sessions externes (Campus Coach) sont à placer telles quelles
- Les jours de renfo restent intouchables

Réponds uniquement avec le JSON, sans markdown.`
}
