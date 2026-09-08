# M02 - Arquitectura de Kubernetes

## 1. Resumen técnico

Este módulo cubre los componentes que forman un cluster de Kubernetes, cómo se comunican entre sí, y el patrón de diseño que sostiene todo el sistema: el reconciliation loop. Es el módulo más teórico del curso, pero cada concepto que introduce se reutiliza sin volver a explicarse en los módulos siguientes, desde la instalación con kubeadm hasta el troubleshooting del control plane. Entender esta arquitectura es lo que separa a alguien que memoriza comandos de alguien que diagnostica un cluster roto con criterio.

## 2. Prerrequisitos

De M01 usarás la familiaridad con kubectl en modo imperativo y con `kubectl describe`, ya que este módulo se apoya en observar el cluster real para ilustrar cada componente, en lugar de quedarse solo en la teoría.

## 3. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Nombrar los componentes del control plane y del nodo worker, y explicar la responsabilidad exacta de cada uno.
2. Explicar por qué solo kube-apiserver habla directamente con etcd, y qué implica eso para el resto de componentes.
3. Explicar el reconciliation loop con tus propias palabras, usando un ejemplo concreto.
4. Describir el flujo general de una petición desde que sale de kubectl hasta que se refleja en el estado del cluster.
5. Identificar, en un cluster real, qué proceso o pod corresponde a cada componente de la arquitectura.
6. Explicar qué es un static pod y por qué el control plane puede arrancar sin depender de sí mismo.

## 4. Explicación teórica progresiva

### 4.1 Control plane y data plane

Un cluster de Kubernetes se divide en dos planos con responsabilidades distintas. El control plane toma decisiones globales sobre el cluster: qué debe existir, dónde debe correr, y si el estado actual coincide con el deseado. El data plane, formado por los nodos worker, es donde realmente corren las cargas de trabajo, los pods de las aplicaciones.

En tu laboratorio, cka-cp1 aloja el control plane, y cka-worker1 y cka-worker2 forman el data plane. Esta separación es lógica, no física obligatoria: en un cluster de un solo nodo el control plane y el data plane conviven en la misma máquina, pero las responsabilidades siguen siendo las mismas.

### 4.2 Componentes del control plane

#### kube-apiserver

Es la puerta de entrada única al cluster. Expone la API REST de Kubernetes, valida y procesa cada petición, y es el ÚNICO componente que se comunica directamente con etcd. Todo lo demás, kubectl, el scheduler, el controller-manager, los kubelets de cada nodo, habla exclusivamente con el apiserver, nunca con etcd de forma directa. Esta regla es la pieza más importante de toda la arquitectura: si la entiendes bien, el resto de componentes se explican solos como clientes de una misma API.

#### etcd

Es una base de datos clave-valor distribuida y consistente que almacena TODO el estado del cluster: pods, deployments, services, secrets, configmaps, RBAC, y también el propio estado interno de Kubernetes. Si etcd se pierde sin backup, el cluster pierde su memoria completa, aunque los procesos de los nodos sigan corriendo. Profundizarás en el backup y restore de etcd en M03.

#### kube-scheduler

Observa, a través del apiserver, los pods que aún no tienen nodo asignado (`spec.nodeName` vacío), evalúa en qué nodo deberían correr según recursos disponibles, afinidad, taints y otros criterios, y escribe esa decisión de vuelta en el apiserver. El scheduler nunca arranca contenedores directamente; solo decide y anota la decisión. Profundizarás en sus criterios de decisión en M09.

#### kube-controller-manager

Es un único proceso que, internamente, ejecuta muchos controllers distintos: el controller de Deployments, el de Nodes, el de Jobs, el de ServiceAccounts, entre otros. Cada uno de ellos implementa el mismo patrón, el reconciliation loop, explicado en 4.4. Todos hablan con el apiserver, nunca directamente con etcd.

#### cloud-controller-manager

Existe para integrar el cluster con la API de un proveedor cloud (crear load balancers, asignar IPs públicas, etc.), separando esa lógica específica de proveedor del resto de Kubernetes. Tu laboratorio es un cluster bare-metal sin proveedor cloud configurado, así que este componente NO corre en tu cluster; no lo busques en `kubectl get pods -n kube-system`, no vas a encontrarlo.

### 4.3 Componentes de cada nodo

#### kubelet

Es el agente que corre en CADA nodo del cluster, incluido el control plane en una instalación kubeadm como la tuya. Su trabajo es asegurar que los contenedores descritos en los PodSpecs asignados a su nodo estén corriendo y saludables. Observa al apiserver preguntando por los pods asignados a su propio nodo, y traduce esas definiciones en llamadas al container runtime a través de CRI. kubelet NO gestiona contenedores que no fueron creados por Kubernetes.

