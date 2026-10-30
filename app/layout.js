import './globals.css';

export const metadata = {
  title: 'SafeScreen',
  description: 'Read-only screen mirroring, document reader and voice.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
