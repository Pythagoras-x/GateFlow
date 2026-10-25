import './globals.css';

export const metadata = {
  title: 'GateFlow Public Proof Verifier',
  description: 'Independently verify cryptographic attendance proofs on the Stellar network',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 min-h-screen text-slate-900">{children}</body>
    </html>
  );
}
