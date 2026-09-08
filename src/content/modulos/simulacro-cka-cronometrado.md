---
code: M18
order: 18
slug: simulacro-cka-cronometrado
title: Simulacro CKA cronometrado
description: Examen simulado completo de 18 tareas y 120 minutos, con la misma distribución de peso por dominio que el examen real, para medir velocidad de ejecución.
access: free
updated: "2026-09-08"
prerequisites: [entorno-laboratorio-kubectl, arquitectura-kubernetes, kubeadm-etcd-backup-restore-upgrade, control-plane-alta-disponibilidad, rbac-seguridad-cluster, helm-kustomize-crds-operators, workloads-deployments-daemonsets-statefulsets, jobs-cronjobs-gestion-recursos, scheduling-avanzado-affinity-taints-priority, services-kube-proxy, ingress-gateway-api, networkpolicy-segmentacion, coredns-resolucion-nombres, storage-pv-pvc-storageclass, troubleshooting-cluster-control-plane, troubleshooting-nodos-networking, troubleshooting-aplicaciones-storage]
---

## 1. Resumen técnico

Este es el módulo final del curso. No introduce ningún concepto nuevo: es un examen simulado completo, 18 tareas, 120 minutos, con la misma distribución de peso por dominio que el examen real. El objetivo no es aprender algo nuevo aquí, sino medir si los 17 módulos anteriores se convirtieron en velocidad de ejecución real bajo presión de tiempo, exactamente la advertencia con la que empezó este curso en M01.

## 2. Cómo usar este simulacro

Configura un temporizador de 120 minutos antes de leer la primera tarea. No consultes las soluciones de la sección 5 hasta haber completado, o abandonado, cada tarea; hacerlo invalida la medición real de tu velocidad. Trabaja las 18 tareas en el orden que prefieras, exactamente como en el examen real, donde puedes saltar y volver. Al final, usa la sección 6 para calcular tu puntuación real y la sección 7 para decidir qué módulos repasar según tus fallos concretos.

Todas las tareas asumen tu cluster kubeadm de 3 nodos en el estado actual, tras haber practicado los 17 módulos anteriores. Si algún recurso de un módulo previo ya no existe por haberlo limpiado, créalo como parte de la tarea correspondiente; el examen real siempre parte de un cluster limpio para cada pregunta.

## 3. Distribución de puntos por dominio

```text reference
Cluster Architecture, Installation & Configuration .... 25 puntos (4 tareas)
Workloads & Scheduling ................................ 15 puntos (3 tareas)
Services & Networking .................................. 20 puntos (4 tareas)
Storage ................................................ 10 puntos (2 tareas)
Troubleshooting ........................................ 30 puntos (5 tareas)
                                                          -----------------
TOTAL ................................................. 100 puntos (18 tareas)

Aprobado: 66 puntos o mas.
Tiempo objetivo: 120 minutos, aproximadamente 6-7 minutos por tarea.
```

## 4. Las 18 tareas del simulacro

**Tarea 1** (6 puntos, dominio Cluster Architecture)

En el namespace `simulacro`, crea un ServiceAccount llamado `ci-runner`. Crea un Role llamado `ci-role` que permita `get`, `list` y `create` sobre pods y sobre `pods/log`. Asocia el Role al ServiceAccount mediante un RoleBinding. Verifica con `kubectl auth can-i` que el ServiceAccount puede crear pods en ese namespace pero no puede eliminarlos.

**Tarea 2** (7 puntos, dominio Cluster Architecture)

Realiza un backup de etcd y guárdalo en `/opt/simulacro/etcd-backup.db`. Verifica que el snapshot es válido usando el comando de status correspondiente, y guarda esa salida en `/opt/simulacro/etcd-status.txt`.

**Tarea 3** (6 puntos, dominio Cluster Architecture)

