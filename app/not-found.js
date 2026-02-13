export default function NotFound() {
  return (
    <div className="card">
      <h1 className="h1">404</h1>
      <p className="sub">Seite nicht gefunden.</p>
      <a className="secondary" href="/" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)', display: 'inline-block' }}>
        Zum Homescreen
      </a>
    </div>
  );
}
