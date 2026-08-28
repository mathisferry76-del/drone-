export const metadata = {
  title: "Mentions légales — MIN IA",
};

export default function MentionsLegalesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16 text-sm leading-relaxed text-zinc-300">
      <h1 className="text-3xl font-extrabold text-white">Mentions légales</h1>
      <p className="mt-2 text-zinc-500">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">Éditeur du site</h2>
        <p>
          Le site MIN IA (accessible à l&apos;adresse min-ia.fr) est édité par :<br />
          Mathis Ferry<br />
          Rue du Général Koenig, 76360 Barentin, France<br />
          Email : <a href="mailto:contact@min-ia.fr" className="text-yellow-400 hover:underline">contact@min-ia.fr</a>
        </p>
        <p className="text-zinc-500">
          Activité exercée à titre individuel, en cours d&apos;immatriculation en
          auto-entrepreneur. Le numéro SIRET sera ajouté à cette page dès son
          obtention.
        </p>
        <p>Directeur de la publication : Mathis Ferry.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">Hébergement</h2>
        <p>
          Le site est hébergé par :<br />
          Vercel Inc.<br />
          340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis<br />
          <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-yellow-400 hover:underline">
            vercel.com
          </a>
        </p>
        <p>
          Les données des utilisateurs (comptes, historique, miniatures) sont
          hébergées par Supabase Inc. (base de données et stockage de fichiers).
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">Propriété intellectuelle</h2>
        <p>
          L&apos;ensemble des éléments du site (textes, mise en page, code,
          identité visuelle &quot;MIN IA&quot;) est protégé par le droit
          d&apos;auteur. Toute reproduction non autorisée est interdite.
        </p>
        <p>
          Les miniatures que tu génères à partir de tes propres photos
          t&apos;appartiennent : tu es libre de les utiliser, publier et
          modifier comme bon te semble.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">Données personnelles</h2>
        <p>
          Le traitement de tes données personnelles est détaillé dans notre{" "}
          <a href="/confidentialite" className="text-yellow-400 hover:underline">
            politique de confidentialité
          </a>.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">Contact</h2>
        <p>
          Pour toute question relative au site ou à ces mentions légales :{" "}
          <a href="mailto:contact@min-ia.fr" className="text-yellow-400 hover:underline">
            contact@min-ia.fr
          </a>
        </p>
      </section>
    </div>
  );
}
