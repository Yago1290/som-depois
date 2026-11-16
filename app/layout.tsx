import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'Som depois — jogo de música', description: 'Ouça um trecho de música e tente descobrir a faixa.', openGraph: { title: 'Som depois', description: 'Ouça um trecho. Descubra a música.' } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
