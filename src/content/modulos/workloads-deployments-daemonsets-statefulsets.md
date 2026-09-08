---
code: M07
order: 7
slug: workloads-deployments-daemonsets-statefulsets
title: Workloads — Deployments, DaemonSets y StatefulSets
description: Domina Deployments con RollingUpdate y rollback, DaemonSets por nodo, y StatefulSets con identidad de red y storage estables.
access: free
updated: "2026-09-08"
prerequisites: [arquitectura-kubernetes, rbac-seguridad-cluster]
---

## 1. Resumen técnico

Este módulo cubre los tres controllers de más alto nivel para gestionar pods en producción: Deployment, aplicaciones stateless con actualizaciones continuas, DaemonSet, un pod por nodo para agentes de infraestructura, y StatefulSet, aplicaciones con estado que requieren identidad de red y storage estables. Deployment gestiona una capa intermedia, el ReplicaSet, que a su vez gestiona los Pods; DaemonSet y StatefulSet gestionan sus Pods directamente, sin ese objeto intermedio.

## 2. Peso en el examen y preguntas típicas

15% del examen, dominio Workloads & Scheduling. Preguntas típicas:

- Crea un Deployment con estrategia RollingUpdate, maxSurge=1, maxUnavailable=0.
- Realiza un rollback del Deployment X a la revisión anterior.
- El Deployment X está en un rollout colgado, diagnostica y corrige.
- Crea un DaemonSet que corra en todos los nodos excepto el control plane.
- Crea un StatefulSet con 3 réplicas y verifica que cada pod mantiene su identidad tras un reinicio.

## 3. Prerrequisitos

De [M02 (Arquitectura)](/modulos/arquitectura-kubernetes/) usarás el reconciliation loop del controller-manager, observar, comparar, actuar, aplicado ahora a ReplicaSets y a los controllers de DaemonSet y StatefulSet.

De [M03 (kubeadm)](/modulos/kubeadm-etcd-backup-restore-upgrade/) usarás la diferencia entre static pods, gestionados por kubelet directamente, y pods gestionados por un controller vía la API.

De [M05 (RBAC)](/modulos/rbac-seguridad-cluster/) usarás los ServiceAccounts, ya que los controllers internos de Kubernetes usan RBAC para operar sobre estos recursos.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Explicar la cadena Deployment, ReplicaSet, Pod, y por qué existe esa capa intermedia.
2. Configurar una estrategia RollingUpdate con maxSurge y maxUnavailable según un requisito dado.
3. Ejecutar y revertir un rollout, entendiendo que un rollback es en sí mismo un nuevo rollout.
4. Explicar qué cambió en el scheduling de DaemonSet en Kubernetes 1.12 y por qué el scheduler por defecto sigue interviniendo.
5. Explicar por qué un StatefulSet requiere un Headless Service y qué problema resuelve.
6. Diagnosticar un rollout estancado usando `kubectl rollout status`, `describe` y `logs`, entendiendo el rol de `progressDeadlineSeconds`.

## 5. Explicación teórica progresiva

### 5.1 Por qué existe el ReplicaSet

Conexión con M02: el reconciliation loop necesita un objeto que defina cuántas réplicas de este pod deben existir. Ese objeto es el ReplicaSet: usa un label selector para identificar qué pods le pertenecen, compara el número de pods que coinciden con ese selector contra `spec.replicas`, y si faltan crea pods desde el template; si sobran, elimina pods según un algoritmo de varios criterios, no simplemente los más nuevos primero.

El algoritmo real de eliminación al escalar hacia abajo, en orden de prioridad, es el siguiente. Primero se eliminan los pods no programados o aún Pending. Luego los pods NO Ready se eliminan antes que los Ready. Si existe la anotación `controller.kubernetes.io/pod-deletion-cost`, el pod con el valor más bajo se elimina primero, por defecto todos valen 0. Los pods en nodos con más réplicas del mismo ReplicaSet se prefieren sobre pods en nodos con menos. Entre pods Ready, se elimina primero el que lleva menos tiempo en ese estado. Los pods con más reinicios se eliminan primero. Solo como criterio final, el pod creado más recientemente se elimina primero. Si todo lo anterior empata, se usa un orden pseudoaleatorio por UUID.

Un ReplicaSet no sabe hacer rolling updates. Si cambias la imagen de un ReplicaSet, no reemplaza los pods automáticamente de forma gradual; hay que gestionarlo manualmente. Por eso Deployment existe como una capa encima:

