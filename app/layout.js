import './globals.css';
import { Suspense } from 'react';
import Shell from './ui/Shell';

export const metadata = {
  title: 'SalesApp',
  description: 'SalesApp',
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        <Suspense fallback={<div />}>
          <Shell>{children}</Shell>
        </Suspense>
      </body>
    </html>
  );
}