#### kube-proxy

Corre en cada nodo y mantiene las reglas de red, típicamente iptables o IPVS, que permiten que el tráfico dirigido a un Service llegue a los pods correctos, sin importar en qué nodo estén. Profundizarás en su mecanismo exacto más adelante en el curso, en el módulo dedicado a Services.

#### Container runtime

Es el software responsable de ejecutar realmente los contenedores: descargar imágenes, crear namespaces de Linux, arrancar y detener procesos. En tu cluster es containerd. kubelet se comunica con él a través de un contrato estandarizado llamado CRI, Container Runtime Interface, que profundizarás en M06 junto con las otras interfaces de extensión, CNI y CSI.

### 4.4 El reconciliation loop

Este es el patrón de diseño que hace funcionar a Kubernetes, y se repite en cada controller que verás en el curso: Deployments, DaemonSets, StatefulSets, Jobs, y también en los Operators que instalarás en M06.

El patrón tiene tres pasos que se repiten indefinidamente:

1. Observar el estado DESEADO, definido por el usuario en un objeto como un Deployment, y el estado ACTUAL, reflejado en los objetos reales del cluster, como los pods existentes.
2. Comparar ambos estados para detectar diferencias.
3. Actuar para acercar el estado actual al deseado: crear lo que falta, eliminar lo que sobra, o modificar lo que no coincide.

Después de actuar, el ciclo vuelve al paso 1. No es un proceso que se ejecuta una vez y termina; corre de forma continua durante toda la vida del cluster. Por eso, si eliminas manualmente un pod gestionado por un Deployment, reaparece: el controller detectó que el estado actual, 2 pods en vez de 3, ya no coincide con el deseado, y actuó para corregirlo.

### 4.5 Flujo general de una petición

Cuando ejecutas cualquier comando de kubectl, ocurre esta secuencia:

1. kubectl construye una petición HTTP contra la API REST y la envía al apiserver, usando el certificado o token definido en tu kubeconfig.
2. El apiserver autentica la identidad de quien hace la petición.
3. El apiserver autoriza la acción, verificando si esa identidad tiene permiso para el verbo y el recurso solicitados. Este es el punto donde interviene RBAC, que verás en profundidad en M05.
4. El apiserver pasa el objeto por controladores de admisión, que pueden validarlo o incluso modificarlo antes de aceptarlo.
5. Si todo lo anterior pasa, el apiserver escribe el objeto en etcd.
6. El apiserver responde a kubectl confirmando la operación.

A partir de aquí, el trabajo real ocurre de forma asíncrona: el scheduler y los distintos controllers, que estaban observando al apiserver, detectan el cambio y reaccionan según el patrón de 4.4, sin que kubectl tenga que esperar a que ese trabajo termine.

### 4.6 etcd y el mecanismo de watch

Los componentes del control plane y los kubelets no hacen polling constante preguntando "¿algo cambió?". En su lugar, abren una conexión de watch contra el apiserver sobre el tipo de recurso que les interesa, por ejemplo pods sin nodo asignado, en el caso del scheduler, y el apiserver les notifica en tiempo real cuando ocurre un cambio relevante. Esto es lo que hace que Kubernetes reaccione en segundos y no en base a intervalos fijos de sondeo.

### 4.7 Static pods, cómo el control plane arranca sin depender de sí mismo

Hay un problema circular en el diseño: si kube-apiserver, kube-scheduler y kube-controller-manager son en sí mismos pods de Kubernetes, ¿quién los programa antes de que el propio cluster exista? La respuesta es que kubelet puede arrancar pods sin pasar por el apiserver en absoluto, leyendo manifiestos YAML directamente de un directorio local del sistema de ficheros, normalmente `/etc/kubernetes/manifests/`. Estos se llaman static pods.

kubelet vigila ese directorio y arranca cualquier manifiesto que encuentre ahí, sin necesitar que exista un apiserver funcionando todavía, porque el propio apiserver es uno de esos manifiestos. Una vez que el apiserver arranca, kubelet crea además un mirror pod visible vía `kubectl get pods`, para que puedas verlo, aunque no puedas gestionarlo desde ahí, editar o borrar ese mirror pod con kubectl no tiene efecto real sobre el static pod. Profundizarás en esto con manifiestos reales en M03.

## 5. Diagrama ASCII - arquitectura completa y flujo de comunicación