Instala el chart `ingress-nginx` desde su repositorio oficial, en el namespace `simulacro-helm`, creándolo si no existe, con el nombre de release `sim-ingress`. Realiza inmediatamente después un upgrade del mismo release cambiando `controller.replicaCount` a 2. Guarda el número de revisión actual del release en `/opt/simulacro/helm-revision.txt`.

**Tarea 4** (6 puntos, dominio Cluster Architecture)

Verifica la fecha de expiración de todos los certificados del cluster y guarda la salida completa en `/opt/simulacro/certs-check.txt`. Identifica cuál certificado individual expira primero y guarda únicamente su nombre en `/opt/simulacro/cert-mas-proximo.txt`.

**Tarea 5** (5 puntos, dominio Workloads & Scheduling)

Crea un Deployment llamado `sim-web` en el namespace `simulacro`, imagen `nginx:1.25`, 6 réplicas, con estrategia RollingUpdate donde `maxSurge` sea 2 y `maxUnavailable` sea 0. Una vez Running, realiza un upgrade de la imagen a `nginx:1.26` y confirma que el rollout se completa exitosamente.

**Tarea 6** (5 puntos, dominio Workloads & Scheduling)

Crea un CronJob llamado `sim-reporte` en el namespace `simulacro`, que corra cada 5 minutos, imagen `busybox`, comando que ejecute `echo Reporte generado`, con `successfulJobsHistoryLimit` en 2 y `concurrencyPolicy` en `Forbid`.

**Tarea 7** (5 puntos, dominio Workloads & Scheduling)

Crea un pod llamado `sim-critico` en el namespace `simulacro`, imagen `nginx:1.25`, con node affinity requerida hacia nodos que tengan la label `disco=ssd`, y con una toleration que le permita correr en el control plane si fuera necesario, tolerando el taint `node-role.kubernetes.io/control-plane` con efecto `NoSchedule`.

**Tarea 8** (5 puntos, dominio Services & Networking)

Expón el Deployment `sim-web` de la Tarea 5 con un Service de tipo NodePort llamado `sim-web-svc`, en el puerto 80. Guarda el NodePort autoasignado en `/opt/simulacro/nodeport.txt`.

**Tarea 9** (5 puntos, dominio Services & Networking)

Crea un Ingress llamado `sim-ingress-rule` en el namespace `simulacro`, `ingressClassName: nginx`, que enrute peticiones con host `simulacro.local` y path `/` hacia el Service `sim-web-svc` en el puerto 80.

**Tarea 10** (5 puntos, dominio Services & Networking)

En el namespace `simulacro`, crea una NetworkPolicy que deniegue todo el tráfico ingress por defecto. Crea una segunda NetworkPolicy que permita tráfico hacia los pods con label `app=sim-web` únicamente desde pods con label `role=cliente-autorizado`, en el puerto 80.

**Tarea 11** (5 puntos, dominio Services & Networking)

Desde un pod temporal en el namespace `simulacro-b`, que deberás crear, resuelve el nombre del Service `sim-web-svc` del namespace `simulacro` usando la forma más corta posible sin el FQDN completo, y guarda el resultado en `/opt/simulacro/dns-resultado.txt`.

**Tarea 12** (5 puntos, dominio Storage)

Crea un PersistentVolume estático llamado `sim-pv`, 1Gi, `ReadWriteOnce`, `persistentVolumeReclaimPolicy: Retain`, `storageClassName: sim-manual`, `hostPath` en `/mnt/sim-datos` en cka-worker1, con la nodeAffinity correspondiente. Crea una PVC llamada `sim-pvc` en el namespace `simulacro` que se bindee correctamente contra ese PV.

**Tarea 13** (5 puntos, dominio Storage)

Crea un StatefulSet llamado `sim-db` en el namespace `simulacro`, 2 réplicas, imagen `nginx:1.25`, con un `volumeClaimTemplate` de 1Gi en modo `ReadWriteOnce`, y su Headless Service correspondiente. Verifica que cada réplica obtuvo su propia PVC individual.

