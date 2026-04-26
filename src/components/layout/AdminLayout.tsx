import Sidebar from './Sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56 min-h-screen">
        <div className="px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