```text reference
                         CONTROL PLANE (cka-cp1)
        +--------------------------------------------------+
        |                                                    |
        |   +------------+        +------------------+      |
        |   |   etcd     |<-------|  kube-apiserver  |      |
        |   +------------+        +--------+---------+      |
        |                                  ^                 |
        |          +----------------------+----------+       |
        |          |                                 |       |
        |   +------+-------+              +----------+----+ |
        |   | kube-scheduler|              | kube-controller| |
        |   |               |              |    -manager    | |
        |   +---------------+              +----------------+ |
        |                                                    |
        +--------------------------------------------------+
                      ^                              ^
                      |  (watch/API REST,             |
                      |   nunca acceso directo         |
                      |   a etcd)                       |
                      |                                |
        +-------------+------------+   +---------------+-----------+
        |    WORKER (cka-worker1)   |   |   WORKER (cka-worker2)    |
        |                            |   |                            |
        |  +----------+ +---------+  |   |  +----------+ +---------+  |
        |  | kubelet  | |kube-proxy| |   |  | kubelet  | |kube-proxy| |
        |  +----+-----+ +---------+  |   |  +----+-----+ +---------+  |
        |       |                    |   |       |                    |
        |  +----v-----------------+  |   |  +----v-----------------+  |
        |  | containerd (via CRI) |  |   |  | containerd (via CRI) |  |
        |  +----------------------+  |   |  +----------------------+  |
        +----------------------------+   +----------------------------+

Regla central: SOLO kube-apiserver habla directamente con etcd.
Todo lo demas (scheduler, controller-manager, kubelet, kube-proxy,
kubectl) habla EXCLUSIVAMENTE con kube-apiserver.
```

## 6. Ejemplos prácticos: identificar los componentes en tu cluster real

Ver los componentes del control plane corriendo como static pods:

```bash exec
kubectl get pods -n kube-system -o wide
```

```text output
NAME                              READY   STATUS    NODE
etcd-cka-cp1                       1/1     Running   cka-cp1
kube-apiserver-cka-cp1             1/1     Running   cka-cp1
kube-controller-manager-cka-cp1    1/1     Running   cka-cp1
kube-scheduler-cka-cp1             1/1     Running   cka-cp1
kube-proxy-4jkxc                   1/1     Running   cka-cp1
kube-proxy-9plqz                   1/1     Running   cka-worker1
kube-proxy-k7zxq                   1/1     Running   cka-worker2
calico-node-...                    1/1     Running   cka-cp1
calico-node-...                    1/1     Running   cka-worker1
calico-node-...                    1/1     Running   cka-worker2
```

Nota que `cloud-controller-manager` no aparece en esta lista, confirmando lo explicado en 4.2: tu cluster bare-metal no lo ejecuta.

Confirmar que estos pods del control plane son static pods, buscando su manifiesto local en cka-cp1:

```bash exec
ls /etc/kubernetes/manifests/
```

```text output
etcd.yaml
kube-apiserver.yaml
kube-controller-manager.yaml
kube-scheduler.yaml
```

Ver el proceso de kubelet corriendo directamente en el sistema operativo, fuera de cualquier contenedor, en cualquiera de los tres nodos:

```bash exec
systemctl status kubelet
```

```text output
● kubelet.service - kubelet: The Kubernetes Node Agent
     Loaded: loaded
     Active: active (running)
```

Confirmar que kubelet corre como proceso del sistema operativo, no como pod, es clave: kubelet es el único componente de la arquitectura que NO es en sí mismo un pod de Kubernetes, porque su trabajo es precisamente crear y vigilar pods.

## 7. Laboratorio guiado: trazar el flujo completo de una petición real

Objetivo: crear un pod simple y correlacionar cada evento observado con el componente de la arquitectura responsable, conectando la teoría de la sección 4.5 con evidencia real.

Paso 1, crear el pod:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: trace-arquitectura
spec:
  containers:
  - name: app
    image: nginx:1.25
EOF
```

Paso 2, observar la secuencia de eventos inmediatamente:

```bash exec
kubectl describe pod trace-arquitectura
```

```text output
Events:
  Type    Reason     From               Message
  Normal  Scheduled  default-scheduler  Successfully assigned default/trace-arquitectura to cka-worker1
  Normal  Pulling    kubelet            Pulling image "nginx:1.25"
  Normal  Pulled     kubelet            Successfully pulled image "nginx:1.25"
  Normal  Created    kubelet            Created container app
  Normal  Started    kubelet            Started container app
