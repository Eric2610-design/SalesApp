import './globals.css';

export const metadata = {
  title: 'SalesApp',
  description: 'Dealer Import & Database',
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        <div className="container">
          <header className="header">
            <div className="brand">SalesApp</div>
            <nav className="nav">
              <a href="/" className="secondary">Import</a>
              <a href="/database" className="secondary">Datenbank ansehen →</a>
              <a href="/users" className="secondary">Benutzer</a>
            </nav>
          </header>
          {children}
          <footer className="footer">
            <small>© {new Date().getFullYear()} SalesApp</small>
          </footer>
        </div>
      </body>
    </html>
  );
}
