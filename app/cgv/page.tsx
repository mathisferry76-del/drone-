export const metadata = {
  title: "Conditions Générales de Vente",
  description: "Conditions générales de vente des abonnements et packs de crédits MIN IA.",
  alternates: { canonical: "/cgv" },
};

export default function CgvPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16 text-sm leading-relaxed text-zinc-300">
      <h1 className="text-3xl font-extrabold text-white">Conditions Générales de Vente</h1>
      <p className="mt-2 text-zinc-500">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">1. Objet</h2>
        <p>
          Les présentes Conditions Générales de Vente (CGV) régissent la
          souscription aux abonnements et l&apos;achat de packs de crédits sur
          le service MIN IA, un générateur d&apos;images par intelligence
          artificielle (retouche photo et miniatures pour créateurs de contenu
          YouTube, TikTok, Reels), édité par Mathis Ferry (voir{" "}
          <a href="/mentions-legales" className="text-yellow-400 hover:underline">
            mentions légales
          </a>
          ).
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">2. Description du service</h2>
        <p>
          MIN IA permet de transformer une photo fournie par l&apos;utilisateur
          via des styles de filtres (gratuits et illimités pour tout compte
          connecté) et une amélioration par intelligence artificielle
          générative. Chaque génération par IA consomme des crédits prépayés
          associés au compte, rechargés soit automatiquement chaque mois par
          un abonnement, soit ponctuellement par l&apos;achat d&apos;un pack.
          Un essai gratuit unique par compte donne accès à une première
          génération IA sans dépenser de crédits.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">3. Abonnements, packs et prix</h2>
        <p>
          Trois formules d&apos;abonnement mensuel sont proposées, sans
          engagement de durée, chacune rechargeant un nombre fixe de crédits à
          chaque renouvellement :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Starter — 15 € / mois — 2000 crédits</li>
          <li>Creator — 40 € / mois — 6000 crédits</li>
          <li>Pro — 90 € / mois — 15 000 crédits</li>
        </ul>
        <p>
          Des packs de crédits ponctuels, en paiement unique et sans
          engagement, sont aussi disponibles pour recharger le solde entre
          deux renouvellements ou sans souscrire d&apos;abonnement :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>200 crédits — 2 €</li>
          <li>1000 crédits — 10 €</li>
          <li>3000 crédits — 30 €</li>
        </ul>
        <p>
          Les prix sont indiqués en euros, toutes taxes comprises. Chaque
          génération par intelligence artificielle consomme un nombre fixe de
          crédits, précisé sur la page{" "}
          <a href="/pricing" className="text-yellow-400 hover:underline">tarifs</a>.
          Les crédits, qu&apos;ils viennent d&apos;un abonnement ou d&apos;un
          pack, restent acquis au compte sans date d&apos;expiration — y
          compris après résiliation d&apos;un abonnement — et ne sont ni
          transférables à un autre compte, ni convertibles en argent.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">4. Paiement</h2>
        <p>
          Le paiement s&apos;effectue en ligne par carte bancaire (ou autre
          moyen proposé), via notre prestataire de paiement sécurisé Stripe.
          MIN IA ne stocke à aucun moment les coordonnées bancaires du client
          — celles-ci sont traitées exclusivement par Stripe.
        </p>
        <p>
          Un abonnement est prélevé mensuellement, à date anniversaire de la
          souscription, jusqu&apos;à résiliation. Un pack de crédits est
          réglé en une fois, sans prélèvement récurrent.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">5. Résiliation et remboursement</h2>
        <p>
          Le client peut résilier son abonnement à tout moment, sans frais ni
          justification, depuis son espace client Stripe (accessible sur la
          page Mon compte) ou en contactant{" "}
          <a href="mailto:contact@min-ia.fr" className="text-yellow-400 hover:underline">
            contact@min-ia.fr
          </a>. La résiliation prend effet à la fin de la période déjà payée ;
          aucun remboursement au prorata n&apos;est effectué pour la période en
          cours, sauf disposition légale contraire. Les crédits déjà crédités
          au compte restent utilisables après résiliation, sans date
          d&apos;expiration.
        </p>
        <p>
          Un pack de crédits acheté n&apos;est pas remboursable dès lors
          qu&apos;au moins une génération a consommé des crédits de ce pack,
          conformément à la renonciation au droit de rétractation décrite à
          l&apos;article 6.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">6. Droit de rétractation</h2>
        <p>
          Conformément à l&apos;article L221-28 du Code de la consommation, le
          droit de rétractation ne s&apos;applique pas aux contenus numériques
          fournis sur un support immatériel dont l&apos;exécution a commencé
          avec l&apos;accord du consommateur, qui a expressément renoncé à son
          droit de rétractation. En souscrivant à un abonnement ou en achetant
          un pack de crédits, puis en l&apos;utilisant pour une génération, le
          client reconnaît et accepte cette renonciation.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">7. Responsabilité</h2>
        <p>
          MIN IA met en œuvre les moyens raisonnables pour assurer la
          disponibilité et la qualité du service, sans garantie de résultat
          sur le rendu final d&apos;une génération par intelligence
          artificielle, qui reste par nature variable. Le client est seul
          responsable de l&apos;usage qu&apos;il fait des miniatures générées
          et du contenu (photos, descriptions) qu&apos;il fournit, qui ne doit
          enfreindre aucun droit de tiers ni disposition légale.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">8. Droit applicable</h2>
        <p>
          Les présentes CGV sont soumises au droit français. Tout litige
          relève, à défaut de résolution amiable, des tribunaux français
          compétents.
        </p>
      </section>
    </div>
  );
}