```text reference
Deployment -> gestiona -> ReplicaSet -> gestiona -> Pod
```

Cuando cambias la imagen de un Deployment, este no modifica el ReplicaSet existente: crea un ReplicaSet nuevo con el template actualizado, y orquesta la transición gradual entre el ReplicaSet viejo, escalando a 0, y el nuevo, escalando hasta el total. El ReplicaSet viejo no se borra de inmediato: se conserva escalado a 0 réplicas como historial de revisión, hasta el límite marcado por `spec.revisionHistoryLimit`, 10 por defecto. Superado ese límite, los ReplicaSets más antiguos se eliminan de forma definitiva y dejan de estar disponibles para rollback.

Verlo directamente:

```bash exec
kubectl create deployment demo --image=nginx:1.25 --replicas=3
kubectl get replicaset
kubectl get pods -l app=demo
```

```text output
deployment.apps/demo created

NAME               DESIRED   CURRENT   READY   AGE
demo-6d9f8b7c9d     3         3         3       5s

NAME                     READY   STATUS    RESTARTS   AGE
demo-6d9f8b7c9d-4kxlq    1/1     Running   0          5s
demo-6d9f8b7c9d-9p2wr    1/1     Running   0          5s
demo-6d9f8b7c9d-hj7zt    1/1     Running   0          5s
```

### 5.2 Anatomía de un Rolling Update

Cuando actualizas la imagen de un Deployment, el controller ejecuta esta secuencia. Primero crea un ReplicaSet nuevo con el template actualizado, inicialmente con 0 réplicas. Luego escala el ReplicaSet nuevo hacia arriba y el viejo hacia abajo de forma incremental, respetando dos límites configurables.

El valor `maxSurge` indica cuántos pods extra por encima de `spec.replicas` se permiten durante la actualización. Ejemplo: réplicas=4, maxSurge=1, puede haber hasta 5 pods simultáneos durante el rollout.

El valor `maxUnavailable` indica cuántos pods pueden estar no disponibles, por debajo de `spec.replicas`, durante la actualización. Ejemplo: réplicas=4, maxUnavailable=1, nunca menos de 3 pods disponibles.

Cada pod nuevo debe pasar su readiness probe antes de contar como disponible. Si un pod nuevo nunca pasa su readiness probe, el rollout deja de progresar, tema que se retoma en 5.5. Cuando el ReplicaSet nuevo alcanza `spec.replicas` y el viejo llega a 0, el rollout termina.

La configuración por defecto es maxSurge 25% y maxUnavailable 25%, redondeado según el número de réplicas.

La otra estrategia, Recreate, elimina todos los pods viejos antes de crear los nuevos. Provoca downtime pero es necesaria cuando la aplicación no tolera dos versiones corriendo simultáneamente, por ejemplo migraciones de esquema de base de datos incompatibles.

El rollback no es instantáneo. `kubectl rollout undo` no es un interruptor que revierte el estado al instante: internamente dispara un nuevo rollout, escala hacia arriba el ReplicaSet de la revisión destino y escala hacia abajo el ReplicaSet actual, respetando la misma estrategia RollingUpdate que cualquier otra actualización. En la práctica suele completarse en segundos porque el ReplicaSet destino ya tiene su imagen descargada y probada, pero el mecanismo es el mismo rolling update, no un cambio de estado atómico.

### 5.3 DaemonSet, un pod por nodo

Conexión con M03 y M06: ya usaste DaemonSets sin llamarlos formalmente, kube-proxy y calico-node son DaemonSets. Ahora se formaliza el concepto.

Un DaemonSet garantiza que exactamente un pod de cierto tipo corra en cada nodo, o en un subconjunto de nodos filtrado por nodeSelector, sin importar cuántos nodos se agreguen o quiten del cluster después.

Desde Kubernetes 1.12, el DaemonSet controller no asigna el pod a un nodo saltándose el scheduler. Lo que hace es crear, para cada nodo elegible, un Pod con un nodeAffinity que apunta específicamente a ese nodo. Es el scheduler por defecto quien coloca ese pod en su nodo destino, exactamente igual que con cualquier otro pod, y por tanto sí evalúa sus requests contra los recursos asignables del nodo: un pod de DaemonSet puede quedar Pending por falta de recursos, igual que cualquier otro pod.