**Tarea 14** (6 puntos, dominio Troubleshooting)

El namespace `simulacro-roto` contiene un Deployment llamado `app-rota` que nunca llega a Ready. Diagnostica la causa raíz exacta y corrígela sin eliminar el Deployment, únicamente editando lo necesario.

**Tarea 15** (6 puntos, dominio Troubleshooting)

El nodo cka-worker2 está reportado como NotReady. Diagnostica la causa exacta revisando sus Conditions y, si es necesario, accediendo al nodo directamente, y restaura su estado a Ready.

**Tarea 16** (6 puntos, dominio Troubleshooting)

El namespace `simulacro-roto` contiene un pod llamado `app-sin-imagen` que nunca arranca. Diagnostica si el problema es de nombre de imagen o de credenciales, y corrígelo.

**Tarea 17** (6 puntos, dominio Troubleshooting)

El namespace `simulacro-roto` contiene un pod llamado `app-reinicios` con un contador de RESTARTS creciente. Diagnostica si el problema es de la propia aplicación o de una probe mal configurada, y corrígelo sin eliminar la probe por completo.

**Tarea 18** (6 puntos, dominio Troubleshooting)

Un pod en cka-worker1 no puede conectarse a un Service cuyos pods backend corren únicamente en cka-worker2. Diagnostica si el problema es de Endpoints, de kube-proxy, o de routing entre nodos, y corrígelo.

## 5. Soluciones y verificación

No consultar hasta haber completado o abandonado cada tarea de la sección 4.

**Preparación del entorno roto, ejecutar antes de intentar las Tareas 14, 16 y 17:**

```bash exec
kubectl create namespace simulacro-roto

kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-rota
  namespace: simulacro-roto
spec:
  replicas: 2
  selector:
    matchLabels:
      app: app-rota
  template:
    metadata:
      labels:
        app: app-rota
    spec:
      containers:
      - name: app
        image: nginx:1.25
        envFrom:
        - configMapRef:
            name: config-simulacro-inexistente
EOF

kubectl run app-sin-imagen --image=nginx:1.9999.simulacro -n simulacro-roto

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: app-reinicios
  namespace: simulacro-roto
spec:
  containers:
  - name: app
    image: nginx:1.25
    livenessProbe:
      httpGet:
        path: /
        port: 9999
      initialDelaySeconds: 1
      periodSeconds: 3
EOF
```

**Solución Tarea 1:**

```bash exec
kubectl create namespace simulacro

kubectl create serviceaccount ci-runner -n simulacro

kubectl create role ci-role --verb=get,list,create --resource=pods,pods/log -n simulacro

kubectl create rolebinding ci-role-binding --role=ci-role --serviceaccount=simulacro:ci-runner -n simulacro

kubectl auth can-i create pods --as=system:serviceaccount:simulacro:ci-runner -n simulacro
kubectl auth can-i delete pods --as=system:serviceaccount:simulacro:ci-runner -n simulacro
```

Verificación: la primera respuesta debe ser `yes`, la segunda `no`.

**Solución Tarea 2:**

```bash exec
sudo mkdir -p /opt/simulacro

sudo ETCDCTL_API=3 etcdctl snapshot save /opt/simulacro/etcd-backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

sudo ETCDCTL_API=3 etcdctl snapshot status /opt/simulacro/etcd-backup.db --write-out=table > /opt/simulacro/etcd-status.txt
```

Verificación: `/opt/simulacro/etcd-backup.db` existe con tamaño mayor a 0, y `/opt/simulacro/etcd-status.txt` contiene la tabla con HASH, REVISION, TOTAL KEYS, TOTAL SIZE.

**Solución Tarea 3:**

```bash exec
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install sim-ingress ingress-nginx/ingress-nginx -n simulacro-helm --create-namespace

helm upgrade sim-ingress ingress-nginx/ingress-nginx -n simulacro-helm --set controller.replicaCount=2

helm list -n simulacro-helm -o json | grep -o '"revision":"[0-9]*"' | grep -o '[0-9]*' > /opt/simulacro/helm-revision.txt
```

