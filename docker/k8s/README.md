# Vizme on Kubernetes (Minikube)

## Prereqs
- minikube addons enable ingress
- If you're using the **Docker driver on Linux**, `minikube ip` is often **not reachable** from your host.
  Use the ingress controller forwarded URL(s) instead (this runs a local proxy on `127.0.0.1` and must stay open):

  minikube service -n ingress-nginx ingress-nginx-controller --url

  Keep that terminal open while you browse.

- Add to `/etc/hosts`:
  127.0.0.1 vizme.local

## Build images into Minikube
eval "$(minikube docker-env)"
docker build -t vizme-backend:local ./backend
docker build -t vizme-frontend:local -f frontend/Dockerfile frontend

## Apply
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-secrets.yaml
kubectl apply -f k8s/02-postgres.yaml
kubectl apply -f k8s/03-minio.yaml
kubectl apply -f k8s/04-minio-init-job.yaml
kubectl apply -f k8s/05-mimir.yaml
kubectl apply -f k8s/06-alertmanager.yaml
kubectl apply -f k8s/07-prometheus.yaml
kubectl apply -f k8s/08-grafana.yaml
kubectl apply -f k8s/09-backend.yaml
kubectl apply -f k8s/10-frontend.yaml
kubectl apply -f k8s/11-ingress.yaml

## Open in browser

Because this Ingress is **host-based** (`vizme.local`), you must browse using the `vizme.local` hostname (not `127.0.0.1`) so the Ingress rule matches.

- Run (and keep running):

  minikube service -n ingress-nginx ingress-nginx-controller --url

- Take one printed URL like `http://127.0.0.1:43021`
- Open:

  `http://vizme.local:43021`

If you open `http://127.0.0.1:43021` directly, the request `Host` header won’t be `vizme.local`, and you’ll typically hit the default backend / wrong route.