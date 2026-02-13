import './globals.css';
import Shell from './ui/Shell';

export const metadata = {
  title: 'SalesApp',
  description: 'SalesApp',
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
