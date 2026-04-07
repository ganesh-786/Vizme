import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dashboardWidgetsAPI } from '@/api/dashboardWidgets';
import { sitesAPI } from '@/api/sites';
import { useToast } from '@/components/ToastContainer';
import { useConfirm } from '@/components/ConfirmModal';
import DashboardWidgetsSkeleton from './DashboardWidgetsSkeleton';
import './DashboardWidgets.css';

function DashboardWidgetsList() {
  const [widgets, setWidgets] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const load = async () => {
    try {
      let sid;
      if (siteFilter === 'account') sid = null;
      else if (siteFilter) sid = Number(siteFilter);
      else sid = undefined;
      const rows = await dashboardWidgetsAPI.getAll(sid);
      setWidgets(rows);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load widgets', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [siteFilter]);

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete widget',
      message: 'Remove this KPI from the config-driven dashboard?',
      variant: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      await dashboardWidgetsAPI.delete(id);
      showToast('Widget deleted', 'success');
      await load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  if (loading) return <DashboardWidgetsSkeleton />;

  return (
    <div className="dw-page">
      <div className="dw-page__head">
        <div>
          <h1 className="dw-page__title">Dashboard widgets</h1>
          <p className="dw-page__intro">
            Define KPIs for the Live Metrics dashboard. When at least one widget exists for the selected
            scope, the app uses this layout instead of the default e-commerce cards.
          </p>
        </div>
        <Link to="/dashboard-widgets/new" className="dw-page__new">
          New widget
        </Link>
      </div>

      <div className="dw-page__filters">
        <label className="dw-page__filter">
          Scope
          <SiteFilterSelect value={siteFilter} onChange={setSiteFilter} />
        </label>
      </div>

      <table className="dw-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Metric</th>
            <th>Query</th>
            <th>Site</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {widgets.length === 0 && (
            <tr>
              <td colSpan={5} className="dw-table__empty">
                No widgets for this scope.{' '}
                <Link to="/dashboard-widgets/new">Create one</Link> or switch scope.
              </td>
            </tr>
          )}
          {widgets.map((w) => (
            <tr key={w.id}>
              <td>{w.title}</td>
              <td>
                <code>{w.metric_name}</code>
              </td>
              <td>{w.query_kind}</td>
              <td>{w.site_id ?? '—'}</td>
              <td className="dw-table__actions">
                <Link to={`/dashboard-widgets/${w.id}/edit`}>Edit</Link>
                <button type="button" onClick={() => handleDelete(w.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SiteFilterSelect({ value, onChange }) {
  const [sites, setSites] = useState([]);
  useEffect(() => {
    sitesAPI.getAll().then(setSites).catch(() => setSites([]));
  }, []);
  return (
    <select
      className="dw-page__select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Widget list scope"
    >
      <option value="">All widgets</option>
      <option value="account">Account-wide only</option>
      {sites.map((s) => (
        <option key={s.id} value={String(s.id)}>
          Site {s.id}: {s.name}
        </option>
      ))}
    </select>
  );
}

export default DashboardWidgetsList;
