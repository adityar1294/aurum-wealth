'use client';
import { useEffect, useState, useRef } from 'react';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Trash2, Download, Upload, FileText, File } from 'lucide-react';
import { Document, DocumentCategory } from '@/lib/types';

const CATEGORIES: DocumentCategory[] = ['KYC', 'Agreement', 'Report', 'Tax', 'Other'];

interface Props { clientId: string }

interface DocWithUrl extends Document {
  downloadUrl?: string;
}

export default function DocumentsTab({ clientId }: Props) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [category, setCategory] = useState<DocumentCategory>('KYC');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, [clientId]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'documents'), where('clientId', '==', clientId)));
      setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data(), uploadedAt: d.data().uploadedAt?.toDate?.() || new Date() } as DocWithUrl)));
    } finally { setLoading(false); }
  };

  const handleFile = async (file: File) => {
    if (!user) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const path = `clients/${clientId}/documents/${Date.now()}_${file.name}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, file);

      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          (snap) => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
          reject,
          resolve
        );
      });

      await addDoc(collection(db, 'documents'), {
        clientId,
        rmId: user.uid,
        category,
        fileName: file.name,
        storagePath: path,
        fileSize: file.size,
        mimeType: file.type,
        uploadedAt: serverTimestamp(),
      });

      load();
    } catch (err) {
      console.error(err);
      alert('Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (d: DocWithUrl) => {
    if (!confirm('Delete this document?')) return;
    try {
      await deleteObject(storageRef(storage, d.storagePath));
    } catch {}
    await deleteDoc(doc(db, 'documents', d.id));
    load();
  };

  const handleDownload = async (d: DocWithUrl) => {
    try {
      const url = await getDownloadURL(storageRef(storage, d.storagePath));
      window.open(url, '_blank');
    } catch { alert('Download failed'); }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const categoryBadge = (c: string) => ({ KYC: 'badge-blue', Agreement: 'badge-green', Report: 'badge-purple', Tax: 'badge-yellow', Other: 'badge-gray' }[c] || 'badge-gray');

  if (loading) return <div className="loading-center"><div className="spinner spinner-lg" /></div>;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Documents</h2>
        <div className="flex gap-8">
          <select className="select" style={{ width: 140 }} value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload size={14} /> Upload
          </button>
        </div>
      </div>

      <div
        className={`drop-zone${isDragging ? ' active' : ''}`}
        style={{ marginBottom: 20 }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      >
        <Upload size={24} style={{ opacity: 0.5 }} />
        <div style={{ marginTop: 8, fontSize: 14 }}>Drag & drop or click to upload</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>PDF, JPG, PNG, DOCX, XLSX — max 10MB</div>
      </div>

      {uploading && (
        <div style={{ marginBottom: 16 }}>
          <div className="flex-between" style={{ marginBottom: 6, fontSize: 13 }}>
            <span>Uploading…</span>
            <span>{uploadProgress.toFixed(0)}%</span>
          </div>
          <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} /></div>
        </div>
      )}

      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

      {docs.length === 0 ? (
        <div className="empty-state"><FileText size={40} /><h3>No documents yet</h3><p>Upload KYC documents, agreements, reports, and more</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>File Name</th><th>Category</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="flex-center gap-8">
                      <File size={16} color="var(--text-muted)" />
                      <span style={{ fontWeight: 500 }}>{d.fileName}</span>
                    </div>
                  </td>
                  <td><span className={`badge ${categoryBadge(d.category)}`}>{d.category}</span></td>
                  <td className="text-secondary">{formatSize(d.fileSize)}</td>
                  <td className="text-secondary">{(d.uploadedAt instanceof Date ? d.uploadedAt : new Date(d.uploadedAt as unknown as string)).toLocaleDateString('en-IN')}</td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn-icon" onClick={() => handleDownload(d)}><Download size={13} /></button>
                      <button className="btn-icon" onClick={() => handleDelete(d)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