La diferencia real frente a un ReplicaSet no es evitar el scheduler, sino que el DaemonSet controller decide de antemano en qué nodo debe ir cada réplica, uno por cada nodo elegible, mientras que un ReplicaSet deja que el scheduler elija libremente entre todos los nodos disponibles. En la práctica, los DaemonSets de infraestructura crítica, como kube-proxy, suelen llevar una PriorityClass alta para minimizar el riesgo de quedar Pending bajo presión de recursos.

Antes de la versión 1.12, el DaemonSet controller asignaba el pod directamente vía `spec.nodeName`, sin pasar por el scheduler en absoluto. Ese comportamiento quedó obsoleto y no aplica a tu cluster.

Por defecto, un DaemonSet no corre en el control plane porque este tiene el taint `node-role.kubernetes.io/control-plane:NoSchedule`. Para que un DaemonSet corra también ahí, como calico-node, que sí necesita correr en el control plane para dar red a sus pods, su spec incluye una toleration explícita para ese taint.

Las actualizaciones de DaemonSet usan `updateStrategy`, RollingUpdate por defecto u OnDelete. Con RollingUpdate, `maxUnavailable` controla cuántos nodos pueden estar sin el pod del DaemonSet simultáneamente durante una actualización.

### 5.4 StatefulSet, identidad y storage estables

Un Deployment trata todos sus pods como intercambiables: mismo nombre generado aleatoriamente, sin orden de creación garantizado, sin storage individual persistente. Esto es perfecto para apps stateless, un frontend web, pero roto para apps con estado: una base de datos en cluster necesita que cada nodo tenga siempre la misma identidad de red y siempre el mismo volumen de datos, incluso tras reiniciarse.

Un StatefulSet ofrece tres garantías. La primera es un nombre ordinal estable: los pods se llaman nombre-0, nombre-1, nombre-2, nunca con sufijo aleatorio. Si el pod web-1 muere, su reemplazo se vuelve a llamar web-1, no un nombre nuevo.

La segunda es el orden de creación y eliminación. Con la política por defecto OrderedReady, se crean en orden estricto, 0, luego 1, luego 2. El pod N+1 no se crea hasta que el pod N esté Running y Ready. Esto es una condición bloqueante, no solo secuencial: si pod-0 nunca llega a Ready, pod-1 nunca se crea, no aparece en el cluster de ninguna forma, ni Pending ni en ningún otro estado. Se eliminan en orden inverso, 2, luego 1, luego 0.

La tercera es storage individual y persistente. Cada pod obtiene su propio PersistentVolumeClaim, generado desde un `volumeClaimTemplate`. Si el pod web-1 se elimina y se recrea, se reconecta al mismo PVC, mismos datos, no a uno nuevo. La profundidad completa de PVC se cubre más adelante en el módulo de Storage.

Un StatefulSet requiere un Headless Service porque un Service normal balancea tráfico entre pods de forma intercambiable, dándoles una sola IP virtual compartida. Para un StatefulSet, cada pod necesita su propio nombre DNS individual y resoluble, no un balanceo hacia cualquiera de ellos. Un Headless Service, `clusterIP: None`, no crea una IP virtual: en su lugar, CoreDNS devuelve directamente las IPs de los pods individuales al consultar `pod.service.namespace.svc.cluster.local`:

```text reference
web-0.web-headless.default.svc.cluster.local
web-1.web-headless.default.svc.cluster.local
```

Esto permite que un pod de la aplicación se conecte específicamente al nodo 0 del cluster de datos, algo imposible con un Service normal.

### 5.5 progressDeadlineSeconds, cuándo un rollout se marca estancado

El Deployment controller sigue intentando progresar un rollout indefinidamente en segundo plano, pero expone una señal de alerta: `spec.progressDeadlineSeconds`, 600 segundos por defecto. Si en ese tiempo no hay progreso, ningún pod nuevo pasa a Ready, ningún pod viejo se termina, ningún ReplicaSet nuevo escala, el Deployment marca su condición Progressing en False con razón ProgressDeadlineExceeded. Esta condición es lo que `kubectl rollout status` detecta para reportar el fallo; el controller no hace rollback automático, simplemente deja de considerar el rollout como en progreso saludable y sigue reintentando.

## 6. Diagrama ASCII - Rolling Update paso a paso

