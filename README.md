# Ankiety Live - Kubernetes / Minikube

Repozytorium zawiera aplikację **Ankiety Live** oraz konfigurację jej wdrożenia w klastrze Kubernetes uruchamianym przez Minikube.

## Opis aplikacji

Ankiety Live to aplikacja webowa do tworzenia ankiet, oddawania głosów i obserwowania wyników w czasie rzeczywistym.

Główne komponenty:

- `frontend` - statyczny frontend serwowany przez NGINX oraz reverse proxy do API,
- `survey-api` - zarządzanie użytkownikami, logowaniem i ankietami,
- `voting-service` - przyjmowanie głosów i zapis do Redis,
- `vote-worker` - przetwarzanie głosów z Redis do PostgreSQL,
- `websocket-server` - aktualizacje wyników w czasie rzeczywistym,
- `postgres` - trwała baza danych,
- `redis` - bufor głosów, cache i pub/sub.

## Zawartość repozytorium

- `services/` - kod i Dockerfile mikrousług,
- `database/init.sql` - inicjalizacja schematu PostgreSQL,
- `k8s/` - manifesty Kubernetes,
- `docker-compose.yml` - lokalne uruchomienie poza Kubernetes,
- `Sprawozdanie_zadania1-2/sprawozdanie.md` - opis rozwiązania dla punktów 1a, 1b i 2 zadania,
- `prezentacja_wdrozenia_ankiety_live.pptx` - prezentacja wdrożenia.

## Uruchomienie w Minikube

Utworzenie klastra:

```bash
minikube start --driver=docker --cpus=4 --memory=6144 --disk-size=30g --cni=calico --addons=ingress,metrics-server
```

Budowanie obrazów:

```bash
docker build -t ankiety-live/survey-api:1.0.0 services/survey-api
docker build -t ankiety-live/voting-service:1.0.0 services/voting-service
docker build -t ankiety-live/vote-worker:1.0.0 services/vote-worker
docker build -t ankiety-live/websocket-server:1.0.0 services/websocket-server
docker build -t ankiety-live/frontend:1.0.0 services/frontend
```

Załadowanie obrazów do Minikube:

```bash
minikube image load ankiety-live/survey-api:1.0.0
minikube image load ankiety-live/voting-service:1.0.0
minikube image load ankiety-live/vote-worker:1.0.0
minikube image load ankiety-live/websocket-server:1.0.0
minikube image load ankiety-live/frontend:1.0.0
```

Wdrożenie aplikacji:

```bash
kubectl apply -f k8s/
```

Dodanie lokalnego hosta:

```bash
echo "$(minikube ip) ankiety-live.local" | sudo tee -a /etc/hosts
```

Test:

```bash
curl http://ankiety-live.local/health
curl -k https://ankiety-live.local/health
```

Aplikacja jest dostępna pod adresami:

- `http://ankiety-live.local`
- `https://ankiety-live.local`

Certyfikat HTTPS jest self-signed, więc przeglądarka może pokazać ostrzeżenie.

## Weryfikacja

```bash
kubectl get pods -n ankiety-live
kubectl get svc -n ankiety-live
kubectl get ingress -n ankiety-live
kubectl get pvc -n ankiety-live
kubectl get networkpolicy -n ankiety-live
```

Konto testowe:

```text
email: admin@ankiety.pl
hasło: admin123
```
