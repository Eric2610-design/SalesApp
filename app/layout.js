import './globals.css';
import Dock from './ui/Dock';

export const metadata = {
  title: 'SalesApp',
  description: 'SalesApp',
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        <div className="ios-bg">
          <div className="ios-device">
            <div className="ios-statusbar">
              <div className="ios-pill" />
              <div className="ios-status-right">
                <span className="ios-dot" />
                <span className="ios-dot" />
                <span className="ios-dot" />
              </div>
            </div>

            <main className="ios-main">{children}</main>

            <Dock />
          </div>
        </div>
      </body>
    </html>
  );
}
