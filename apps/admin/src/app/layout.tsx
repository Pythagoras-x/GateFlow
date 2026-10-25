import './globals.css';
import { Sidebar } from '../components/Sidebar';
import { Navbar } from '../components/Navbar';

export const metadata = {
  title: 'GateFlow Admin Dashboard',
  description: 'Employee Attendance & Visitor Management on Stellar Soroban',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Navbar />
          <main className="flex-1 p-8 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
