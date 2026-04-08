import { useState, useEffect } from 'react';
import { sitesAPI } from '@/api/sites';
import { useToast } from '@/components/ToastContainer';
import { useConfirm } from '@/components/ConfirmModal';
import SitesSkeleton from './SitesSkeleton';
import './Sites.css';

function Sites() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const load = async () => {
    try {
      const rows = await sitesAPI.getAll();
      setSites(rows);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load sites', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await sitesAPI.create(trimmed);
      setName('');
      showToast('Property created', 'success');
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Create failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete property',
      message:
        'Metrics tagged with this property’s API key will stop matching this filter. Continue?',
      variant: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      await sitesAPI.delete(id);
      showToast('Property deleted', 'success');
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  if (loading) {
    return <SitesSkeleton />;
  }

  return (
    <div className="sites-page">
      <h1 className="sites-page__title">Properties</h1>
      <p className="sites-page__intro">
        Create a property per tracked website. Use a dedicated API key with that property so metrics
        include a <code>site_id</code> label; filter the main dashboard by property.
      </p>

      <form className="sites-page__form" onSubmit={handleCreate}>
        <input
          type="text"
          className="sites-page__input"
          placeholder="Property name (e.g. Production store)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={255}
        />
        <button type="submit" className="sites-page__btn" disabled={saving || !name.trim()}>
          Add property
        </button>
      </form>

      <ul className="sites-page__list">
        {sites.length === 0 && <li className="sites-page__empty">No properties yet.</li>}
        {sites.map((s) => (
          <li key={s.id} className="sites-page__row">
            <span className="sites-page__name">{s.name}</span>
            <span className="sites-page__id">id {s.id}</span>
            <button
              type="button"
              className="sites-page__delete"
              onClick={() => handleDelete(s.id)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Sites;