```

Paso 3, correlacionar cada línea con la arquitectura:

El evento `Scheduled`, atribuido a `default-scheduler`, es el kube-scheduler de la sección 4.2 ejecutando su decisión de la sección 4.5: leyó el pod sin nodo asignado vía watch contra el apiserver, decidió cka-worker1, y escribió esa decisión de vuelta en el apiserver.

Los eventos `Pulling`, `Pulled`, `Created` y `Started`, todos atribuidos a `kubelet`, son el kubelet de cka-worker1 de la sección 4.3, que detectó vía watch que un pod fue asignado a su nodo, y tradujo esa definición en llamadas al container runtime, containerd, a través de CRI, según lo explicado en 4.3.

Ningún evento menciona a etcd directamente, porque ningún componente distinto de kube-apiserver interactúa con etcd; el apiserver es el intermediario invisible en cada uno de estos pasos.

Paso 4, confirmar el nodo real asignado:

```bash exec
kubectl get pod trace-arquitectura -o jsonpath='{.spec.nodeName}'
```

```text output
cka-worker1
```

Paso 5, limpiar:

```bash exec
kubectl delete pod trace-arquitectura
```

## 8. Checkpoint

**Pregunta 1**

¿Qué componente es el único que se comunica directamente con etcd, y qué implica eso para el scheduler y el controller-manager?

Respuesta: solo kube-apiserver habla directamente con etcd. El scheduler y el controller-manager, como todo lo demás, obtienen y modifican el estado del cluster exclusivamente a través de la API del apiserver, nunca accediendo a etcd por su cuenta.

**Pregunta 2**

Describe el reconciliation loop en tres pasos.

Respuesta: observar el estado deseado y el estado actual, comparar ambos para detectar diferencias, y actuar para acercar el estado actual al deseado. El ciclo se repite indefinidamente, no se ejecuta una sola vez.

**Pregunta 3**

¿Por qué el control plane puede arrancar sin depender de un apiserver que todavía no existe?

Respuesta: porque kubelet puede arrancar pods como static pods, leyendo manifiestos directamente de un directorio local del sistema de ficheros, sin necesitar comunicarse con el apiserver para hacerlo. El propio apiserver es uno de esos static pods.

**Pregunta 4**

Eliminas manualmente un pod que pertenece a un Deployment con 3 réplicas. ¿Qué pasa y por qué?

Respuesta: el pod reaparece. El controller de Deployments, dentro de kube-controller-manager, detecta mediante su reconciliation loop que el estado actual, 2 pods, ya no coincide con el estado deseado, 3 réplicas, y crea un pod nuevo para corregir la diferencia.

**Pregunta 5**

¿Por qué `cloud-controller-manager` no aparece al ejecutar `kubectl get pods -n kube-system` en este laboratorio?

Respuesta: porque ese componente solo existe para integrar el cluster con la API de un proveedor cloud. Este es un cluster bare-metal instalado con kubeadm sin ningún proveedor cloud configurado, así que ese componente simplemente no se despliega.

## 9. Laboratorio cronometrado

Objetivo: completar en menos de 10 minutos.

Tarea:

1. Lista todos los pods del namespace kube-system y guarda el conteo total en /tmp/total-kube-system.txt.
2. Identifica en qué nodo corre el pod de etcd y guarda ese nombre en /tmp/nodo-etcd.txt.
3. Confirma que kubelet corre como proceso de sistema, no como pod, y guarda el resultado de `systemctl is-active kubelet` en /tmp/estado-kubelet.txt.
4. Crea un pod llamado 'verificacion-arquitectura' con imagen busybox y comando `sleep 3600`, y guarda en /tmp/evento-scheduling.txt el mensaje exacto del evento Scheduled de ese pod.

Criterios de éxito:

```bash exec
cat /tmp/total-kube-system.txt
cat /tmp/nodo-etcd.txt
cat /tmp/estado-kubelet.txt
cat /tmp/evento-scheduling.txt
```

```text output
10

cka-cp1

active

Successfully assigned default/verificacion-arquitectura to cka-worker2
```

Solución de referencia, no mirar hasta terminar:

```bash exec
kubectl get pods -n kube-system --no-headers | wc -l > /tmp/total-kube-system.txt

kubectl get pods -n kube-system -o wide | grep etcd | awk '{print $7}' > /tmp/nodo-etcd.txt

systemctl is-active kubelet > /tmp/estado-kubelet.txt

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: verificacion-arquitectura
spec:
  containers:
  - name: app
    image: busybox
    command: ["sleep", "3600"]
EOF

