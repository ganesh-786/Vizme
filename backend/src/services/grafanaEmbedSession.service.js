import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const GRAFANA_EMBED_COOKIE = 'vizme_grafana_embed';

function parseExpiryToMs(str) {
  const match = String(str || '15m').match(/^(\d+)(m|h|d)$/);
  if (!match) return 15 * 60 * 1000;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'm') return num * 60 * 1000;
  if (unit === 'h') return num * 60 * 60 * 1000;
  if (unit === 'd') return num * 24 * 60 * 60 * 1000;
  return 15 * 60 * 1000;
}

function grafanaEmbedCookieOptions(maxAge) {
  const options = {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'strict' : 'lax',
    path: '/grafana',
  };

  if (maxAge !== undefined) {
    options.maxAge = maxAge;
  }

  return options;
}

function getTokenMaxAgeMs(token) {
  const fallbackMs = parseExpiryToMs(config.grafanaEmbedTokenExpiry);
  const decoded = jwt.decode(token);
  const expSeconds = Number(decoded?.exp);

  if (!Number.isFinite(expSeconds)) {
    return fallbackMs;
  }

  return Math.max(expSeconds * 1000 - Date.now(), 0);
}

export function setGrafanaEmbedCookie(res, token) {
  if (!token) return;
  res.cookie(GRAFANA_EMBED_COOKIE, token, grafanaEmbedCookieOptions(getTokenMaxAgeMs(token)));
}

export function clearGrafanaEmbedCookie(res) {
  res.clearCookie(GRAFANA_EMBED_COOKIE, grafanaEmbedCookieOptions(undefined));
}
