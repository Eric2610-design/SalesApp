export default function SettingsPage() {
  return (
    <div className="grid">
      <div className="card">
        <h1 className="h1">Settings</h1>
        <p className="sub">Hier liegen Uploads, Admin-Funktionen und Widget-Konfiguration.</p>

        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          <a className="app-icon" href="/settings/uploads">
            <div className="emoji">⬆️</div>
            <div className="label">Uploads (Listen)</div>
          </a>

          <a className="app-icon" href="/settings/widgets">
            <div className="emoji">🧩</div>
            <div className="label">Widgets konfigurieren</div>
          </a>

          <a className="app-icon" href="/admin">
            <div className="emoji">🧨</div>
            <div className="label">Admin (DB leeren)</div>
          </a>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Info</h2>
        <p className="sub">
          Zielbild: Jede Funktion ist eine „App“ (z.B. Lager, Rückstand, Händler). Alles was Upload/Setup ist, bleibt in Settings.
        </p>
      </div>
    </div>
  );
}
