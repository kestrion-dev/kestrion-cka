---
code: M09
order: 9
slug: scheduling-avanzado-affinity-taints-priority
title: Scheduling avanzado — Affinity, Taints y PriorityClasses
description: Controla dónde se programan los pods con nodeSelector, node/pod affinity, taints y tolerations, y protege cargas críticas con PriorityClasses y preemption.
access: free
updated: "2026-11-09"
prerequisites: [arquitectura-kubernetes, workloads-deployments-daemonsets-statefulsets]
---

## 1. Resumen técnico

Este módulo cubre los mecanismos que controlan DÓNDE se programa un pod más allá del scheduling por defecto: nodeSelector y node affinity, el pod elige nodos, pod affinity y anti-affinity, el pod elige convivir o no con otros pods, taints y tolerations, el nodo rechaza pods salvo que los toleren explícitamente, y PriorityClasses, qué pods desalojan a otros cuando el cluster está lleno. Son los mecanismos que un SRE usa en producción para separar cargas críticas, distribuir réplicas entre zonas de fallo, y proteger nodos especializados.

## 2. Peso en el examen y preguntas típicas

Este módulo practica la competencia de admisión y scheduling de pods del dominio Workloads & Scheduling, que representa el 15% del examen junto con los temas de M07 y M08. Ese porcentaje corresponde al dominio completo, según el [temario oficial de CKA](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/). Las siguientes tareas son ejercicios de preparación alineados con esa competencia:

- Programa un pod únicamente en nodos con una label específica, usando nodeSelector.
- Configura un Deployment con node affinity requerida para excluir ciertos nodos.
- Configura pod anti-affinity para que las réplicas de un Deployment nunca compartan nodo.
- Aplica un taint a un nodo y verifica que los pods sin toleration correspondiente no se programan ahí.
- Un pod queda Pending indefinidamente por un taint, diagnostica y corrige.
- Crea una PriorityClass y demuestra que un pod de alta prioridad desaloja a uno de baja prioridad.

## 3. Prerrequisitos

De [M02 (Arquitectura)](/modulos/arquitectura-kubernetes/) usarás el rol del scheduler dentro del control plane: es el componente que lee estos mecanismos, afinidad, taints, prioridad, para decidir en qué nodo coloca cada pod.

De M07 (Workloads) ya usaste una toleration real, sin profundizar en ella: el DaemonSet de ese módulo necesitó tolerar el taint `node-role.kubernetes.io/control-plane:NoSchedule` para correr también en el control plane. Este módulo explica ese mecanismo desde cero.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Explicar la diferencia entre nodeSelector y node affinity, y cuándo cada uno es insuficiente.
2. Configurar node affinity con `requiredDuringSchedulingIgnoredDuringExecution` y con `preferredDuringSchedulingIgnoredDuringExecution`, y explicar la diferencia práctica entre ambas.
3. Configurar pod anti-affinity para distribuir réplicas entre nodos o zonas.
4. Explicar los tres efectos de un taint, NoSchedule, PreferNoSchedule, NoExecute, y cuándo usar cada uno.
5. Diagnosticar un pod Pending por falta de toleration, distinguiéndolo de un pod Pending por falta de recursos.
6. Explicar cómo una PriorityClass provoca la expulsión, preemption, de otro pod.

## 5. Explicación teórica progresiva

### 5.1 nodeSelector, el mecanismo más simple

Conexión con M02: el scheduler, en su fase de filtrado, descarta nodos que no cumplen ciertas condiciones antes de puntuar los que quedan. nodeSelector es la condición de filtrado más simple posible: un mapa de pares label-valor que el nodo DEBE tener, todos ellos, sin excepción.

Es un AND estricto entre todas las labels indicadas, y no admite operadores como existe o no está en esta lista. Para lógica más flexible existe node affinity, que se explica en 5.2.

### 5.2 Node affinity, selección flexible de nodos

Node affinity resuelve dos limitaciones de nodeSelector: la falta de operadores, In, NotIn, Exists, DoesNotExist, Gt, Lt, y la falta de una vía para expresar preferencias en lugar de requisitos estrictos.

#### El campo requiredDuringSchedulingIgnoredDuringExecution

Es un requisito DURO. El scheduler NUNCA coloca el pod en un nodo que no cumpla la condición. Si ningún nodo cumple, el pod queda Pending indefinidamente, igual que ocurriría con un nodeSelector no satisfecho.

#### El campo preferredDuringSchedulingIgnoredDuringExecution

Es una preferencia BLANDA. El scheduler intenta cumplirla, asignando un peso, weight, de 1 a 100, que suma puntos a los nodos que la cumplen durante la fase de puntuación. Si ningún nodo cumple esa preferencia, aún puede programar el pod en un nodo que satisfaga los requisitos obligatorios. Una preferencia no garantiza que haya un nodo elegible: los taints, la afinidad requerida o los requests pueden mantener el pod Pending.

