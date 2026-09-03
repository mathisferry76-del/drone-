export const metadata = {
  title: "Politique de confidentialité",
  description: "Politique de confidentialité et protection des données du site MIN IA.",
  alternates: { canonical: "/confidentialite" },
};

export default function ConfidentialitePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16 text-sm leading-relaxed text-zinc-300">
      <h1 className="text-3xl font-extrabold text-white">Politique de confidentialité</h1>
      <p className="mt-2 text-zinc-500">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">Responsable du traitement</h2>
        <p>
          Mathis Ferry, Rue du Général Koenig, 76360 Barentin, France —{" "}
          <a href="mailto:contact@min-ia.fr" className="text-yellow-400 hover:underline">
            contact@min-ia.fr
          </a>
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">Données collectées</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Adresse email (création de compte, connexion)</li>
          <li>Mot de passe, si tu choisis d&apos;en définir un (stocké de façon chiffrée, jamais en clair)</li>
          <li>Photos que tu envoies pour générer une miniature, et les miniatures générées (conservées dans ton historique)</li>
          <li>Informations de compte (solde de crédits, packs achetés) — les coordonnées bancaires ne sont jamais collectées ni stockées par MIN IA, elles sont traitées exclusivement par Stripe</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">Finalités du traitement</h2>
        <p>Tes données sont utilisées pour :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Fournir le service (génération de miniatures, gestion de ton compte et de ton historique)</li>
          <li>Gérer tes achats de crédits</li>
          <li>Prévenir les abus (par exemple, limiter l&apos;essai gratuit à une utilisation par compte)</li>
          <li>Répondre à tes demandes envoyées à contact@min-ia.fr</li>
        </ul>
        <p>
          La base légale de ces traitements est l&apos;exécution du contrat
          qui te lie à MIN IA lorsque tu crées un compte ou achètes des
          crédits.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">Destinataires des données</h2>
        <p>Certaines données sont partagées avec les prestataires suivants, uniquement pour faire fonctionner le service :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Supabase</strong> — hébergement de la base de données, de l&apos;authentification et du stockage des miniatures</li>
          <li><strong>Stripe</strong> — traitement des paiements et de la facturation</li>
          <li><strong>OpenAI</strong> — traitement des photos envoyées lorsque tu utilises l&apos;amélioration par intelligence artificielle</li>
          <li><strong>Vercel</strong> — hébergement du site</li>
          <li><strong>Resend</strong> — envoi des emails de connexion et de notification</li>
        </ul>
        <p>Aucune donnée n&apos;est vendue à des tiers.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">Durée de conservation</h2>
        <p>
          Tes données sont conservées tant que ton compte est actif. Tu peux
          supprimer une miniature de ton historique à tout moment. Pour la
          suppression complète de ton compte et de tes données, contacte-nous
          à contact@min-ia.fr.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">Cookies</h2>
        <p>
          Le site utilise uniquement des cookies/stockage technique
          nécessaires à ta connexion (session de compte). Aucun cookie
          publicitaire ou traceur tiers n&apos;est utilisé à ce jour.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">Tes droits</h2>
        <p>
          Conformément au Règlement Général sur la Protection des Données
          (RGPD), tu disposes d&apos;un droit d&apos;accès, de rectification,
          d&apos;effacement et de portabilité de tes données, ainsi que d&apos;un
          droit d&apos;opposition. Pour exercer ces droits, écris à{" "}
          <a href="mailto:contact@min-ia.fr" className="text-yellow-400 hover:underline">
            contact@min-ia.fr
          </a>.
        </p>
      </section>
    </div>
  );
}