```text reference
Estado inicial: Deployment "web", replicas=4,
maxSurge=1, maxUnavailable=0
ReplicaSet-v1 (imagen nginx:1.25): 4/4 pods Running

Usuario ejecuta:
kubectl set image deployment/web nginx=nginx:1.26

PASO 1 - se crea ReplicaSet-v2, aun en 0:
  ReplicaSet-v1: [P][P][P][P]  (4 pods, imagen 1.25)
  ReplicaSet-v2: []            (0 pods, imagen 1.26)

PASO 2 - maxSurge=1 permite 1 pod extra (total 5):
  ReplicaSet-v1: [P][P][P][P]  (4, sigue igual)
  ReplicaSet-v2: [P*]          (1 pod nuevo, arrancando)
  * el pod nuevo debe pasar su readiness probe
    antes de contar como disponible

PASO 3 - pod nuevo Ready; maxUnavailable=0 obliga
a mantener 4 disponibles siempre, asi que ahora
puede bajar 1 del viejo:
  ReplicaSet-v1: [P][P][P]     (baja a 3)
  ReplicaSet-v2: [P][P*]       (sube a 2, uno arrancando)

PASO 4, 5... se repite el patron hasta:
  ReplicaSet-v1: []            (0 pods)
  ReplicaSet-v2: [P][P][P][P]  (4 pods, imagen 1.26)

ReplicaSet-v1 se CONSERVA (revision anterior, escalado
a 0) hasta el limite de spec.revisionHistoryLimit,
permitiendo rollback mientras no se supere ese limite.
```

## 7. Ejemplos prácticos desplegables

### 7.1 Deployment con RollingUpdate configurado

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web
        image: nginx:1.25
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 2
          periodSeconds: 3
        resources:
          requests:
            cpu: 50m
            memory: 64Mi
EOF
```

Verificar el rollout inicial:

```bash exec
kubectl rollout status deployment/web
kubectl get replicaset -l app=web
```

Ejecutar la actualización:

```bash exec
kubectl set image deployment/web nginx=nginx:1.26
kubectl rollout status deployment/web
```

```text output
Waiting for deployment "web" rollout to finish: 1 out of 4 new replicas have been updated...
Waiting for deployment "web" rollout to finish: 2 out of 4 new replicas have been updated...
deployment "web" successfully rolled out
```

Observar el proceso en vivo en otra terminal mientras corre:

```bash exec
watch kubectl get pods -l app=web
```

Nunca más de 5 pods activos, maxSurge=1, ni menos de 4 disponibles, maxUnavailable=0. Ctrl+C para salir.

Verificar el historial de revisiones:

```bash exec
kubectl rollout history deployment/web
```

```text output
deployment.apps/web
REVISION  CHANGE-CAUSE
1         <none>
2         <none>
```

Ver el detalle de una revisión específica:

```bash exec
kubectl rollout history deployment/web --revision=1
```

Pausar un rollout a mitad de camino, útil cuando detectas un problema durante el despliegue:

```bash exec
kubectl set image deployment/web nginx=nginx:1.27
kubectl rollout pause deployment/web
```

Continuar desde donde quedó:

```bash exec
kubectl rollout resume deployment/web
```

Revertir a la revisión anterior, recordando que esto dispara un nuevo rollout, no un cambio instantáneo:

```bash exec
kubectl rollout undo deployment/web
```

Revertir a una revisión específica:

```bash exec
kubectl rollout undo deployment/web --to-revision=1
```

### 7.2 DaemonSet, agente en todos los nodos

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-monitor
  labels:
    app: node-monitor
spec:
  selector:
    matchLabels:
      app: node-monitor
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
  template:
    metadata:
      labels:
        app: node-monitor
    spec:
      containers:
      - name: monitor
        image: busybox
        command: ["sh", "-c", "while true; do sleep 3600; done"]
        resources:
          requests:
            cpu: 50m
            memory: 32Mi
EOF
```

Verificar que corre exactamente en los workers, 2 pods, no en el control plane, por defecto:

```bash exec
kubectl get pods -l app=node-monitor -o wide
kubectl get daemonset node-monitor
```

```text output
NAME                 READY   STATUS    NODE
node-monitor-4jkxc   1/1     Running   cka-worker1
node-monitor-9plqz   1/1     Running   cka-worker2

NAME           DESIRED   CURRENT   READY
node-monitor   2         2         2
```

DESIRED=2 porque el DaemonSet solo cuenta los nodos sin el taint de control-plane.

Confirmar que el scheduler por defecto es quien coloca estos pods, no el DaemonSet controller:

```bash exec
kubectl get pod -l app=node-monitor -o jsonpath='{.items[0].spec.affinity.nodeAffinity}'
kubectl describe pod -l app=node-monitor | grep -A2 "Events:"
```