El sufijo `IgnoredDuringExecution`, presente en ambos campos, significa que la afinidad SOLO se evalúa en el momento de programar el pod. Si las labels del nodo cambian DESPUÉS de que el pod ya está corriendo ahí, el pod NO se expulsa por eso; sigue corriendo en ese nodo aunque ya no cumpla la condición.

La estructura interna usa `nodeSelectorTerms`, una lista, con lógica OR entre términos, que a su vez contienen `matchExpressions`, una lista, con lógica AND entre expresiones dentro del mismo término. Esto permite expresar "nodo en la zona A con SSD, o nodo en la zona B con SSD", algo que nodeSelector no puede representar.

### 5.3 Pod affinity y anti-affinity, relaciones entre pods

Mientras node affinity relaciona un pod con propiedades de los NODOS, pod affinity y anti-affinity relacionan un pod con OTROS PODS que ya están corriendo en el cluster.

Pod affinity programa el pod CERCA de otros pods que cumplen un selector, útil para colocar un frontend junto a su caché, reduciendo latencia de red. Pod anti-affinity programa el pod LEJOS de otros pods que cumplen un selector, útil para distribuir réplicas de un mismo Deployment entre distintos nodos o zonas, evitando que todas caigan con un único fallo de hardware.

El campo `topologyKey` define qué significa cerca o lejos: es la clave de una label de NODO que agrupa nodos en un dominio de topología. Con `kubernetes.io/hostname`, el dominio es el nodo; con `topology.kubernetes.io/zone`, es la zona. Los nodos deben tener la label utilizada para que la distribución tenga el significado esperado.

En pod anti-affinity, una regla `requiredDuringSchedulingIgnoredDuringExecution` impide programar el nuevo pod en un dominio donde ya haya otro pod seleccionado por la regla. Por hostname, dos réplicas seleccionadas no pueden compartir nodo. Por zona, no pueden compartir zona, lo que también impide compartir nodo. Una regla `preferredDuringSchedulingIgnoredDuringExecution` solo favorece la separación y permite compartir dominio si otros criterios llevan al scheduler a elegirlo.

