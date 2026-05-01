'use client';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import OverviewTab from '@/components/client/OverviewTab';
import PortfolioTab from '@/components/client/PortfolioTab';
import InteractionsTab from '@/components/client/InteractionsTab';
import TasksTab from '@/components/client/TasksTab';
import DocumentsTab from '@/components/client/DocumentsTab';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Client } from '@/lib/types';
import { decrypt } from '@/lib/encryption';
import { use } from 'react';

const TABS = ['Overview', 'Portfolio', 'Interactions', 'Tasks', 'Documents'];

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Overview');

  useEffect(() => {
    if (id) loadClient();
  }, [id]);

  const loadClient = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'clients', id));
      if (snap.exists()) {
        const data = snap.data();
        setClient({
          id: snap.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(),
        } as Client);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="loading-center" style={{ height: '60vh' }}>
          <div className="spinner spinner-lg" />
        </div>
      </AppShell>
    );
  }

  if (!client) {
    return (
      <AppShell>
        <div className="page">
          <div className="empty-state">
            <h3>Client not found</h3>
            <Link href="/clients" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Back to Clients</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const pi = client.personalInfo;
  const name = `${pi.firstName} ${pi.lastName}`.trim();

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div className="flex-center gap-12">
            <Link href="/clients" className="btn btn-icon">
              <ChevronLeft size={16} />
            </Link>
            <div className="client-avatar" style={{ width: 44, height: 44, fontSize: 18 }}>
              {name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="page-title">{name}</h1>
              <p className="page-subtitle">{pi.email} · {client.riskProfile.replace('_', ' ')} · {client.taxSlab}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-8">
            {client.tags.map((t) => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
        </div>

        <div className="tabs">
          {TABS.map((tab) => (
            <button key={tab} className={`tab${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview' && <OverviewTab client={client} onRefresh={loadClient} />}
        {activeTab === 'Portfolio' && <PortfolioTab clientId={id} />}
        {activeTab === 'Interactions' && <InteractionsTab clientId={id} />}
        {activeTab === 'Tasks' && <TasksTab clientId={id} />}
        {activeTab === 'Documents' && <DocumentsTab clientId={id} />}
      </div>
    </AppShell>
  );
}
