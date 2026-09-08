# M09 - Scheduling Avanzado: Affinity, Taints y Tolerations, PriorityClasses

## 1. Resumen técnico

Este módulo cubre los mecanismos que controlan DÓNDE se programa un pod más allá del scheduling por defecto: nodeSelector y node affinity, el pod elige nodos, pod affinity y anti-affinity, el pod elige convivir o no con otros pods, taints y tolerations, el nodo rechaza pods salvo que los toleren explícitamente, y PriorityClasses, qué pods desalojan a otros cuando el cluster está lleno. Son los mecanismos que un SRE usa en producción para separar cargas críticas, distribuir réplicas entre zonas de fallo, y proteger nodos especializados.

## 2. Peso en el examen y preguntas típicas

15% del examen, dominio Workloads & Scheduling. Preguntas típicas:

- Programa un pod únicamente en nodos con una label específica, usando nodeSelector.
- Configura un Deployment con node affinity requerida para excluir ciertos nodos.
- Configura pod anti-affinity para que las réplicas de un Deployment nunca compartan nodo.
- Aplica un taint a un nodo y verifica que los pods sin toleration correspondiente no se programan ahí.
- Un pod queda Pending indefinidamente por un taint, diagnostica y corrige.
- Crea una PriorityClass y demuestra que un pod de alta prioridad desaloja a uno de baja prioridad.

## 3. Prerrequisitos

De M02 (Arquitectura) usarás el rol del scheduler dentro del control plane: es el componente que lee estos mecanismos, afinidad, taints, prioridad, para decidir en qué nodo coloca cada pod.

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

Es una preferencia BLANDA. El scheduler intenta cumplirla, asignando un peso, weight, de 1 a 100, que suma puntos a los nodos que la cumplen durante la fase de puntuación, pero si ningún nodo la cumple, el pod se programa igualmente en el mejor nodo disponible según el resto de criterios.

El sufijo `IgnoredDuringExecution`, presente en ambos campos, significa que la afinidad SOLO se evalúa en el momento de programar el pod. Si las labels del nodo cambian DESPUÉS de que el pod ya está corriendo ahí, el pod NO se expulsa por eso; sigue corriendo en ese nodo aunque ya no cumpla la condición.

La estructura interna usa `nodeSelectorTerms`, una lista, con lógica OR entre términos, que a su vez contienen `matchExpressions`, una lista, con lógica AND entre expresiones dentro del mismo término. Esto permite expresar "nodo en la zona A con SSD, o nodo en la zona B con SSD", algo que nodeSelector no puede representar.

### 5.3 Pod affinity y anti-affinity, relaciones entre pods

Mientras node affinity relaciona un pod con propiedades de los NODOS, pod affinity y anti-affinity relacionan un pod con OTROS PODS que ya están corriendo en el cluster.

Pod affinity programa el pod CERCA de otros pods que cumplen un selector, útil para colocar un frontend junto a su caché, reduciendo latencia de red. Pod anti-affinity programa el pod LEJOS de otros pods que cumplen un selector, útil para distribuir réplicas de un mismo Deployment entre distintos nodos o zonas, evitando que todas caigan con un único fallo de hardware.

El campo `topologyKey` es la pieza que define qué significa cerca o lejos. No es una distancia física: es el nombre de una label de NODO que agrupa nodos en un mismo dominio de topología. Con `topologyKey: kubernetes.io/hostname`, cada nodo es su propio dominio, así que anti-affinity con esa clave significa nunca dos pods en el mismo nodo. Con `topologyKey: topology.kubernetes.io/zone`, el dominio es la zona completa, así que anti-affinity significa nunca dos pods en la misma zona, permitiendo que convivan varios pods en el mismo nodo mientras estén en zonas distintas de otros.

Al igual que node affinity, pod affinity y anti-affinity soportan las variantes required y preferred, con el mismo significado duro/blando visto en 5.2.

### 5.4 Taints y tolerations, el mecanismo inverso

Node affinity y pod affinity son mecanismos que el POD usa para atraerse hacia ciertos nodos. Taints funciona al revés: es el NODO quien rechaza pods, y solo los pods con una toleration explícita pueden ignorar ese rechazo. Ya viste un caso real en M07 con el taint de control-plane.