Para resolver una tarea CKA, identifica qué pods selecciona `labelSelector`, qué dominio define `topologyKey` y si la regla es required o preferred. El ejemplo 7.4 usa hostname para practicar la separación obligatoria entre nodos. Si se piden más réplicas que nodos elegibles, las restantes quedan Pending; con preferred, compartir nodo estaría permitido. Consulta la [referencia de affinity y anti-affinity](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#inter-pod-affinity-and-anti-affinity) para localizar estos campos durante la práctica.

### 5.4 Taints y tolerations, el mecanismo inverso

Node affinity y pod affinity son mecanismos que el POD usa para atraerse hacia ciertos nodos. Taints funciona al revés: es el NODO quien rechaza pods, y solo los pods con una toleration explícita pueden ignorar ese rechazo. Ya viste un caso real en M07 con el taint de control-plane.

Un taint tiene tres partes: clave, valor opcional, y efecto. El efecto determina qué le pasa a un pod sin toleration correspondiente.

#### El efecto NoSchedule

Bloquea la programación de NUEVOS pods sin toleration en ese nodo. Los pods que YA estaban corriendo ahí antes de aplicar el taint NO se ven afectados; siguen corriendo con normalidad.

#### El efecto PreferNoSchedule

Es la versión blanda de NoSchedule: el scheduler intenta evitar ese nodo para pods sin toleration, pero lo usará si es necesario, por ejemplo si no hay otro nodo disponible con capacidad suficiente.

#### El efecto NoExecute

Es el más agresivo: además de bloquear nuevos pods, EXPULSA a los pods que ya están corriendo en el nodo y no tienen una toleration para ese taint específico. Este efecto se dispara automáticamente cuando un nodo deja de responder: el control plane aplica los taints `node.kubernetes.io/not-ready` y `node.kubernetes.io/unreachable` con efecto NoExecute sobre el nodo problemático.

Por defecto, los pods reciben tolerations para `node.kubernetes.io/not-ready` y `node.kubernetes.io/unreachable`, con `tolerationSeconds: 300`, salvo que ya especifiquen otras para esas claves. El plazo se cuenta desde que se aplica el taint, no desde el instante exacto del fallo del nodo. Los DaemonSets reciben tolerations sin límite de tiempo para esas condiciones. Para diagnosticar una expulsión en CKA, consulta las tolerations reales del pod: el plazo puede ser distinto del valor por defecto. Si un controller gestiona el pod eliminado, creará su sustituto; un pod independiente no se recrea automáticamente.

Los operadores que usaremos son `Equal` y `Exists`. `Equal`, el valor por defecto, exige que coincidan clave y valor. `Exists` comprueba la clave sin exigir un valor; en ese caso se omite `value`. Si se especifica `effect`, también debe coincidir. Si se omite, la toleration acepta cualquier efecto de esa clave, tanto con Equal como con Exists.

Si un nodo tiene varios taints, el pod debe tolerar todos los que bloqueen su programación. Tolerar NoExecute no cubre un NoSchedule de la misma clave cuando la toleration especifica explícitamente el efecto. Esta comprobación es parte del diagnóstico de un pod Pending y se documenta en la [referencia de taints y tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/).

Una toleration nunca OBLIGA a un pod a ir a un nodo con taint; solo lo PERMITE. La decisión final de en qué nodo colocar el pod sigue dependiendo del resto de criterios de scheduling, incluida la afinidad si está configurada. Los DaemonSets de infraestructura crítica, como kube-proxy, además de tolerar los taints relevantes, suelen llevar una PriorityClass alta para minimizar el riesgo de quedar Pending bajo presión de recursos; PriorityClasses se profundiza en la sección 5.5 de este mismo módulo.

### 5.5 PriorityClasses y preemption

Retomando la sección 5.4: un DaemonSet crítico como kube-proxy puede quedar Pending por falta de recursos, ya que sus pods también pasan por el scheduler estándar. PriorityClass permite darles preferencia frente a cargas de menor prioridad.

Una PriorityClass es un objeto cluster-wide, no namespaced, que define un valor entero, `value`: a mayor número, mayor prioridad. Un pod referencia una PriorityClass por nombre en `spec.priorityClassName`. Si un pod no especifica ninguna, recibe prioridad 0, salvo que exista una PriorityClass marcada con `globalDefault: true`, en cuyo caso todos los pods sin prioridad explícita heredan ese valor.

Cuando un pod de alta prioridad no puede programarse por falta de recursos, el scheduler intenta la preemption: busca en algún nodo candidato uno o más pods de MENOR prioridad, los expulsa, delete, y programa ahí el pod de mayor prioridad. La preemption es el ÚLTIMO recurso: el scheduler primero intenta programar el pod normalmente en cualquier nodo con espacio libre; solo si eso falla en TODOS los nodos, evalúa expulsar pods de menor prioridad.

Para diagnosticar Pending, recuerda que la prioridad no evita un taint ni una node affinity requerida. La preemption solo ayuda si retirar pods de menor prioridad permite cumplir las restricciones. No exige que el pod tenga una PriorityClass explícita: también cuenta su prioridad por defecto. Una clase con `preemptionPolicy: Never` conserva la prioridad en la cola, pero no permite desalojar otros pods.

## 6. Diagrama ASCII - decisión del scheduler con afinidad, taints y prioridad

```text reference
Pod nuevo llega al scheduler
       |
       v
+---------------------------------------------+
| FASE DE FILTRADO (descarta nodos invalidos)  |
|                                              |
|  Por cada nodo candidato:                   |
|    1. Tiene el nodo un taint NoSchedule      |
|       o NoExecute que el pod NO tolera?      |
|       SI -> nodo DESCARTADO                  |
|    2. Cumple nodeSelector / node affinity    |
|       required?                              |
|       NO -> nodo DESCARTADO                  |
|    3. Cumple pod affinity / anti-affinity    |
|       required                              |
|       (con otros pods ya corriendo)?         |
|       NO -> nodo DESCARTADO                  |
|    4. Tiene recursos allocatable             |
|       suficientes para los requests?         |
|       NO -> nodo DESCARTADO                  |
|                                              |
|  Si NINGUN nodo sobrevive el filtrado:       |
|    si la politica permite preemption:        |
|    evaluar retirar pods de menor prioridad   |
|    solo si eso permite programar el pod      |
|    si aun asi no hay nodo -> pod Pending     |
+-------------------|--------------------------+
                     v
+---------------------------------------------+
| FASE DE PUNTUACION (entre nodos que pasaron) |
|                                              |
|  Suma de puntos por:                        |
|    - preferredDuringScheduling (node)        |
|    - preferredDuringScheduling (pod)         |
|    - PreferNoSchedule evitado                |
|    - balance de recursos, entre otros        |
+-------------------|--------------------------+
                     v
        Nodo con mayor puntuacion
        gana el bind del pod
```

## 7. Ejemplos prácticos desplegables

### 7.1 nodeSelector

Etiquetar un nodo worker:

```bash exec
kubectl label node cka-worker1 disco=ssd
kubectl get nodes --show-labels | grep cka-worker1
```

```text output
node/cka-worker1 labeled

cka-worker1   Ready   <none>   ...   disco=ssd,kubernetes.io/hostname=cka-worker1,...
```

Pod que exige esa label:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-con-selector
spec:
  nodeSelector:
    disco: ssd
  containers:
  - name: app
    image: nginx:1.25
EOF
```

```bash exec
kubectl get pod pod-con-selector -o wide
```

```text output
NAME                READY   STATUS    NODE
pod-con-selector    1/1     Running   cka-worker1
```

### 7.2 Node affinity required

```bash exec
kubectl label node cka-worker2 disco=hdd
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-affinity-required
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
  containers:
  - name: app
    image: nginx:1.25
EOF
```

```bash exec
kubectl get pod pod-affinity-required -o wide
```

```text output
NAME                     READY   STATUS    NODE
pod-affinity-required    1/1     Running   cka-worker1
```

Confirmar que la condición es dura, apuntando a un valor que ningún nodo tiene:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-affinity-imposible
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions:
          - key: disco
            operator: In
            values:
            - nvme
  containers:
  - name: app
    image: nginx:1.25
EOF
```

```bash exec
kubectl get pod pod-affinity-imposible
```

```text output
NAME                        READY   STATUS    RESTARTS
pod-affinity-imposible      0/1     Pending   0
```

### 7.3 Node affinity preferred

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-affinity-preferred
spec:
  affinity:
    nodeAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 80
        preference:
          matchExpressions:
          - key: disco
            operator: In
            values:
            - nvme
  containers:
  - name: app
    image: nginx:1.25
EOF
```

```bash exec
kubectl get pod pod-affinity-preferred -o wide
```

```text output
NAME                       READY   STATUS    NODE
pod-affinity-preferred     1/1     Running   cka-worker1
```

Ningún nodo tiene `disco=nvme`, pero esa preferencia no bloquea la programación. Si existe un nodo que cumpla las restricciones obligatorias, el scheduler lo elige según el resto de criterios. La salida muestra un resultado posible; también puede elegir cka-worker2.

### 7.4 Pod anti-affinity, distribuir réplicas entre nodos

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-distribuido
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web-distribuido
  template:
    metadata:
      labels:
        app: web-distribuido
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: web-distribuido
            topologyKey: kubernetes.io/hostname
      containers:
      - name: web
        image: nginx:1.25
EOF
```

```bash exec
kubectl get pods -l app=web-distribuido -o wide
```

```text output
NAME                                READY   STATUS    NODE
web-distribuido-6b8f9c7d5f-4kxlq    1/1     Running   cka-worker1
web-distribuido-6b8f9c7d5f-9p2wr    1/1     Running   cka-worker2
```

Cada réplica cayó en un nodo distinto. Con solo 2 workers disponibles, escalar a una tercera réplica queda Pending, porque ya no hay un tercer nodo libre que satisfaga la anti-afinidad:

```bash exec
kubectl scale deployment web-distribuido --replicas=3
kubectl get pods -l app=web-distribuido
```

```text output
NAME                                READY   STATUS
web-distribuido-6b8f9c7d5f-4kxlq    1/1     Running
web-distribuido-6b8f9c7d5f-9p2wr    1/1     Running
web-distribuido-6b8f9c7d5f-k7zxq    0/1     Pending
```

### 7.5 Taints y tolerations

Aplicar un taint NoSchedule a un worker:

```bash exec
kubectl taint node cka-worker2 equipo=facturacion:NoSchedule
```

Pod sin toleration, para confirmar que es rechazado:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-sin-toleration
spec:
  nodeSelector:
    kubernetes.io/hostname: cka-worker2
  containers:
  - name: app
    image: nginx:1.25
EOF
```

```bash exec
kubectl get pod pod-sin-toleration
```

```text output
NAME                    READY   STATUS    RESTARTS
pod-sin-toleration      0/1     Pending   0
```

El pod fija explícitamente `nodeSelector` hacia cka-worker2, pero el taint lo bloquea igualmente: taints y afinidad son mecanismos independientes, la afinidad no otorga inmunidad frente a un taint.

Pod con la toleration correcta:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-con-toleration
spec:
  nodeSelector:
    kubernetes.io/hostname: cka-worker2
  tolerations:
  - key: equipo
    operator: Equal
    value: facturacion
    effect: NoSchedule
  containers:
  - name: app
    image: nginx:1.25
EOF
```

```bash exec
kubectl get pod pod-con-toleration -o wide
```

```text output
NAME                    READY   STATUS    NODE
pod-con-toleration      1/1     Running   cka-worker2
```

### 7.6 NoExecute con tolerationSeconds

```bash exec
kubectl taint node cka-worker2 equipo=facturacion:NoExecute
```

El pod `pod-con-toleration` del ejemplo anterior no tolera NoExecute, solo tolera NoSchedule, así que es expulsado de inmediato:

```bash exec
kubectl get pod pod-con-toleration -o wide
```

```text output
NAME                    READY   STATUS        NODE
pod-con-toleration      0/1     Terminating   cka-worker2
```

El taint NoSchedule de 7.5 sigue en cka-worker2: añadir NoExecute no lo reemplaza. El siguiente pod tolera ambos efectos y limita a 60 segundos únicamente la tolerancia a NoExecute. Si faltara la toleration de NoSchedule, quedaría Pending y no podrías observar la expulsión temporal.

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-tolerancia-temporal
spec:
  nodeSelector:
    kubernetes.io/hostname: cka-worker2
  tolerations:
  - key: equipo
    operator: Equal
    value: facturacion
    effect: NoSchedule
  - key: equipo
    operator: Equal
    value: facturacion
    effect: NoExecute
    tolerationSeconds: 60
  containers:
  - name: app
    image: nginx:1.25
EOF
```

```bash exec
kubectl get pod pod-tolerancia-temporal -w
```

Tras asignarse al nodo, el pod puede llegar a Running y será eliminado al agotarse la tolerancia de 60 segundos a NoExecute. El plazo no comienza al arrancar nginx. Este pod es independiente, así que no se recreará en otro nodo. Ctrl+C para salir del watch cuando termine.

Limpiar el taint antes de continuar con el resto del módulo:

```bash exec
kubectl taint node cka-worker2 equipo=facturacion:NoExecute-
```

### 7.7 PriorityClass y preemption

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: prioridad-alta
value: 1000000
globalDefault: false
description: "Cargas criticas que pueden desalojar a otras"
EOF
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: prioridad-baja
value: 100
globalDefault: false
description: "Cargas tolerantes a ser desalojadas"
EOF
```

Llenar el nodo cka-worker1 con pods de baja prioridad que agotan sus recursos asignables, ajustar el requests de memoria según la capacidad real de tu VM, verificable con `kubectl describe node cka-worker1 | grep -A5 Allocatable`:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: relleno-baja-prioridad
spec:
  replicas: 4
  selector:
    matchLabels:
      app: relleno
  template:
    metadata:
      labels:
        app: relleno
    spec:
      priorityClassName: prioridad-baja
      nodeSelector:
        kubernetes.io/hostname: cka-worker1
      containers:
      - name: relleno
        image: nginx:1.25
        resources:
          requests:
            memory: 300Mi
EOF
```

```bash exec
kubectl get pods -l app=relleno -o wide
```

Ahora lanzar un pod de alta prioridad que no cabe sin expulsar a alguno de los de baja prioridad:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-critico
spec:
  priorityClassName: prioridad-alta
  nodeSelector:
    kubernetes.io/hostname: cka-worker1
  containers:
  - name: critico
    image: nginx:1.25
    resources:
      requests:
        memory: 300Mi
EOF
```

```bash exec
kubectl get pod pod-critico -o wide
kubectl get pods -l app=relleno
```

```text output
NAME           READY   STATUS    NODE
pod-critico    1/1     Running   cka-worker1

NAME                                       READY   STATUS
relleno-baja-prioridad-6f9c8d-4kxlq        1/1     Running
relleno-baja-prioridad-6f9c8d-9p2wr        1/1     Running
relleno-baja-prioridad-6f9c8d-k7zxq        1/1     Running
```

Uno de los cuatro pods de relleno fue expulsado, preemption, para hacer espacio a `pod-critico`. El Deployment `relleno-baja-prioridad` intentará recrear el pod perdido, y si el nodo sigue sin espacio, ese pod nuevo quedará Pending, no volverá a desalojar a `pod-critico` porque tiene menor prioridad.

### 7.8 Limpieza de los ejemplos prácticos

Completa estos pasos antes de empezar el laboratorio 8, en el mismo contexto y namespace donde ejecutaste los ejemplos. Así liberas los recursos reservados y retiras las condiciones de scheduling que añadiste a los workers.

Primero, elimina los Deployments y espera a que desaparezcan sus pods; después elimina los pods independientes y las PriorityClasses de los ejemplos:

```bash exec
kubectl delete deployment web-distribuido relleno-baja-prioridad \
  --ignore-not-found=true --cascade=foreground --wait=true

kubectl delete pod pod-con-selector pod-affinity-required \
  pod-affinity-imposible pod-affinity-preferred \
  pod-sin-toleration pod-con-toleration \
  pod-tolerancia-temporal pod-critico --ignore-not-found=true

kubectl delete priorityclass prioridad-alta prioridad-baja --ignore-not-found=true
```

`--ignore-not-found=true` permite continuar si algún pod ya fue eliminado por preemption o NoExecute. Eliminar primero los Deployments evita que vuelvan a crear los pods que estás retirando.

Retira las labels de disco y todos los efectos del taint equipo de los ejemplos:

```bash exec
kubectl label node cka-worker1 disco-
kubectl label node cka-worker2 disco-
kubectl taint node cka-worker2 equipo-
```

Comprueba el resultado antes de continuar:

```bash exec
kubectl get pods,deployments
kubectl get priorityclass prioridad-alta prioridad-baja --ignore-not-found=true
kubectl get nodes cka-worker1 cka-worker2 \
  -o custom-columns='NODO:.metadata.name,DISCO:.metadata.labels.disco,TAINTS:.spec.taints'
```

No deben quedar pods ni Deployments de estos ejemplos, ni las dos PriorityClasses. La columna DISCO debe mostrar `<none>` en ambos workers y sus taints no deben incluir equipo. Con eso, puedes empezar el laboratorio 8.

## 8. Laboratorio guiado

Objetivo: diagnosticar un pod Pending al combinar una node affinity requerida con un taint no tolerado. Practicarás la secuencia útil para CKA: leer Events, contrastar afinidad y taints, aplicar una corrección y comprobar la asignación.

Paso 1, aplicar un taint a cka-worker1 y crear un pod cuya afinidad solo permita ese nodo:

```bash exec
kubectl taint node cka-worker1 mantenimiento=true:NoSchedule
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-diagnostico
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions:
          - key: kubernetes.io/hostname
            operator: In
            values:
            - cka-worker1
  containers:
  - name: app
    image: nginx:1.25
EOF
```

Paso 2, observar el síntoma:

```bash exec
kubectl get pod pod-diagnostico
```

```text output
NAME               READY   STATUS    RESTARTS
pod-diagnostico    0/1     Pending   0
```

Paso 3, contrastar el motivo de scheduling con la configuración real:

```bash exec
kubectl describe pod pod-diagnostico
kubectl get nodes -L kubernetes.io/hostname
kubectl get node cka-worker1 -o jsonpath='{.spec.taints}{"\n"}'
```

En Events aparecerá FailedScheduling. Este es un fragmento orientativo del motivo relevante; los recuentos y las demás razones dependen del estado del cluster:

```text output
1 node(s) had untolerated taint {mantenimiento: true}
```

La afinidad excluye cka-worker2 y cka-cp1. cka-worker1 cumple la afinidad, pero su taint mantenimiento bloquea el pod. Events agrupa motivos y cantidades; no identifica necesariamente qué nodo corresponde a cada motivo. Por eso contrastamos el mensaje con las labels y los taints reales.

Paso 4, añadir la toleration que falta conservando las existentes:

```bash exec
kubectl get pod pod-diagnostico -o jsonpath='{.spec.tolerations}{"\n"}'
kubectl patch pod pod-diagnostico --type=json -p='[{"op":"add","path":"/spec/tolerations/-","value":{"key":"mantenimiento","operator":"Equal","value":"true","effect":"NoSchedule"}}]'
```

Kubernetes permite añadir tolerations a un pod existente, pero no eliminar ni modificar las que ya tiene. En este cluster kubeadm, la admisión añade tolerations por defecto y la lista ya existe. El sufijo `/-` agrega una entrada al final. Usar `/spec/tolerations` con una lista nueva sustituiría la lista completa y sería rechazado si elimina las entradas anteriores. Si la lista no existiera, se crearía con `/spec/tolerations` y una lista que contenga la nueva toleration.

Para CKA, añadir una toleration puede resolver el bloqueo sin recrear el pod. Si necesitas cambiar una toleration existente, prepara el manifiesto corregido y recrea el pod; si lo gestiona un Deployment, modifica `spec.template.spec.tolerations` para que sus réplicas nuevas reciban la configuración. La [referencia de actualización de pods](https://kubernetes.io/docs/concepts/workloads/pods/#pod-update-and-replacement) recoge qué cambios admite la API.

Paso 5, verificar la recuperación:

```bash exec
kubectl wait --for=condition=PodScheduled pod/pod-diagnostico --timeout=60s
kubectl get pod pod-diagnostico -o wide
```

```text output
NAME               READY   STATUS    NODE
pod-diagnostico    1/1     Running   cka-worker1
```

Paso 6, limpiar el taint de mantenimiento:

```bash exec
kubectl taint node cka-worker1 mantenimiento=true:NoSchedule-
```

## 9. Checkpoint

**Pregunta 1**

¿Qué diferencia práctica hay entre `requiredDuringSchedulingIgnoredDuringExecution` y `preferredDuringSchedulingIgnoredDuringExecution` en node affinity?

Respuesta: required es un requisito duro; si ningún nodo lo cumple, el pod queda Pending. Preferred aporta un peso a la puntuación de nodos, pero incumplir esa preferencia no bloquea la programación. El pod sigue necesitando un nodo que cumpla los demás requisitos, como recursos suficientes y taints tolerados.

**Pregunta 2**

Un Deployment usa pod anti-affinity required con `topologyKey: kubernetes.io/hostname` y un selector que incluye todas sus réplicas. Hay dos nodos elegibles y se piden tres réplicas. ¿Qué ocurre? ¿Qué cambiaría con preferred?

Respuesta: con required, solo pueden programarse dos réplicas, una por nodo, y la tercera queda Pending. Con preferred, la separación es una preferencia y la tercera puede compartir nodo si se cumplen los demás requisitos. El topologyKey define el dominio donde se evalúa la separación: si fuera una regla requerida por zona, tampoco podrían compartir nodo, porque compartirían la misma zona.

**Pregunta 3**

¿Qué diferencia hay entre los efectos NoSchedule y NoExecute de un taint?

Respuesta: NoSchedule solo bloquea la programación de pods NUEVOS sin toleration; los pods que ya estaban corriendo en el nodo no se ven afectados. NoExecute además EXPULSA a los pods que ya están corriendo y no tienen toleration para ese taint específico.

**Pregunta 4**

Un pod de un Deployment tiene una toleration con `tolerationSeconds: 300` para `node.kubernetes.io/unreachable:NoExecute`. Si se aplica ese taint y no se retira, ¿qué ocurre?

Respuesta: el pod tolera ese taint durante 300 segundos desde su aplicación; al agotarse el plazo, puede ser eliminado y el Deployment creará un sustituto. Ese plazo no mide el tiempo total desde el fallo del nodo ni garantiza cuándo estará Running el nuevo pod. Comprueba siempre las tolerations reales: un DaemonSet, por ejemplo, recibe tolerations sin límite para unreachable y not-ready.

**Pregunta 5**

¿Cuándo actúa el scheduler mediante preemption, expulsando pods de menor prioridad?

Respuesta: únicamente como último recurso, después de que el scheduler intentó programar el pod de mayor prioridad normalmente en cualquier nodo con espacio libre. Solo si eso falla en todos los nodos candidatos, evalúa expulsar pods de menor prioridad para liberar espacio.

## 10. Laboratorio cronometrado

Objetivo: completar en menos de 15 minutos.

Tarea:

1. Etiqueta cka-worker2 con `entorno=critico`.
2. Crea un pod pod-critico-zona con node affinity requerida hacia nodos con `entorno=critico`.
3. Aplica un taint NoSchedule a cka-worker1 con clave `reservado` y valor `equipo-datos`.
4. Crea un pod pod-con-tolerancia con nodeSelector hacia cka-worker1 y la toleration correspondiente al taint del paso 3.
5. Crea dos PriorityClasses: alta-prioridad, value 900000, y baja-prioridad, value 200.
6. Guarda el nodo donde terminó corriendo pod-critico-zona en /tmp/nodo-critico.txt usando jsonpath.

Criterios de éxito:

```bash exec
cat /tmp/nodo-critico.txt
kubectl get pod pod-con-tolerancia -o wide
kubectl get priorityclass alta-prioridad baja-prioridad
```

```text output
cka-worker2

NAME                   READY   STATUS    NODE
pod-con-tolerancia     1/1     Running   cka-worker1

NAME              VALUE
alta-prioridad    900000
baja-prioridad    200
```

Solución de referencia, no mirar hasta terminar:

```bash exec
kubectl label node cka-worker2 entorno=critico

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-critico-zona
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions:
          - key: entorno
            operator: In
            values:
            - critico
  containers:
  - name: app
    image: nginx:1.25
EOF

kubectl taint node cka-worker1 reservado=equipo-datos:NoSchedule

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-con-tolerancia
spec:
  nodeSelector:
    kubernetes.io/hostname: cka-worker1
  tolerations:
  - key: reservado
    operator: Equal
    value: equipo-datos
    effect: NoSchedule
  containers:
  - name: app
    image: nginx:1.25
EOF

kubectl apply -f - <<'EOF'
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: alta-prioridad
value: 900000
globalDefault: false
EOF

kubectl apply -f - <<'EOF'
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: baja-prioridad
value: 200
globalDefault: false
EOF

kubectl get pod pod-critico-zona -o jsonpath='{.spec.nodeName}' > /tmp/nodo-critico.txt
```

## 11. Troubleshooting - casos reales

### Caso 1: pod Pending sin razón evidente por labels

**Síntoma:**

El comando `kubectl get pod` muestra el pod en estado Pending y no hay ningún indicio inmediato de por qué.

Diagnóstico paso a paso:

```bash exec
kubectl describe pod pod-diagnostico
```

Revisar Events al final: FailedScheduling agrupa los motivos que impiden programar el pod, como taints no tolerados, afinidad no cumplida o recursos insuficientes. Usa esos motivos para decidir qué revisar; el mensaje no es una relación detallada de cada nodo con su causa.

Si el mensaje menciona un taint no tolerado, listar los taints del nodo candidato, por ejemplo cka-worker1:

```bash exec
kubectl describe node cka-worker1 | grep Taints
```

Si el mensaje menciona afinidad no satisfecha, comparar el spec de afinidad del pod contra las labels reales del nodo candidato:

```bash exec
kubectl get pod pod-diagnostico -o jsonpath='{.spec.affinity}'
kubectl get nodes --show-labels
```

**Solución:**

Corregir la causa confirmada al contrastar Events con la configuración: añadir la toleration que pide la tarea, corregir la afinidad o las labels, o revisar los requests y los recursos disponibles. Después, comprobar que el pod ha sido asignado a un nodo y que llega al estado esperado.

### Caso 2: un patch de tolerations es rechazado

**Síntoma:**

Se intenta añadir una toleration a un pod existente, pero la API rechaza el cambio. Añadir entradas está permitido; sustituir la lista puede eliminar tolerations anteriores y causar el rechazo.

Diagnóstico paso a paso:

```bash exec
kubectl get pod pod-diagnostico -o jsonpath='{.spec.tolerations}{"\n"}'
```

Compara la lista existente con el cambio que intentaste aplicar. Un JSON Patch con `add` sobre `/spec/tolerations` sustituye esa propiedad si ya existe; no añade automáticamente un elemento. También debes conservar las tolerations que Kubernetes incorporó al crear el pod. Para añadir una entrada a una lista existente, usa `/spec/tolerations/-`, como en el laboratorio guiado.

**Solución:**

Añadir la nueva toleration conservando todas las anteriores. Si la tarea requiere modificar o retirar una existente, recrear el pod con el manifiesto corregido. Para un Deployment, corregir `spec.template.spec.tolerations` y verificar su rollout. Si el cambio se acepta pero el pod sigue Pending, volver a Events: puede quedar otro taint sin tolerar, una afinidad no satisfecha o falta de recursos.

### Caso 3: preemption inesperada de una carga que se creía protegida

**Síntoma:**

Un pod de producción sin `priorityClassName` explícito es expulsado inesperadamente cuando se despliega otra carga nueva en el cluster.

Diagnóstico paso a paso:

```bash exec
kubectl get pod pod-produccion -o jsonpath='{.spec.priority}'
```

Confirmar el valor de prioridad efectivo del pod expulsado.

```bash exec
kubectl get priorityclass
```

Revisar si alguna PriorityClass tiene `globalDefault: true`, y con qué valor. Sin una clase por defecto, los pods nuevos sin priorityClassName reciben prioridad 0. Ese valor no es el mínimo: también existen prioridades negativas. Un pod de prioridad 0 puede ser candidato a preemption frente a otro de prioridad mayor si desalojarlo permite programar al que espera; no implica que siempre vaya a ser la primera víctima.

```bash exec
kubectl get events --field-selector reason=Preempted
```

Confirmar que el evento de expulsión efectivamente fue preemption y no otra causa, como OOMKilled o Evicted por presión de nodo.

**Solución:**

Asignar explícitamente una PriorityClass apropiada a las cargas de producción que deben estar protegidas frente a preemption, en lugar de depender del valor por defecto 0. Si existe una PriorityClass con globalDefault, revisar si es la esperada para este tipo de carga.

## 12. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Los ejemplos de anti-affinity, taints y preemption de este módulo dependen directamente de tener múltiples nodos reales para observar distribución y desalojo con sentido.

**Alternativa K3s (plan B):** nodeSelector, node affinity, pod affinity/anti-affinity, taints, tolerations y PriorityClasses son parte de la API estándar de Kubernetes y funcionan de forma idéntica en K3s. La limitación es la misma que en módulos anteriores: con un único nodo, no hay forma de observar distribución entre nodos, anti-affinity, topologyKey, ni desalojo real por taints entre nodos distintos, ya que solo existe un nodo candidato en todo momento.

### Limpieza final del módulo

Antes de pasar a M10, elimina todos los recursos creados en M09, en el mismo contexto y namespace donde practicaste. Esta limpieza incluye los ejemplos del punto 7 y los laboratorios posteriores; puedes ejecutarla aunque ya hayas completado la limpieza intermedia.

Elimina primero los Deployments y sus pods, y después los pods independientes y las PriorityClasses:

```bash exec
kubectl delete deployment web-distribuido relleno-baja-prioridad \
  --ignore-not-found=true --cascade=foreground --wait=true

kubectl delete pod pod-con-selector pod-affinity-required \
  pod-affinity-imposible pod-affinity-preferred \
  pod-sin-toleration pod-con-toleration pod-tolerancia-temporal \
  pod-critico pod-diagnostico pod-con-tolerancia pod-critico-zona \
  --ignore-not-found=true

kubectl delete priorityclass prioridad-alta prioridad-baja \
  alta-prioridad baja-prioridad --ignore-not-found=true
```

Retira las labels y los taints añadidos durante el módulo y elimina el archivo del laboratorio cronometrado:

```bash exec
kubectl label node cka-worker1 disco-
kubectl label node cka-worker2 disco- entorno-
kubectl taint node cka-worker1 mantenimiento-
kubectl taint node cka-worker1 reservado-
kubectl taint node cka-worker2 equipo-
rm -f /tmp/nodo-critico.txt
```

Si una label o un taint ya se retiró, kubectl puede indicar que no existe. Continúa con la comprobación final:

```bash exec
kubectl get pods,deployments
kubectl get priorityclass prioridad-alta prioridad-baja \
  alta-prioridad baja-prioridad --ignore-not-found=true
kubectl get nodes cka-worker1 cka-worker2 \
  -o custom-columns='NODO:.metadata.name,DISCO:.metadata.labels.disco,ENTORNO:.metadata.labels.entorno,TAINTS:.spec.taints'
```

No deben quedar pods ni Deployments de M09, ni ninguna de sus cuatro PriorityClasses. Las labels disco y entorno usadas en los ejemplos deben haber desaparecido; los taints de los workers no deben incluir mantenimiento, reservado ni equipo. Los demás recursos y condiciones previos del cluster pueden seguir presentes. El entorno queda listo para M10.

---

**Siguiente módulo:** M10 - Services y kube-proxy
