import type { ReactNode } from 'react';

interface PublicLayoutProps {
  children: ReactNode;
  logoUrl?: string;
  propertyName?: string;
}

export function PublicLayout({ children, logoUrl, propertyName }: PublicLayoutProps) {
  return (
    <div className="min-h-screen bg-secondary">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-center gap-3">
          {logoUrl && (
            <img src={logoUrl} alt={propertyName || 'Spa'} className="h-12 w-auto" />
          )}
          {propertyName && (
            <h1 className="text-xl font-display font-semibold text-gray-900">{propertyName}</h1>
          )}
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="text-center text-xs text-tertiary py-6">
        Powered by Margo Hospitality
      </footer>
    </div>
  );
}
