# Kubernetes Orchestration

## Core Concepts
- **Cluster**: set of worker machines (nodes) running containerized apps
- **Pod**: smallest deployable unit — one or more containers sharing network/storage
- **Deployment**: declarative updates for Pods (replicas, rolling updates)
- **Service**: stable network endpoint to access a set of Pods
- **Ingress**: external HTTP/HTTPS routing to Services
- **ConfigMap/Secret**: configuration injected into Pods

## Pods & Deployments
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  labels:
    app: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: registry.example.com/api:1.2.3
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        resources:
          requests: { cpu: "250m", memory: "256Mi" }
          limits:   { cpu: "500m", memory: "512Mi" }
        livenessProbe:
          httpGet: { path: /health, port: 3000 }
          initialDelaySeconds: 10
          periodSeconds: 15
        readinessProbe:
          httpGet: { path: /ready, port: 3000 }
          initialDelaySeconds: 5
```
- Always set resource requests and limits — prevents noisy neighbors
- Liveness probe: restart container if unresponsive
- Readiness probe: stop sending traffic if not ready
- Use `rollingUpdate` strategy for zero-downtime deployments

## Services
```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-service
spec:
  selector:
    app: api
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP  # Internal only (default)
---
apiVersion: v1
kind: Service
metadata:
  name: api-external
spec:
  selector:
    app: api
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer  # External IP from cloud provider
```

## Ingress
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts: [api.example.com]
    secretName: api-tls
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /v1
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 80
```

## ConfigMaps & Secrets
```yaml
apiVersion: v1
kind: ConfigMap
metadata: { name: app-config }
data:
  LOG_LEVEL: "info"
  MAX_CONNECTIONS: "100"
---
apiVersion: v1
kind: Secret
metadata: { name: db-secret }
type: Opaque
data:
  password: c3VwZXJzZWNyZXQ=  # base64 encoded (NOT encrypted!)
```
- Secrets are base64-encoded, not encrypted — use SealedSecrets or External Secrets Operator
- Mount ConfigMaps as env vars or volumes
- ConfigMaps for non-sensitive config, Secrets for credentials

## Helm (Package Manager)
```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install my-release bitnami/nginx
helm upgrade my-release bitnami/nginx --set replicaCount=5
helm rollback my-release 2
```
- Charts: packaged Kubernetes applications
- `values.yaml`: override defaults per environment
- Templates: Go template syntax in Chart files

## kubectl Essentials
```bash
kubectl get pods -n prod -w          # Watch pod status
kubectl logs deployment/api -f       # Tail logs
kubectl exec -it pod-name -- /bin/sh # Shell into container
kubectl port-forward svc/api 8080:80 # Local access
kubectl describe pod pod-name        # Detailed status + events
kubectl top pods                     # Resource usage
```

## RBAC
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { namespace: dev, name: pod-reader }
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "watch", "list"]
```

## Monitoring
- Metrics Server: resource usage (`kubectl top`)
- Prometheus: metrics collection + alerting
- Grafana: dashboards
- Kubernetes Dashboard: web UI

## Common Mistakes
- ❌ No resource limits (unbounded CPU/memory consumption)
- ❌ Running as root in containers (use `securityContext.runAsNonRoot: true`)
- ❌ Hardcoding environment-specific values in manifests
- ❌ No liveness/readiness probes (traffic to dead pods)
- ❌ Using `latest` tag for images (unreproducible deployments)
