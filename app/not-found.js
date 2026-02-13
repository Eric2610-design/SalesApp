export default function NotFound() {
  return (
    <div className="container">
      <div className="card">
        <h1 className="h1">404</h1>
        <p className="sub">Seite nicht gefunden.</p>
        <a className="secondary" href="/" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>
          Zur Startseite
        </a>
      </div>
    </div>
  );
}
