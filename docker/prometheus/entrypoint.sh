#!/bin/sh
set -e
# When METRICS_SCRAPE_USER and METRICS_SCRAPE_PASSWORD are set, use basic auth for backend scrape
if [ -n "$METRICS_SCRAPE_USER" ] && [ -n "$METRICS_SCRAPE_PASSWORD" ]; then
  envsubst '${METRICS_SCRAPE_USER} ${METRICS_SCRAPE_PASSWORD}' < /etc/prometheus/prometheus-auth.yml.template > /tmp/prometheus-auth.yml
  exec /bin/prometheus --config.file=/tmp/prometheus-auth.yml --storage.tsdb.path=/prometheus --web.enable-lifecycle --storage.tsdb.retention.time=30d
fi
exec /bin/prometheus "$@"