kubectl get events --field-selector involvedObject.name=verificacion-arquitectura,reason=Scheduled -o jsonpath='{.items[0].message}' > /tmp/evento-scheduling.txt
```

## 10. Troubleshooting - casos reales

### Caso 1: kubectl no responde, "connection refused"

**Síntoma:**

Cualquier comando de kubectl devuelve un error de conexión rechazada, y no muestra información de RBAC ni de ningún otro tipo, solo el fallo de conexión.

Diagnóstico paso a paso:

Este es el caso más básico de arquitectura: si kubectl no puede ni siquiera conectar, el problema está antes de llegar a autenticación o autorización, en el apiserver mismo o en la red hacia él.

```bash exec
kubectl cluster-info
```

Si esto también falla con el mismo error de conexión, el problema es el apiserver, no tu configuración de kubectl. En cka-cp1, confirmar si el proceso del apiserver está corriendo:

```bash exec
crictl ps -a | grep apiserver
```

Si no aparece ningún contenedor, el problema es previo incluso al apiserver: revisar si kubelet, el componente que arranca los static pods, está activo.

```bash exec
systemctl status kubelet
journalctl -u kubelet --no-pager | tail -30
```

**Solución:**

Si kubelet está inactivo, reiniciarlo con `systemctl restart kubelet` y observar si el static pod del apiserver arranca solo, según lo explicado en 4.7. Si kubelet está activo pero el contenedor del apiserver falla repetidamente, revisar sus logs con `crictl logs` sobre el ID del contenedor, buscando errores de configuración o de certificados.

### Caso 2: el scheduler no asigna nodo a ningún pod nuevo

**Síntoma:**

Los pods nuevos quedan en Pending indefinidamente, y `kubectl describe pod` no muestra ningún evento en absoluto, ni siquiera un intento fallido de scheduling.

Diagnóstico paso a paso:

La ausencia TOTAL de eventos, ni siquiera de fallo, es la pista clave: significa que ningún componente está observando ese pod para actuar sobre él. El sospechoso principal es el kube-scheduler mismo, no una condición de recursos o afinidad, que sí generaría un evento FailedScheduling.

```bash exec
kubectl get pods -n kube-system | grep scheduler
```

Si el pod del scheduler no aparece como Running, el problema está confirmado. Revisar directamente en cka-cp1:

```bash exec
crictl ps -a | grep scheduler
crictl logs $(crictl ps -a | grep scheduler | awk '{print $1}')
```

**Solución:**

Si el static pod del scheduler está en CrashLoopBackOff, la causa más común es un error de sintaxis en `/etc/kubernetes/manifests/kube-scheduler.yaml` tras una edición manual, o un problema con sus certificados. Corregir el manifiesto y esperar a que kubelet lo relea automáticamente; no requiere reiniciar kubelet para detectar el cambio.

### Caso 3: confundir un mirror pod con un pod gestionado normalmente

**Síntoma:**

Se intenta eliminar o editar uno de los pods del control plane, por ejemplo `kube-apiserver-cka-cp1`, usando `kubectl delete` o `kubectl edit`, y el pod reaparece de inmediato sin importar lo que se cambie.

Diagnóstico paso a paso:

```bash exec
kubectl get pod kube-apiserver-cka-cp1 -n kube-system -o yaml | grep -A2 ownerReferences
```

```text output
ownerReferences:
- apiVersion: v1
  kind: Node
  name: cka-cp1
```

Un `ownerReference` de tipo Node, en lugar de ReplicaSet o DaemonSet, confirma que este es un mirror pod de un static pod, tal como se explicó en 4.7, no un pod gestionado por un controller normal a través del apiserver.

**Solución:**

No es un fallo, es el comportamiento esperado: `kubectl delete` sobre un mirror pod solo lo elimina temporalmente de la vista, pero kubelet, que sigue leyendo el manifiesto real en `/etc/kubernetes/manifests/` de forma independiente, lo vuelve a crear casi de inmediato. Para modificar un componente del control plane hay que editar su manifiesto real en esa ruta, no el mirror pod visible vía kubectl. Este flujo completo se practica en M03.

## 11. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Este módulo depende de tener un control plane real y separado de los workers para poder distinguir con claridad qué corre en cada rol, algo que un cluster de un solo nodo no permite observar.

**Alternativa K3s (plan B):** la arquitectura conceptual es la misma, ya que K3s sigue siendo Kubernetes, con los mismos componentes lógicos. La diferencia relevante es que K3s reemplaza etcd por SQLite por defecto como backend de almacenamiento, y empaqueta varios componentes del control plane, incluido kubelet, dentro de un único binario y proceso, lo que hace mucho más difícil observarlos como procesos o pods separados. Los ejemplos de la sección 6 y el laboratorio guiado de la sección 7, que dependen de ver estos componentes como static pods individuales, no se pueden replicar de la misma forma en K3s.

---

**Siguiente módulo:** M03 - kubeadm, backup y restore de etcd, upgrade de cluster