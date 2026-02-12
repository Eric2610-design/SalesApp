import './globals.css';

export const metadata = {
  title: 'SalesApp – Händler Import',
  description: 'Händlerlisten (DE/AT/CH) hochladen, parsen und in Supabase importieren.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