Verificación: `/opt/simulacro/helm-revision.txt` contiene `2`.

**Solución Tarea 4:**

```bash exec
sudo kubeadm certs check-expiration > /opt/simulacro/certs-check.txt

cat /opt/simulacro/certs-check.txt
```

Identificar visualmente cuál certificado tiene el `RESIDUAL TIME` más corto en la columna correspondiente. El siguiente comando se ejecuta sustituyendo el nombre real identificado:

```text reference
echo "<nombre-identificado-visualmente>" > /opt/simulacro/cert-mas-proximo.txt
```

Verificación: ambos ficheros existen y `cert-mas-proximo.txt` contiene un nombre real de la lista de `certs-check.txt`.

**Solución Tarea 5:**

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sim-web
  namespace: simulacro
spec:
  replicas: 6
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2
      maxUnavailable: 0
  selector:
    matchLabels:
      app: sim-web
  template:
    metadata:
      labels:
        app: sim-web
    spec:
      containers:
      - name: web
        image: nginx:1.25
EOF

kubectl rollout status deployment/sim-web -n simulacro

kubectl set image deployment/sim-web web=nginx:1.26 -n simulacro

kubectl rollout status deployment/sim-web -n simulacro
```

Verificación: `kubectl rollout status` termina con "successfully rolled out" ambas veces.

**Solución Tarea 6:**

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: sim-reporte
  namespace: simulacro
spec:
  schedule: "*/5 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 2
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: reporte
            image: busybox
            command: ["sh", "-c", "echo Reporte generado"]
EOF
```

Verificación: `kubectl get cronjob sim-reporte -n simulacro` muestra el schedule correcto.

**Solución Tarea 7:**

```bash exec
kubectl label node cka-worker1 disco=ssd --overwrite

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: sim-critico
  namespace: simulacro
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions:
          - key: disco
            operator: In
            values:
            - ssd
  tolerations:
  - key: node-role.kubernetes.io/control-plane
    effect: NoSchedule
  containers:
  - name: app
    image: nginx:1.25
EOF
```

Verificación: `kubectl get pod sim-critico -n simulacro -o wide` muestra el pod Running en un nodo con la label `disco=ssd`.

**Solución Tarea 8:**

```bash exec
kubectl expose deployment sim-web --port=80 --target-port=80 --type=NodePort --name=sim-web-svc -n simulacro

kubectl get svc sim-web-svc -n simulacro -o jsonpath='{.spec.ports[0].nodePort}' > /opt/simulacro/nodeport.txt
```

Verificación: `/opt/simulacro/nodeport.txt` contiene un número entre 30000 y 32767.

**Solución Tarea 9:**

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sim-ingress-rule
  namespace: simulacro
spec:
  ingressClassName: nginx
  rules:
  - host: simulacro.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: sim-web-svc
            port:
              number: 80
EOF
```

Verificación: `kubectl get ingress sim-ingress-rule -n simulacro` muestra CLASS `nginx` y HOSTS `simulacro.local`.

**Solución Tarea 10:**

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sim-deny-all
  namespace: simulacro
spec:
  podSelector: {}
  policyTypes:
  - Ingress
EOF

kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sim-allow-cliente
  namespace: simulacro
spec:
  podSelector:
    matchLabels:
      app: sim-web
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          role: cliente-autorizado
    ports:
    - protocol: TCP
      port: 80
EOF
```

Verificación: `kubectl get networkpolicy -n simulacro` muestra ambas policies.

**Solución Tarea 11:**

```bash exec
kubectl create namespace simulacro-b

kubectl run sim-cliente-dns --image=busybox --restart=Never -n simulacro-b -- sleep 3600

kubectl exec -n simulacro-b sim-cliente-dns -- nslookup sim-web-svc.simulacro > /opt/simulacro/dns-resultado.txt
```