```text output
{"requiredDuringSchedulingIgnoredDuringExecution":{"nodeSelectorTerms":[{"matchFields":[{"key":"metadata.name","operator":"In","values":["cka-worker1"]}]}]}}

Events:
  Normal  Scheduled  <invalid>  default-scheduler  Successfully assigned default/node-monitor-4jkxc to cka-worker1
```

El campo nodeAffinity confirma el mecanismo de 5.3, y el evento Scheduled confirma que fue default-scheduler quien hizo el bind, no el DaemonSet controller.

Hacer que también corra en el control plane, agregando la toleration correspondiente:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-monitor
  labels:
    app: node-monitor
spec:
  selector:
    matchLabels:
      app: node-monitor
  template:
    metadata:
      labels:
        app: node-monitor
    spec:
      tolerations:
      - key: node-role.kubernetes.io/control-plane
        effect: NoSchedule
      containers:
      - name: monitor
        image: busybox
        command: ["sh", "-c", "while true; do sleep 3600; done"]
EOF
```

```bash exec
kubectl get pods -l app=node-monitor -o wide
```

```text output
NAME                 READY   STATUS    NODE
node-monitor-4jkxc   1/1     Running   cka-worker1
node-monitor-9plqz   1/1     Running   cka-worker2
node-monitor-7xzqm   1/1     Running   cka-cp1
```

DESIRED cambia a 3.

### 7.3 StatefulSet con Headless Service

Headless Service primero, requisito del StatefulSet:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web-headless
spec:
  clusterIP: None
  selector:
    app: web-stateful
  ports:
  - port: 80
    name: http
EOF
```

Verificar que no tiene IP asignada:

```bash exec
kubectl get svc web-headless
```

```text output
NAME           TYPE        CLUSTER-IP   PORT(S)
web-headless   ClusterIP   None         80/TCP
```

StatefulSet, sin PVC real para simplificar; la versión completa con `volumeClaimTemplate` y almacenamiento persistente se practica en el módulo de Storage:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web-stateful
spec:
  serviceName: web-headless
  replicas: 3
  selector:
    matchLabels:
      app: web-stateful
  template:
    metadata:
      labels:
        app: web-stateful
    spec:
      containers:
      - name: web
        image: nginx:1.25
        ports:
        - containerPort: 80
EOF
```

Observar el orden de creación, ejecutar rápido tras el apply, en otra terminal:

```bash exec
watch kubectl get pods -l app=web-stateful -o wide
```

Aparecerán en orden estricto: web-stateful-0 Running primero, web-stateful-1 arranca solo cuando 0 está Ready, web-stateful-2 arranca solo cuando 1 está Ready. Ctrl+C para salir.

Verificar la identidad de red individual, requiere un pod cliente con herramientas de red:

```bash exec
kubectl run dns-test --image=busybox --restart=Never -- sleep 3600
kubectl exec dns-test -- nslookup web-stateful-0.web-headless.default.svc.cluster.local
kubectl exec dns-test -- nslookup web-stateful-1.web-headless.default.svc.cluster.local
```

```text output
Server:    10.96.0.10
Address:   10.96.0.10:53

Name:   web-stateful-0.web-headless.default.svc.cluster.local
Address: 192.168.135.5

Name:   web-stateful-1.web-headless.default.svc.cluster.local
Address: 192.168.198.11
```

Demostrar la identidad estable tras eliminar un pod:

```bash exec
kubectl get pod web-stateful-1 -o jsonpath='{.status.podIP}'
```

Anotar esta IP.

```bash exec
kubectl delete pod web-stateful-1
watch kubectl get pods -l app=web-stateful
```

El reemplazo se llama otra vez web-stateful-1, no un nombre nuevo aleatorio como haría un ReplicaSet. Ctrl+C cuando esté Running.

```bash exec
kubectl get pod web-stateful-1 -o jsonpath='{.status.podIP}'
```

Esta IP será diferente, la IP del pod sí cambia, pero el nombre DNS web-stateful-1.web-headless sigue resolviendo correctamente al pod nuevo.

## 8. Laboratorio guiado

Objetivo: simular un incidente de rollout fallido y resolverlo, el escenario más realista de examen para esta sección.

Paso 1, desplegar una versión funcional:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-critica
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: app-critica
  template:
    metadata:
      labels:
        app: app-critica
    spec:
      containers:
      - name: app
        image: nginx:1.25
        readinessProbe:
          httpGet:
            path: /
            port: 80
          periodSeconds: 3
EOF
```