Un taint tiene tres partes: clave, valor opcional, y efecto. El efecto determina qué le pasa a un pod sin toleration correspondiente.

#### El efecto NoSchedule

Bloquea la programación de NUEVOS pods sin toleration en ese nodo. Los pods que YA estaban corriendo ahí antes de aplicar el taint NO se ven afectados; siguen corriendo con normalidad.

#### El efecto PreferNoSchedule

Es la versión blanda de NoSchedule: el scheduler intenta evitar ese nodo para pods sin toleration, pero lo usará si es necesario, por ejemplo si no hay otro nodo disponible con capacidad suficiente.

#### El efecto NoExecute

Es el más agresivo: además de bloquear nuevos pods, EXPULSA a los pods que ya están corriendo en el nodo y no tienen una toleration para ese taint específico. Este efecto se dispara automáticamente cuando un nodo deja de responder: el control plane aplica los taints `node.kubernetes.io/not-ready` y `node.kubernetes.io/unreachable` con efecto NoExecute sobre el nodo problemático.

Por defecto, todo pod recibe automáticamente, vía un admission controller llamado DefaultTolerationSeconds, una toleration implícita para esos dos taints, con `tolerationSeconds: 300`. Esto explica un comportamiento que suele sorprender en producción: cuando un nodo se cae, los pods que corrían ahí NO se reprograman de inmediato en otro nodo; el control plane espera 300 segundos, 5 minutos, antes de darlos por perdidos y expulsarlos, dando tiempo a que el nodo se recupere de un fallo transitorio de red sin causar una migración masiva innecesaria.

Las tolerations tienen dos operadores. `Equal` exige que la toleration especifique clave, valor Y efecto, y coincidan exactamente con el taint. `Exists` solo exige que coincida la clave, ignorando el valor; si además se omite el campo `effect`, la toleration coincide con CUALQUIER efecto de esa clave, sea NoSchedule, PreferNoSchedule o NoExecute.

Una toleration nunca OBLIGA a un pod a ir a un nodo con taint; solo lo PERMITE. La decisión final de en qué nodo colocar el pod sigue dependiendo del resto de criterios de scheduling, incluida la afinidad si está configurada. Los DaemonSets de infraestructura crítica, como kube-proxy, además de tolerar los taints relevantes, suelen llevar una PriorityClass alta para minimizar el riesgo de quedar Pending bajo presión de recursos; PriorityClasses se profundiza en la sección 5.5 de este mismo módulo.

### 5.5 PriorityClasses y preemption

Retomando la sección 5.3: viste que un DaemonSet crítico como kube-proxy puede quedar Pending por falta de recursos exactamente igual que cualquier otro pod, ya que desde la versión 1.12 de Kubernetes pasa por el scheduler estándar. PriorityClass es el mecanismo que protege a esas cargas críticas frente a ese riesgo.

Una PriorityClass es un objeto cluster-wide, no namespaced, que define un valor entero, `value`: a mayor número, mayor prioridad. Un pod referencia una PriorityClass por nombre en `spec.priorityClassName`. Si un pod no especifica ninguna, recibe prioridad 0, salvo que exista una PriorityClass marcada con `globalDefault: true`, en cuyo caso todos los pods sin prioridad explícita heredan ese valor.

Cuando un pod de alta prioridad no puede programarse por falta de recursos, el scheduler intenta la preemption: busca en algún nodo candidato uno o más pods de MENOR prioridad, los expulsa, delete, y programa ahí el pod de mayor prioridad. La preemption es el ÚLTIMO recurso: el scheduler primero intenta programar el pod normalmente en cualquier nodo con espacio libre; solo si eso falla en TODOS los nodos, evalúa expulsar pods de menor prioridad.

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
|    3. Cumple pod affinity required           |
|       (con otros pods ya corriendo)?         |
|       NO -> nodo DESCARTADO                  |
|    4. Tiene recursos allocatable             |
|       suficientes para los requests?         |
|       NO -> nodo DESCARTADO                  |
|                                              |
|  Si NINGUN nodo sobrevive el filtrado:       |
|    hay PriorityClass? -> intentar preemption |
|    (expulsar pods de menor prioridad)        |
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