Verificación: `/opt/simulacro/dns-resultado.txt` contiene una dirección IP resuelta correctamente.

**Solución Tarea 12:**

```bash exec
sudo mkdir -p /mnt/sim-datos
sudo chmod 777 /mnt/sim-datos
```

Ejecutado en cka-worker1.

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolume
metadata:
  name: sim-pv
spec:
  capacity:
    storage: 1Gi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: sim-manual
  hostPath:
    path: /mnt/sim-datos
  nodeAffinity:
    required:
      nodeSelectorTerms:
      - matchExpressions:
        - key: kubernetes.io/hostname
          operator: In
          values:
          - cka-worker1
EOF

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: sim-pvc
  namespace: simulacro
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: sim-manual
  resources:
    requests:
      storage: 1Gi
EOF
```

Verificación: `kubectl get pvc sim-pvc -n simulacro` muestra STATUS Bound.

**Solución Tarea 13:**

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: sim-db-headless
  namespace: simulacro
spec:
  clusterIP: None
  selector:
    app: sim-db
  ports:
  - port: 80
EOF

kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: sim-db
  namespace: simulacro
spec:
  serviceName: sim-db-headless
  replicas: 2
  selector:
    matchLabels:
      app: sim-db
  template:
    metadata:
      labels:
        app: sim-db
    spec:
      containers:
      - name: db
        image: nginx:1.25
  volumeClaimTemplates:
  - metadata:
      name: datos
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 1Gi
EOF

kubectl get pvc -n simulacro -l app=sim-db
```

Verificación: existen dos PVCs, `datos-sim-db-0` y `datos-sim-db-1`, ambas Bound.

**Solución Tarea 14:**

```bash exec
kubectl describe deployment app-rota -n simulacro-roto
kubectl get pods -n simulacro-roto -l app=app-rota
kubectl describe pod -n simulacro-roto -l app=app-rota
```

El evento revela `configmap "config-simulacro-inexistente" not found`, el mismo patrón de CreateContainerConfigError visto en M17.

```bash exec
kubectl create configmap config-simulacro-inexistente -n simulacro-roto --from-literal=clave=valor
```

Verificación: `kubectl get pods -n simulacro-roto -l app=app-rota` muestra ambas réplicas Running tras unos segundos.

**Solución Tarea 15:**

```bash exec
kubectl describe node cka-worker2
```

Revisar la razón exacta en Conditions, según el patrón de M16: `KubeletNotReady` requiere `systemctl start kubelet` en el nodo, `NetworkPluginNotReady` requiere revisar el pod de calico-node de ese nodo específico.

```bash exec
ssh cka-worker2 "sudo systemctl status kubelet"
```

Aplicar la corrección correspondiente según lo que revele el diagnóstico real.

Verificación: `kubectl get node cka-worker2` muestra STATUS Ready.

**Solución Tarea 16:**

```bash exec
kubectl describe pod app-sin-imagen -n simulacro-roto
```

El evento revela `image not found`, sin relación con credenciales, según el patrón de M17.

```bash exec
kubectl delete pod app-sin-imagen -n simulacro-roto
kubectl run app-sin-imagen --image=nginx:1.25 -n simulacro-roto
```

Verificación: `kubectl get pod app-sin-imagen -n simulacro-roto` muestra STATUS Running.

**Solución Tarea 17:**

```bash exec
kubectl describe pod app-reinicios -n simulacro-roto
```

Los Events revelan `Liveness probe failed`, apuntando al puerto 9999, que nginx no expone; nginx escucha en el puerto 80. El patrón exacto del Caso 4 de M17.

```bash exec
kubectl patch pod app-reinicios -n simulacro-roto --type=json -p='[{"op":"replace","path":"/spec/containers/0/livenessProbe/httpGet/port","value":80}]' 2>/dev/null || \
(kubectl delete pod app-reinicios -n simulacro-roto && kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: app-reinicios
  namespace: simulacro-roto
spec:
  containers:
  - name: app
    image: nginx:1.25
    livenessProbe:
      httpGet:
        path: /
        port: 80
      initialDelaySeconds: 1
      periodSeconds: 3
EOF
)
```