```bash exec
kubectl rollout status deployment/app-critica
```

Paso 2, simular un despliegue roto, imagen con un puerto de readiness probe incorrecto, causa común de rollouts estancados:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-critica
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: app-critica
  template:
    metadata:
      labels:
        app: app-critica
    spec:
      containers:
      - name: app
        image: nginx:1.26
        readinessProbe:
          httpGet:
            path: /
            port: 9999
          periodSeconds: 3
EOF
```

Paso 3, detectar el problema:

```bash exec
kubectl rollout status deployment/app-critica
```

```text output
Waiting for deployment spec update to be observed...
Waiting for deployment "app-critica" rollout to finish: 1 out of 3 new replicas have been updated...
```

El comando no llega nunca a successfully rolled out. Ctrl+C para salir del status, no cancela el rollout, solo el comando que esperaba.

```bash exec
kubectl get pods -l app=app-critica
```

```text output
NAME                            READY   STATUS    RESTARTS
app-critica-7d9f8c-4kxlq        1/1     Running   0
app-critica-7d9f8c-9p2wr        1/1     Running   0
app-critica-6b8a4d-hj7zt        0/1     Running   0
```

El pod nuevo app-critica-6b8a4d-hj7zt está en 0/1 READY y no avanza.

```bash exec
kubectl describe pod app-critica-6b8a4d-hj7zt
```

```text output
Events:
  Warning  Unhealthy  Readiness probe failed: dial tcp 192.168.135.9:9999: connect: connection refused
```

Paso 4, corregir el problema, dos opciones válidas en el examen según lo que pida la pregunta. Opción A, corregir hacia adelante:

```bash exec
kubectl patch deployment app-critica --type=json -p='[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/port","value":80}]'
```

Opción B, revertir, recordando que esto dispara un nuevo rollout, no un cambio instantáneo, más rápido bajo presión de tiempo en el examen real:

```bash exec
kubectl rollout undo deployment/app-critica
```

Paso 5, verificar la recuperación:

```bash exec
kubectl rollout status deployment/app-critica
kubectl get pods -l app=app-critica
```

```text output
deployment "app-critica" successfully rolled out

NAME                            READY   STATUS    RESTARTS
app-critica-7d9f8c-4kxlq        1/1     Running   0
app-critica-7d9f8c-9p2wr        1/1     Running   0
app-critica-7d9f8c-k2zxq        1/1     Running   0
```

## 9. Checkpoint

**Pregunta 1**

¿Por qué un Deployment no modifica el ReplicaSet existente cuando cambias la imagen, sino que crea uno nuevo?

Respuesta: porque el ReplicaSet viejo se conserva, escalado a 0, como historial de revisión hasta el límite de `spec.revisionHistoryLimit`, lo que permite el rollback vía `kubectl rollout undo`. Si se modificara el mismo ReplicaSet, se perdería la versión anterior.

**Pregunta 2**

Con réplicas=6, maxSurge=2, maxUnavailable=0, ¿cuál es el número máximo de pods corriendo simultáneamente durante un rollout, y el mínimo de pods disponibles?

Respuesta: máximo 8 pods, 6 más el maxSurge de 2. Mínimo disponible: 6, maxUnavailable=0 no permite bajar del total deseado.

**Pregunta 3**

¿Qué cambió Kubernetes 1.12 en la forma en que se programan los pods de un DaemonSet, y qué sigue siendo responsabilidad del scheduler por defecto?

Respuesta: desde 1.12, el DaemonSet controller ya no asigna el pod directamente a un nodo vía `spec.nodeName`. En su lugar, crea el pod con un nodeAffinity apuntando al nodo elegible. El scheduler por defecto sigue siendo quien coloca, bind, físicamente el pod en ese nodo, y por tanto sigue evaluando sus requests contra los recursos asignables del nodo, igual que con cualquier otro pod.

**Pregunta 4**

¿Qué problema resuelve específicamente un Headless Service que un Service normal no resuelve?

Respuesta: un Service normal da una única IP virtual que balancea hacia cualquier pod del selector. Un Headless Service permite resolver el nombre DNS de cada pod individualmente, necesario para que un StatefulSet tenga identidad de red estable e individual.

**Pregunta 5**

Un StatefulSet con 3 réplicas y política OrderedReady: pod-0 nunca llega a estado Ready. ¿Qué le sucede a pod-1?

Respuesta: pod-1 nunca se crea. El StatefulSet controller no crea el siguiente pod de la secuencia hasta que el anterior esté Running y Ready. Si pod-0 se queda bloqueado, pod-1 simplemente no llega a existir en el cluster, no aparece ni como Pending. Hay que corregir o eliminar pod-0 para que el controller continúe con pod-1.

## 10. Laboratorio cronometrado

Objetivo: completar en menos de 15 minutos.

Tarea:

1. Crea un Deployment api-gateway con imagen nginx:1.25, 5 réplicas, estrategia RollingUpdate con maxSurge=2 y maxUnavailable=1.
2. Realiza un upgrade de la imagen a nginx:1.26.
3. Verifica el historial y guarda el número total de revisiones en /tmp/revisiones.txt.
4. Crea un DaemonSet log-agent con imagen busybox, comando sleep 3600, que corra únicamente en los nodos worker, sin tolerar el taint del control plane.
5. Crea un Headless Service db-headless y un StatefulSet db con 3 réplicas, imagen nginx:1.25.
6. Guarda el nombre del pod StatefulSet con índice 0 en /tmp/pod-cero.txt usando jsonpath.

Criterios de éxito:

```bash exec
kubectl get deployment api-gateway
cat /tmp/revisiones.txt
kubectl get daemonset log-agent
kubectl get statefulset db
cat /tmp/pod-cero.txt
```

```text output
NAME          READY   UP-TO-DATE   AVAILABLE
api-gateway   5/5     5            5

