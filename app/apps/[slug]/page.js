export default function AppSlugPage({ params }) {
  const slug = params?.slug;
  return (
    <div className="card">
      <div className="h1">App: {slug}</div>
      <div className="sub">Platzhalter. In Admin → Apps kannst du Apps als Links konfigurieren.</div>
    </div>
  );
}
