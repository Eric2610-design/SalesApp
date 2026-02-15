import './globals.css';
import 'leaflet/dist/leaflet.css';
import Shell from './ui/Shell';

export const metadata = {
  title: 'SalesApp',
  description: 'SalesOS Frame'
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
