import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { dashboardWidgetsAPI } from '@/api/dashboardWidgets';
import { sitesAPI } from '@/api/sites';
import { useToast } from '@/components/ToastContainer';
import './DashboardWidgets.css';

const QUERY_KINDS = [
  { value: 'increase_24h', label: 'Counter increase (24h)' },
  { value: 'max_latest', label: 'Gauge — max current value' },
  { value: 'custom', label: 'Custom PromQL' },
];

const FORMATS = [
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Integer' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
];

function DashboardWidgetForm({ isEdit = false }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const { showToast } = useToast();
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    metric_name: '',
    query_kind: 'increase_24h',
    promql_custom: '',
    title: '',
    subtitle: '',
    section: 'primary',
    sort_order: 0,
    format: 'number',
    currency_code: 'USD',
    include_in_multi_chart: false,
    featured_chart: false,
    site_id: '',
  });

  useEffect(() => {
    sitesAPI
      .getAll()
      .then(setSites)
      .catch(() => setSites([]));
  }, []);

  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const w = await dashboardWidgetsAPI.getById(id);
        if (cancelled || !w) {
          showToast('Widget not found', 'error');
          navigate('/dashboard-widgets');
          return;
        }
        setForm({
          metric_name: w.metric_name || '',
          query_kind: w.query_kind || 'increase_24h',
          promql_custom: w.promql_custom || '',
          title: w.title || '',
          subtitle: w.subtitle || '',
          section: w.section || 'primary',
          sort_order: w.sort_order ?? 0,
          format: w.format || 'number',
          currency_code: w.currency_code || 'USD',
          include_in_multi_chart: !!w.include_in_multi_chart,
          featured_chart: !!w.featured_chart,
          site_id: w.site_id == null ? '' : String(w.site_id),
        });
      } catch (err) {
        showToast(err.response?.data?.error || 'Failed to load', 'error');
        navigate('/dashboard-widgets');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, id, navigate, showToast]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        metric_name: form.metric_name.trim(),
        query_kind: form.query_kind,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        section: form.section.trim() || 'primary',
        sort_order: Number(form.sort_order) || 0,
        format: form.format,
        currency_code: form.currency_code.trim() || 'USD',
        include_in_multi_chart: form.include_in_multi_chart,
        featured_chart: form.featured_chart,
      };
      if (form.query_kind === 'custom') {
        payload.promql_custom = form.promql_custom.trim();
      }
      if (form.site_id) payload.site_id = Number(form.site_id);
      else payload.site_id = null;

      if (isEdit) {
        await dashboardWidgetsAPI.update(id, payload);
        showToast('Widget updated', 'success');
      } else {
        await dashboardWidgetsAPI.create(payload);
        showToast('Widget created', 'success');
      }
      navigate('/dashboard-widgets');
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="dw-page dw-page--loading">Loading…</div>;

  return (
    <div className="dw-page">
      <h1 className="dw-page__title">{isEdit ? 'Edit widget' : 'New widget'}</h1>
      <form className="dw-form" onSubmit={handleSubmit}>
        <label className="dw-field">
          Title
          <input
            required
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            className="dw-input"
          />
        </label>
        <label className="dw-field">
          Subtitle (optional)
          <input
            value={form.subtitle}
            onChange={(e) => update('subtitle', e.target.value)}
            className="dw-input"
          />
        </label>
        <label className="dw-field">
          Metric name (without user_metric_ prefix)
          <input
            required
            pattern="[a-zA-Z_][a-zA-Z0-9_]*"
            title="Letters, numbers, underscore; must start with letter or underscore"
            value={form.metric_name}
            onChange={(e) => update('metric_name', e.target.value)}
            className="dw-input"
            disabled={isEdit}
          />
        </label>
        <label className="dw-field">
          Query kind
          <select
            value={form.query_kind}
            onChange={(e) => update('query_kind', e.target.value)}
            className="dw-input"
          >
            {QUERY_KINDS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {form.query_kind === 'custom' && (
          <label className="dw-field">
            PromQL (use <code>{'{user_filter}'}</code> placeholder for labels)
            <textarea
              required
              rows={4}
              value={form.promql_custom}
              onChange={(e) => update('promql_custom', e.target.value)}
              className="dw-textarea"
              placeholder="e.g. sum(increase(user_metric_orders{user_filter}[24h])) or vector(0)"
            />
          </label>
        )}
        <label className="dw-field">
          Section
          <input
            value={form.section}
            onChange={(e) => update('section', e.target.value)}
            className="dw-input"
            placeholder="primary"
          />
        </label>
        <label className="dw-field">
          Sort order
          <input
            type="number"
            value={form.sort_order}
            onChange={(e) => update('sort_order', e.target.value)}
            className="dw-input"
          />
        </label>
        <label className="dw-field">
          Format
          <select
            value={form.format}
            onChange={(e) => update('format', e.target.value)}
            className="dw-input"
          >
            {FORMATS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="dw-field">
          Currency code (for currency format)
          <input
            value={form.currency_code}
            onChange={(e) => update('currency_code', e.target.value)}
            className="dw-input"
          />
        </label>
        <label className="dw-field">
          Property scope (optional)
          <select
            value={form.site_id}
            onChange={(e) => update('site_id', e.target.value)}
            className="dw-input"
          >
            <option value="">Account-wide</option>
            {sites.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="dw-field dw-field--check">
          <input
            type="checkbox"
            checked={form.include_in_multi_chart}
            onChange={(e) => update('include_in_multi_chart', e.target.checked)}
          />
          Include in multi-metric chart
        </label>
        <label className="dw-field dw-field--check">
          <input
            type="checkbox"
            checked={form.featured_chart}
            onChange={(e) => update('featured_chart', e.target.checked)}
          />
          Featured time series (24h) for this metric
        </label>
        <div className="dw-form__actions">
          <button
            type="button"
            className="dw-btn dw-btn--ghost"
            onClick={() => navigate('/dashboard-widgets')}
          >
            Cancel
          </button>
          <button type="submit" className="dw-btn dw-btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default DashboardWidgetForm;