El patch directo probablemente sea rechazado, ya que `livenessProbe` no es un campo mutable en un pod ya creado; la vía real es eliminar y recrear, como ya se documentó en M17 para `tolerations`.

Verificación: `kubectl get pod app-reinicios -n simulacro-roto` muestra RESTARTS sin seguir creciendo tras la corrección.

**Solución Tarea 18:**

El siguiente comando se ejecuta sustituyendo el nombre real del Service involucrado:

```text reference
kubectl get endpoints <nombre-del-service-involucrado> -n simulacro
```

Confirmar que los Endpoints existen y apuntan a las IPs correctas de los pods en cka-worker2, descartando un problema de selector, según el patrón de M10.

```bash exec
kubectl get pods -n kube-system -o wide | grep kube-proxy | grep cka-worker1
```

Revisar los logs de esa instancia específica de kube-proxy, según el patrón de M16, y si las reglas locales están desincronizadas, reiniciar ese pod de kube-proxy específico para forzar la resincronización.

Verificación: la conectividad entre el pod de cka-worker1 y el Service backend en cka-worker2 se restablece.

## 6. Hoja de puntuación

```text reference
Tarea    Dominio                  Puntos    Obtenido
------------------------------------------------------
1        Cluster Architecture     6
2        Cluster Architecture     7
3        Cluster Architecture     6
4        Cluster Architecture     6
5        Workloads & Scheduling   5
6        Workloads & Scheduling   5
7        Workloads & Scheduling   5
8        Services & Networking    5
9        Services & Networking    5
10       Services & Networking    5
11       Services & Networking    5
12       Storage                  5
13       Storage                  5
14       Troubleshooting          6
15       Troubleshooting          6
16       Troubleshooting          6
17       Troubleshooting          6
18       Troubleshooting          6
------------------------------------------------------
TOTAL                             100

APROBADO: 66 puntos o mas
```

## 7. Análisis de resultados

Si el total está por debajo de 66, identifica en qué DOMINIO concentraste los fallos, no tarea por tarea de forma aislada, ya que el patrón importa más que el fallo individual.

Fallos concentrados en Cluster Architecture, tareas 1 a 4, indican repasar M03, M04, M05 o M06 según cuál tarea específica falló.

Fallos concentrados en Workloads & Scheduling, tareas 5 a 7, indican repasar M07, M08 o M09.

Fallos concentrados en Services & Networking, tareas 8 a 11, indican repasar M10, M11, M12 o M13.

Fallos concentrados en Storage, tareas 12 y 13, indican repasar M14.

Fallos concentrados en Troubleshooting, tareas 14 a 18, el bloque de mayor peso del examen real, indican repasar específicamente M15, M16 o M17 según qué tipo de fallo, control plane, nodos y red, o aplicaciones y storage, fue el más lento o el más incorrecto.

Si el tiempo total superó los 120 minutos pero la puntuación fue alta, el problema no es de conocimiento sino de velocidad de ejecución: repasar M01 específicamente, la base operacional de kubectl imperativo, aliases y extracción de datos, suele ser lo que más acorta el tiempo por tarea en un segundo intento.

Limpieza completa del simulacro:

```bash exec
kubectl delete namespace simulacro simulacro-b simulacro-roto simulacro-helm
kubectl delete pv sim-pv
sudo rm -rf /mnt/sim-datos /opt/simulacro
```

---

**Fin del curso.** Los 18 módulos cubren el temario completo del examen CKA con la profundidad y el entorno real practicados a lo largo de todo el programa. El siguiente paso es repetir este simulacro tantas veces como sea necesario hasta completarlo consistentemente por encima de 66 puntos y dentro de los 120 minutos.