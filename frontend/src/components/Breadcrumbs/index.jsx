import { Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  ChevronRightIcon,
  BarChartIcon,
  KeyIcon,
  RocketIcon,
  DocumentIcon,
  EditIcon,
  AddCircleIcon,
} from '@/assets/icons';
import './Breadcrumbs.css';

/** Icon id per route path for contextual breadcrumb icons */
const PATH_ICONS = {
  '/': 'home',
  '/metric-configs': 'barChart',
  '/metric-configs/new': 'plus',
  '/api-keys': 'key',
  '/code-generation': 'rocket',
};

function getIconForPath(pathname, label) {
  if (PATH_ICONS[pathname]) return PATH_ICONS[pathname];
  if (pathname.match(/^\/metric-configs\/[^/]+\/edit$/)) return 'edit';
  return 'document';
}

const ICON_SIZE = 16;

function CrumbIcon({ iconId, isCurrent }) {
  const iconClass = isCurrent ? 'breadcrumbs-icon-current' : 'breadcrumbs-icon';
  const props = { size: ICON_SIZE, className: iconClass };
  switch (iconId) {
    case 'home':
      return <HomeIcon {...props} />;
    case 'barChart':
      return <BarChartIcon {...props} />;
    case 'key':
      return <KeyIcon {...props} />;
    case 'rocket':
      return <RocketIcon {...props} />;
    case 'plus':
      return <AddCircleIcon {...props} />;
    case 'edit':
      return <EditIcon {...props} />;
    default:
      return <DocumentIcon {...props} />;
  }
}

/**
 * Build breadcrumb items from current pathname.
 * Returns array of { path, label, isLast, iconId }.
 */
function buildCrumbs(pathname) {
  const items = [];

  items.push({
    path: '/',
    label: 'Dashboard',
    isLast: pathname === '/',
    iconId: 'home',
  });

  if (pathname === '/') return items;

  if (pathname.startsWith('/metric-configs')) {
    items.push({
      path: '/metric-configs',
      label: 'Metric Configs',
      isLast: pathname === '/metric-configs',
      iconId: 'barChart',
    });
    if (pathname === '/metric-configs/new') {
      items.push({
        path: '/metric-configs/new',
        label: 'New Configuration',
        isLast: true,
        iconId: 'plus',
      });
    } else if (pathname.match(/^\/metric-configs\/[^/]+\/edit$/)) {
      items[items.length - 1].isLast = false;
      items.push({
        path: pathname,
        label: 'Edit Configuration',
        isLast: true,
        iconId: 'edit',
      });
    }
    return items;
  }

  if (pathname === '/api-keys') {
    items.push({ path: '/api-keys', label: 'API Keys', isLast: true, iconId: 'key' });
    return items;
  }

  if (pathname === '/code-generation') {
    items.push({
      path: '/code-generation',
      label: 'Code Gen',
      isLast: true,
      iconId: 'rocket',
    });
    return items;
  }

  const label =
    {
      '/': 'Dashboard',
      '/metric-configs': 'Metric Configs',
      '/api-keys': 'API Keys',
      '/code-generation': 'Code Gen',
    }[pathname] ||
    (pathname.match(/^\/metric-configs\/[^/]+\/edit$/) ? 'Edit Configuration' : null);
  if (label) {
    items.push({ path: pathname, label, isLast: true, iconId: getIconForPath(pathname, label) });
  }
  return items;
}

function Breadcrumbs() {
  const location = useLocation();
  const pathname = location.pathname;
  const crumbs = buildCrumbs(pathname);

  if (crumbs.length === 0) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol className="breadcrumbs-list">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.path}-${index}`} className="breadcrumbs-item">
            {index > 0 && (
              <span className="breadcrumbs-separator" aria-hidden="true">
                <ChevronRightIcon size={14} />
              </span>
            )}
            {crumb.isLast ? (
              <span className="breadcrumbs-current" aria-current="page">
                <span className="breadcrumbs-icon-wrap">
                  <CrumbIcon iconId={crumb.iconId} isCurrent />
                </span>
                <span className="breadcrumbs-label">{crumb.label}</span>
              </span>
            ) : (
              <Link to={crumb.path} className="breadcrumbs-link">
                <span className="breadcrumbs-icon-wrap">
                  <CrumbIcon iconId={crumb.iconId} isCurrent={false} />
                </span>
                <span className="breadcrumbs-label">{crumb.label}</span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default Breadcrumbs;