Ningún nodo tiene `disco=nvme`, pero el pod se programa igualmente porque la condición es blanda: la preferencia no se cumple, y el scheduler usa el resto de criterios para elegir nodo.

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

Pod que tolera NoExecute, pero solo durante 60 segundos:

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

El pod arranca Running, y a los 60 segundos es expulsado automáticamente, aunque el taint no haya cambiado. Ctrl+C para salir del watch cuando termine.

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

## 8. Laboratorio guiado

Objetivo: diagnosticar un pod Pending y distinguir si la causa es un taint, una afinidad imposible, o falta de recursos, el escenario de troubleshooting más realista de esta sección.

Paso 1, preparar un escenario con causa oculta, combinando un taint real con una afinidad que apunta a otro nodo distinto:

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
            - cka-worker2
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

Paso 3, diagnóstico paso a paso:

```bash exec
kubectl describe pod pod-diagnostico
```

```text output
Events:
  Warning  FailedScheduling  0/3 nodes are available: 1 node(s) had untolerated taint {mantenimiento: true}, 1 node(s) didn't match Pod's node affinity/selector, 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }.
```

El mensaje de Events lista, por cada nodo descartado, la razón EXACTA. En este caso: cka-worker1 fue descartado por el taint mantenimiento, cka-worker2 fue descartado porque no coincide con la afinidad, y cka-cp1 fue descartado por su taint de control-plane de siempre. Los tres nodos del cluster quedaron fuera, cada uno por un motivo distinto.

Paso 4, corregir agregando la toleration faltante:

```bash exec
kubectl patch pod pod-diagnostico --type=json -p='[{"op":"add","path":"/spec/tolerations","value":[{"key":"mantenimiento","operator":"Equal","value":"true","effect":"NoSchedule"}]}]'
```

El patch a un pod ya creado con este campo suele fallar porque `tolerations` no es mutable en un pod existente. Confirmarlo:

```bash exec
kubectl get pod pod-diagnostico -o jsonpath='{.status.phase}'
```

Si el patch fue rechazado, la vía correcta es eliminar y recrear el pod con la toleration incluida desde el manifiesto original, en lugar de editarlo en caliente.

```bash exec
kubectl delete pod pod-diagnostico

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
            - cka-worker2
  tolerations:
  - key: mantenimiento
    operator: Equal
    value: "true"
    effect: NoSchedule
  containers:
  - name: app
    image: nginx:1.25
EOF
```

Paso 5, verificar la recuperación:

```bash exec
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

Respuesta: la variante required es un requisito duro, si ningún nodo la cumple el pod queda Pending. La variante preferred es una preferencia blanda, con un peso que influye en la puntuación de nodos, pero el pod se programa igualmente aunque ningún nodo la cumpla.

**Pregunta 2**

Un Deployment usa pod anti-affinity con `topologyKey: topology.kubernetes.io/zone`. ¿Puede haber dos réplicas en el mismo nodo?

Respuesta: sí, siempre que ese nodo esté en una zona distinta a la de las otras réplicas. El topologyKey define el dominio de cercanía; con la clave de zona, la restricción es a nivel de zona, no de nodo individual.

**Pregunta 3**

¿Qué diferencia hay entre los efectos NoSchedule y NoExecute de un taint?

Respuesta: NoSchedule solo bloquea la programación de pods NUEVOS sin toleration; los pods que ya estaban corriendo en el nodo no se ven afectados. NoExecute además EXPULSA a los pods que ya están corriendo y no tienen toleration para ese taint específico.

**Pregunta 4**

Un nodo deja de responder de forma inesperada. ¿Cuánto tarda por defecto Kubernetes en expulsar los pods que corrían ahí, y por qué mecanismo?

Respuesta: 300 segundos por defecto. El control plane aplica los taints `node.kubernetes.io/not-ready` o `node.kubernetes.io/unreachable` con efecto NoExecute, y todo pod recibe automáticamente, vía el admission controller DefaultTolerationSeconds, una toleration implícita de 300 segundos para esos taints, dando margen a que el nodo se recupere antes de forzar la migración.

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

Revisar la sección Events al final: el mensaje FailedScheduling lista, nodo por nodo, la razón exacta del descarte, sea taint no tolerado, afinidad no cumplida, o recursos insuficientes. Ese mensaje es la fuente de verdad; no hay que adivinar la causa.

Si el mensaje menciona un taint no tolerado, listar los taints del nodo señalado:

```bash exec
kubectl describe node cka-worker1 | grep Taints
```

Si el mensaje menciona afinidad no satisfecha, comparar el spec de afinidad del pod contra las labels reales del nodo candidato:

```bash exec
kubectl get pod pod-diagnostico -o jsonpath='{.spec.affinity}'
kubectl get nodes --show-labels
```

**Solución:**

Corregir la causa exacta identificada en Events: agregar la toleration faltante, corregir la afinidad para que coincida con labels reales existentes, o liberar recursos según corresponda. Nunca es necesario adivinar; el mensaje de Events siempre indica la razón precisa por nodo.

### Caso 2: tolerations agregadas mediante edit no surten efecto

**Síntoma:**

Se intenta agregar una toleration a un pod ya existente con `kubectl edit` o `kubectl patch`, y el pod sigue Pending, o el comando falla directamente.

Diagnóstico paso a paso:

```bash exec
kubectl patch pod pod-diagnostico --type=json -p='[{"op":"add","path":"/spec/tolerations","value":[]}]'
```

```text output
The Pod "pod-diagnostico" is invalid: spec: Forbidden: pod updates may not add or remove containers, disallowed fields...
```

El campo `spec.tolerations`, junto con la mayoría de campos de `spec`, es INMUTABLE una vez el pod fue creado. Un Pod no gestionado por un controller, sin Deployment ni ReplicaSet detrás, no puede simplemente editarse para agregar tolerations.

**Solución:**

Eliminar y recrear el pod con la toleration ya incluida en el manifiesto original. Si el pod pertenece a un Deployment, StatefulSet o DaemonSet, corregir el `template.spec.tolerations` del controller: el controller se encargará de recrear los pods automáticamente con la configuración nueva.

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

Revisar si alguna PriorityClass tiene `globalDefault: true`, y con qué valor. Si NO existe ninguna con globalDefault, todo pod sin priorityClassName recibe prioridad 0, la más baja posible, y es el primer candidato a expulsión frente a cualquier carga con prioridad explícita mayor.

```bash exec
kubectl get events --field-selector reason=Preempted
```

Confirmar que el evento de expulsión efectivamente fue preemption y no otra causa, como OOMKilled o Evicted por presión de nodo.

**Solución:**

Asignar explícitamente una PriorityClass apropiada a las cargas de producción que deben estar protegidas frente a preemption, en lugar de depender del valor por defecto 0. Si existe una PriorityClass con globalDefault, revisar si es la esperada para este tipo de carga.

## 12. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Los ejemplos de anti-affinity, taints y preemption de este módulo dependen directamente de tener múltiples nodos reales para observar distribución y desalojo con sentido.

**Alternativa K3s (plan B):** nodeSelector, node affinity, pod affinity/anti-affinity, taints, tolerations y PriorityClasses son parte de la API estándar de Kubernetes y funcionan de forma idéntica en K3s. La limitación es la misma que en módulos anteriores: con un único nodo, no hay forma de observar distribución entre nodos, anti-affinity, topologyKey, ni desalojo real por taints entre nodos distintos, ya que solo existe un nodo candidato en todo momento.

Limpieza del módulo:

```bash exec
kubectl delete pod pod-con-selector pod-affinity-required pod-affinity-imposible pod-affinity-preferred pod-sin-toleration pod-con-toleration pod-tolerancia-temporal pod-critico pod-diagnostico pod-con-tolerancia pod-critico-zona
kubectl delete deployment web-distribuido relleno-baja-prioridad
kubectl delete priorityclass prioridad-alta prioridad-baja alta-prioridad baja-prioridad
kubectl label node cka-worker1 disco-
kubectl label node cka-worker2 disco- entorno-
kubectl taint node cka-worker1 reservado=equipo-datos:NoSchedule- 2>/dev/null
```

---

**Siguiente módulo:** M10 - Services y kube-proxy