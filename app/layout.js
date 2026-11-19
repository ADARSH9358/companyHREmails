import { Instrument_Sans } from 'next/font/google';
import './globals.css';

const font = Instrument_Sans({ subsets: ['latin'], display: 'swap' });

export const metadata = { title: 'Contact Hub', description: 'Save company contacts and reach them by email or WhatsApp.' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={font.className}>{children}</body>
    </html>
  );
}