2

NAME        DESIRED   CURRENT   READY
log-agent   2         2         2

NAME   READY   AGE
db     3/3     1m

db-0
```

Solución de referencia, no mirar hasta terminar:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  replicas: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2
      maxUnavailable: 1
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
EOF

kubectl set image deployment/api-gateway nginx=nginx:1.26
kubectl rollout status deployment/api-gateway

kubectl rollout history deployment/api-gateway | grep -cE '^[0-9]+' > /tmp/revisiones.txt
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: log-agent
spec:
  selector:
    matchLabels:
      app: log-agent
  template:
    metadata:
      labels:
        app: log-agent
    spec:
      containers:
      - name: agent
        image: busybox
        command: ["sleep", "3600"]
EOF
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: db-headless
spec:
  clusterIP: None
  selector:
    app: db
  ports:
  - port: 80
EOF

kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
spec:
  serviceName: db-headless
  replicas: 3
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
      - name: db
        image: nginx:1.25
EOF

kubectl get pods -l app=db -o jsonpath='{.items[0].metadata.name}' > /tmp/pod-cero.txt
```

## 11. Troubleshooting - casos reales

### Caso 1: rollout estancado, no llega a successfully rolled out

**Síntoma:**

El comando `kubectl rollout status deployment/app` no termina nunca, o `kubectl get pods` muestra pods nuevos en 0/1 Ready de forma persistente. Si ya pasó el tiempo de `progressDeadlineSeconds`, 600 segundos por defecto, el Deployment marca su condición Progressing en False con razón ProgressDeadlineExceeded, aunque el controller sigue reintentando en el fondo sin hacer rollback automático.

Diagnóstico paso a paso:

```text reference
kubectl get pods -l app=<label>
```

Identificar los pods del ReplicaSet más nuevo, sustituye `<label>` por el selector real del Deployment.

```text reference
kubectl get deployment <nombre> -o jsonpath='{.status.conditions}'
```

Revisar si aparece type=Progressing, status=False, reason=ProgressDeadlineExceeded, sustituye `<nombre>` por el Deployment real.

El siguiente comando se ejecuta contra el pod nuevo que identificaste arriba:

```text reference
kubectl describe pod <pod-nuevo>
kubectl logs <pod-nuevo>
```

En describe, revisar Events al final: Readiness probe failed, Back-off restarting failed container, o ImagePullBackOff. En logs, descartar un crash de la aplicación misma.

Causas más comunes: readinessProbe apunta a un puerto o path incorrecto, la nueva imagen no existe o tiene un error de escritura, ImagePullBackOff, o la nueva versión de la app tarda más en arrancar que `initialDelaySeconds` del probe.

**Solución:**

Corregir el manifiesto y reaplicar, o revertir con `kubectl rollout undo deployment` seguido del nombre del Deployment. Recordar que el undo dispara un nuevo rollout, no un cambio instantáneo.

### Caso 2: DaemonSet no corre en el número esperado de nodos

**Síntoma:**

El comando `kubectl get daemonset` muestra un valor DESIRED menor al número total de nodos del cluster.

