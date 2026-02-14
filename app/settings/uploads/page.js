export default function UploadsPage() {
  return (
    <div className="card">
      <h1 className="h1">Uploads</h1>
      <p className="sub">Alle Listen/Imports zentral.</p>

      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        <a className="app-icon" href="/settings/uploads/dealers">
          <div className="emoji">🏪</div>
          <div className="label">Händler Upload</div>
        </a>

        <a className="app-icon" href="/backlog">
          <div className="emoji">📦</div>
          <div className="label">Auftragsrückstand Upload</div>
        </a>

        <a className="app-icon" href="/inventory">
          <div className="emoji">🏭</div>
          <div className="label">Lagerbestand Upload</div>
        </a>

        <a className="app-icon" href="/users">
          <div className="emoji">👥</div>
          <div className="label">Benutzer (Anlage/Upload)</div>
        </a>
      </div>
    </div>
  );
}