Diagnóstico paso a paso:

```bash exec
kubectl get nodes
kubectl get daemonset log-agent
```

Comparar DESIRED contra el total de nodos.

```bash exec
kubectl describe node cka-cp1 | grep Taints
```

```text output
Taints:  node-role.kubernetes.io/control-plane:NoSchedule
```

El siguiente comando se ejecuta contra el DaemonSet en cuestión, sustituye el nombre por el real:

```text reference
kubectl get pods -l app=<selector-del-daemonset> -o wide
kubectl get daemonset <nombre> -o jsonpath='{.spec.template.spec.tolerations}'
```

Confirmar qué nodos sí tienen el pod, y si el DaemonSet tiene la toleration correspondiente al taint detectado arriba.

Si el DaemonSet, a pesar de tener la toleration correcta, aún así no llega al DESIRED esperado, verificar también recursos disponibles en el nodo faltante, ya que desde 1.12 el scheduler evalúa requests:

```bash exec
kubectl describe node cka-cp1 | grep -A5 "Allocated resources"
```

**Solución:**

Si el DaemonSet debe correr también en nodos con taints, como kube-proxy o Calico, agregar la toleration correspondiente en el template del pod. Si el problema es falta de recursos asignables en ese nodo, reducir los requests del pod o liberar recursos. Si el DaemonSet no debe correr en el control plane, comportamiento esperado como en el ejemplo 7.2 inicial, DESIRED menor al total de nodos es correcto, no es un fallo.

### Caso 3: pods de un StatefulSet no llegan al número esperado

**Síntoma:**

El pod db-1 no aparece en absoluto en `kubectl get pods`, o aparece pero permanece en Pending mientras db-0 está Running normalmente. Son dos causas distintas y hay que distinguirlas antes de diagnosticar.

Diagnóstico paso a paso:

```bash exec
kubectl get pod db-0
kubectl get pods -l app=db
```

Caso A, db-1 no aparece en la lista en absoluto: significa que el StatefulSet controller aún no lo ha creado, porque con la política por defecto OrderedReady, db-0 debe estar Running y Ready primero. Revisar db-0:

```bash exec
kubectl describe pod db-0
```

Si db-0 nunca llega a Ready, ese es el problema real; db-1 no se creará hasta resolverlo. No es un fallo de db-1 en sí.

Caso B, db-1 sí aparece en la lista, en estado Pending, y db-0 está Ready: aquí sí es un problema de scheduling normal, independiente del orden del StatefulSet.

```bash exec
kubectl describe pod db-1
```

```text output
Events:
  Warning  FailedScheduling  0/3 nodes are available: insufficient cpu
```

O bien, un mensaje relacionado con almacenamiento:

```text output
Events:
  Warning  FailedScheduling  pod has unbound immediate PersistentVolumeClaims
```

Este último se resuelve en profundidad en el módulo de Storage. Si el mensaje menciona PVC, el siguiente comando se ejecuta sustituyendo el label real:

```text reference
kubectl get pvc -l app=<label>
```

STATUS Pending en el PVC indica que no hay StorageClass o PV disponible.

**Solución:**

Caso A: corregir por qué db-0 no llega a Ready, revisando imagen, probes, recursos; db-1 se creará automáticamente después. Caso B: si es recursos insuficientes, liberar recursos o reducir requests; si es PVC sin bind, revisar StorageClass más adelante en el curso.

## 12. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Los ejemplos de DaemonSet de este módulo dependen directamente de tener múltiples nodos reales, control plane más 2 workers, para observar el comportamiento de taints y tolerations con sentido.

**Alternativa K3s (plan B):** Deployment y StatefulSet funcionan idéntico. DaemonSet en K3s single-node pierde valor didáctico: con un único nodo, DESIRED siempre será 1, y no se puede observar la diferencia entre correr en workers y correr también en el control plane, porque K3s por defecto no aplica el taint de control-plane a su único nodo, a menos que se configure explícitamente con `--node-taint k3s-controlplane=true:NoExecute` al registrar el servidor. Este es el motivo principal por el que este módulo requiere el cluster kubeadm de 3 nodos como entorno principal.

Limpieza del módulo:

```bash exec
kubectl delete deployment web app-critica api-gateway
kubectl delete daemonset node-monitor log-agent
kubectl delete statefulset web-stateful db
kubectl delete service web-headless db-headless
kubectl delete pod dns-test
```

---

**Siguiente módulo:** M08 - Jobs, CronJobs y Gestión de Recursos