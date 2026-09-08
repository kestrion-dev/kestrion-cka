# M16 - Troubleshooting: Nodos y Networking

## 1. Resumen técnico

Segundo de los tres módulos de troubleshooting. Cubre fallos a nivel de nodo, kubelet caído, presión de recursos, y fallos de red entre pods, el CNI que deja de funcionar, conectividad rota entre nodos, kube-proxy desincronizado. Estos son los problemas que un SRE diagnostica con acceso SSH directo al nodo, no solo con kubectl, exactamente el patrón de escalado de herramientas ya practicado en M15.

## 2. Peso en el examen y preguntas típicas

Parte del 30% del examen dedicado a troubleshooting. Preguntas típicas:

- Un nodo aparece NotReady, diagnostica la causa exacta y corrígela.
- Pods nuevos quedan atascados en ContainerCreating en un nodo específico, diagnostica el CNI.
- Dos pods en nodos distintos no pueden comunicarse entre sí, diagnostica la conectividad.
- Un nodo evictúa pods inesperadamente, identifica la condición de presión responsable.
- Un Service responde desde algunos nodos pero no desde otros, diagnostica kube-proxy.

## 3. Prerrequisitos

De M02 (Arquitectura) usarás kubelet, kube-proxy y el container runtime como los tres componentes de nodo cuya salud se diagnostica aquí.

De M06 (Extension Interfaces) usarás el CNI como la pieza responsable de que un pod obtenga red funcional.

De M08 (Jobs y recursos) usarás el orden de evicción por QoS class, la lógica real detrás de qué pods elige el kubelet cuando un nodo entra en presión de recursos.

De M09 (Scheduling avanzado) usarás los taints, aquí aplicados automáticamente por el node controller según las Conditions reales del nodo, no por un operador humano.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Leer las Conditions de un nodo y traducirlas en una causa raíz concreta.
2. Diagnosticar un nodo NotReady distinguiendo un fallo de kubelet de un fallo del CNI.
3. Diagnosticar pods atascados en ContainerCreating por fallo del plugin de red.
4. Diagnosticar conectividad rota entre pods de nodos distintos, a nivel de routing.
5. Explicar qué taints aplica automáticamente el node controller y con qué efecto.
6. Diagnosticar un nodo con reglas de kube-proxy desincronizadas del resto del cluster.

## 5. Metodología: las Conditions del nodo como punto de partida

Todo nodo expone un conjunto de Conditions en su status, visibles con `kubectl describe node`: `Ready`, `MemoryPressure`, `DiskPressure`, `PIDPressure`, y `NetworkUnavailable`. Estas Conditions no son diagnóstico en sí mismas, son el PUNTO DE PARTIDA que indica en qué dirección investigar.

Conexión con M09: el node controller, parte de kube-controller-manager, observa estas Conditions mediante el mismo reconciliation loop visto en M02, y aplica taints automáticamente en consecuencia, sin intervención humana. `node.kubernetes.io/not-ready` y `node.kubernetes.io/unreachable` se aplican con efecto `NoExecute`, expulsando pods existentes tras el `tolerationSeconds` por defecto de 300 segundos, ya visto en M09. `node.kubernetes.io/memory-pressure`, `node.kubernetes.io/disk-pressure` y `node.kubernetes.io/pid-pressure` se aplican con efecto `NoSchedule`: bloquean pods NUEVOS, pero no expulsan directamente a los existentes por sí mismos. La expulsión real de pods ya corriendo bajo presión de recursos la ejecuta el kubelet mismo, mediante su eviction manager, siguiendo el orden de QoS class visto en M08, un mecanismo distinto y más inmediato que el de los taints.

## 6. Diagrama ASCII - árbol de diagnóstico de nodo

```text reference
kubectl get nodes  -> algun nodo NotReady?
       |
      SI
       v
kubectl describe node <nodo>  -> revisar Conditions
       |
   +---+---+-------------+-------------+
   |       |             |             |
 Ready   MemoryPressure DiskPressure  NetworkUnavailable
 =False   =True          =True         =True
   |       |             |             |
   v       v             v             v
 Revisar  kubelet         df -h en    CNI no configuro
 razon    eviction        el nodo     rutas todavia,
 exacta   manager esta                revisar calico-node
 del      expulsando                  en ESE nodo
 mensaje  BestEffort/
          Burstable
          (orden de M08)

 Razon "KubeletNotReady":
   ssh al nodo -> systemctl status kubelet
                  journalctl -u kubelet

 Razon "NetworkPluginNotReady"
 o "cni config uninitialized":
   kubectl get pods -n kube-system -o wide | grep calico-node
   (buscar el pod de ESE nodo especifico)
   crictl logs <id-del-calico-node-de-ese-nodo>
```

## 7. Casos guiados de troubleshooting

### Caso 1: nodo NotReady por kubelet caído

**Síntoma:**

`kubectl get nodes` muestra a cka-worker1 en estado NotReady.

Diagnóstico paso a paso:

```bash exec
kubectl describe node cka-worker1
```

```text output
Conditions:
  Type     Status  Reason
  Ready    False   KubeletNotReady
Events:
  Warning  NodeNotReady  Node cka-worker1 status is now: NodeNotReady
```

La razón `KubeletNotReady` apunta directamente al componente. Conectarse por SSH al nodo señalado:

```bash exec
systemctl status kubelet
journalctl -u kubelet --no-pager | tail -30
```

Causas comunes en los logs: certificado del kubelet expirado, fallo al conectar con containerd, o el proceso simplemente detenido tras un reinicio del sistema operativo sin que el servicio se reactivara.

**Solución:**

```bash exec
sudo systemctl start kubelet
sudo systemctl enable kubelet
```

`enable` asegura que sobreviva a un futuro reinicio del nodo, la causa raíz más común en este escenario específico.

### Caso 2: nodo NotReady por CNI no inicializado

**Síntoma:**

Un nodo recién unido al cluster, vía `kubeadm join`, queda NotReady indefinidamente, aunque kubelet está claramente activo.

Diagnóstico paso a paso:

```bash exec
kubectl describe node cka-worker2
```

```text output
Conditions:
  Type     Status  Reason
  Ready    False   NetworkPluginNotReady
Events:
  Warning  NetworkNotReady  network plugin is not ready: cni config uninitialized
```

Este mensaje es exactamente el esperado al inicializar un cluster sin CNI, ya visto en M03, pero aquí aplicado a un nodo que se unió DESPUÉS de que el resto del cluster ya tenía Calico funcionando; el pod de calico-node de ese nodo específico no llegó a arrancar correctamente.

```bash exec
kubectl get pods -n kube-system -o wide | grep calico-node
```

Identificar el pod de calico-node correspondiente a cka-worker2 específicamente, no a los demás nodos que sí funcionan.

El siguiente comando se ejecuta sustituyendo el nombre real obtenido en el paso anterior:

```text reference
kubectl describe pod <pod-calico-de-cka-worker2> -n kube-system
```

**Solución:**

Según lo que revele Events, causas comunes son falta de recursos en el nodo nuevo, o un problema de conectividad hacia el apiserver desde ese nodo específico impidiendo que calico-node complete su configuración inicial. Corregir la causa raíz y verificar:

```bash exec
kubectl get nodes cka-worker2
```

### Caso 3: pods nuevos atascados en ContainerCreating en un solo nodo

**Síntoma:**

Pods programados específicamente en cka-worker1 quedan en ContainerCreating indefinidamente, mientras pods idénticos en cka-worker2 arrancan sin problema.

Diagnóstico paso a paso:

El siguiente comando se ejecuta sustituyendo el nombre real del pod atascado:

```text reference
kubectl describe pod <pod-atascado>
```

```text output
Events:
  Warning  FailedCreatePodSandBox  Failed to create pod sandbox: rpc error: code = Unknown desc = failed to setup network for sandbox: plugin type="calico" failed (add): error getting ClusterInformation: connection refused
```

El error de sandbox de red confirma que el problema es específicamente el CNI en ESE nodo, no el scheduler ni el runtime en general, ya que el sandbox del contenedor sí se crea pero la configuración de red falla.

```bash exec
kubectl get pods -n kube-system -o wide | grep calico-node | grep cka-worker1
```

```text output
calico-node-x7k2p   0/1   CrashLoopBackOff   cka-worker1
```

**Solución:**

```bash exec
kubectl logs -n kube-system calico-node-x7k2p --previous
```

Revisar la causa del crash y corregirla, según lo que indiquen los logs, típicamente un problema de conectividad de ese calico-node hacia el apiserver o hacia etcd, o un conflicto de configuración de red local del nodo. Tras corregir, el DaemonSet, visto en M07, recreará el pod automáticamente.

### Caso 4: conectividad rota entre pods de nodos distintos

**Síntoma:**

Un pod en cka-worker1 puede conectarse a otro pod en el MISMO nodo, pero no a un pod en cka-worker2.

Diagnóstico paso a paso:

```bash exec
kubectl get pods -o wide
```

Confirmar en qué nodo está cada pod involucrado, y anotar la IP real del pod destino en cka-worker2, visible en esa misma salida.

El siguiente comando se ejecuta sustituyendo el pod origen y la IP destino reales:

```text reference
kubectl exec -it <pod-en-worker1> -- ping -c3 <ip-del-pod-en-worker2>
```

Si el ping falla, el problema es de routing entre nodos, no de un Service ni de DNS.

```bash exec
ip route | grep -E "192.168"
```

Ejecutado en cka-worker1: Calico programa rutas hacia los rangos de IP de pods de cada otro nodo del cluster. Si falta la ruta hacia el rango de cka-worker2, ese es el problema exacto.

```bash exec
sudo iptables -L -n | grep DROP
```

Confirmar que ninguna regla de firewall del sistema operativo, fuera del control de Kubernetes, esté bloqueando el tráfico entre las IPs de los nodos mismos, en el puerto usado por el overlay de Calico.

**Solución:**

Si falta la ruta, reiniciar calico-node en ambos nodos suele forzar una resincronización completa de rutas. Si el bloqueo es de un firewall del sistema operativo, corregir esa regla directamente, fuera del alcance de cualquier objeto de Kubernetes.

### Caso 5: nodo evictúa pods por presión de disco

**Síntoma:**

Pods en cka-worker1 empiezan a desaparecer con estado Evicted, sin relación aparente con ningún límite de memoria individual visto en M08.

Diagnóstico paso a paso:

```bash exec
kubectl describe node cka-worker1 | grep -A3 DiskPressure
```

```text output
DiskPressure   True    KubeletHasDiskPressure
```

```bash exec
df -h /var/lib/kubelet /var/lib/containerd
```

Confirmar el espacio real disponible en el nodo.

```bash exec
kubectl get pods -o wide --field-selector spec.nodeName=cka-worker1 -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.qosClass}{"\n"}{end}'
```

Conexión con M08: bajo DiskPressure, igual que bajo MemoryPressure, el kubelet evictúa primero los pods BestEffort, luego Burstable, dejando Guaranteed para el final, el mismo orden de QoS ya explicado ahí.

**Solución:**

Liberar espacio en disco, eliminando imágenes de contenedor no usadas:

```bash exec
crictl rmi --prune
```

Para una solución permanente, monitorizar el consumo de disco del nodo y ajustar los recursos, o el número de pods programados ahí, antes de que vuelva a cruzar el umbral.

### Caso 6: kube-proxy desincronizado en un solo nodo

**Síntoma:**

Un Service responde correctamente al conectarse desde cka-worker1, pero no desde cka-worker2, aunque `kubectl get endpoints` muestra el mismo resultado correcto desde cualquier punto.

Diagnóstico paso a paso:

Conexión con M10: el objeto Service y sus Endpoints son globales, vía etcd, pero las reglas REALES que mueven los paquetes son locales a cada nodo, programadas independientemente por la instancia de kube-proxy de ese nodo específico.

```bash exec
kubectl get pods -n kube-system -l k8s-app=kube-proxy -o wide
```

Identificar el pod de kube-proxy correspondiente a cka-worker2 específicamente.

El siguiente comando se ejecuta sustituyendo el nombre real del pod obtenido arriba:

```text reference
kubectl logs -n kube-system <pod-kube-proxy-de-worker2> --tail=30
```

Buscar errores de sincronización recientes.

```bash exec
sudo iptables -t nat -L KUBE-SERVICES
```

Ejecutado en cka-worker2 vía SSH: confirmar si la regla del Service en cuestión realmente existe en ese nodo específico, comparándola contra la misma consulta en cka-worker1, donde sí funciona.

**Solución:**

Si las reglas están ausentes o desactualizadas en ese nodo, reiniciar el pod de kube-proxy correspondiente fuerza una resincronización completa desde cero. El siguiente comando se ejecuta sustituyendo el nombre real del pod:

```text reference
kubectl delete pod <pod-kube-proxy-de-worker2> -n kube-system
```

El DaemonSet, visto en M07, lo recreará automáticamente, reprogramando todas sus reglas desde el estado actual real del cluster.

## 8. Checkpoint

**Pregunta 1**

¿Qué diferencia de efecto hay entre los taints `node.kubernetes.io/not-ready` y `node.kubernetes.io/disk-pressure`?

Respuesta: `not-ready` usa efecto NoExecute, expulsando pods ya existentes tras el tolerationSeconds. `disk-pressure` usa efecto NoSchedule, bloqueando solo pods nuevos; la expulsión de pods existentes bajo presión de disco la realiza el kubelet directamente vía su eviction manager, no el mecanismo de taints.

**Pregunta 2**

Un nodo nuevo se une al cluster y queda NotReady con razón `NetworkPluginNotReady`. ¿Qué revisas primero?

Respuesta: el pod de calico-node correspondiente específicamente a ese nodo, no el estado general de Calico en el cluster; el problema suele estar aislado a la instancia de ese nodo concreto.

**Pregunta 3**

Un pod no puede hacer ping a otro pod en un nodo distinto, pero sí a uno en su propio nodo. ¿Qué comando revisa la causa más probable?

Respuesta: `ip route`, ejecutado en el nodo origen, para confirmar si existe la ruta hacia el rango de IPs de pods del nodo destino, programada por el CNI.

**Pregunta 4**

Bajo presión de disco, ¿qué pods evictúa primero el kubelet?

Respuesta: los de clase QoS BestEffort primero, luego Burstable, dejando Guaranteed como último recurso, el mismo orden explicado en M08 para presión de memoria.

**Pregunta 5**

Un Service funciona desde un nodo pero no desde otro, aunque los Endpoints son correctos globalmente. ¿Cuál es la causa más probable?

Respuesta: las reglas de kube-proxy en el nodo problemático están desactualizadas o ausentes; kube-proxy programa reglas LOCALES a cada nodo de forma independiente, así que un fallo aislado a una instancia no afecta a las demás.

## 9. Laboratorio cronometrado

Objetivo: completar en menos de 20 minutos.

Tarea, sin ejecutar comandos destructivos reales sobre tu cluster:

1. Ejecuta `kubectl describe node` sobre cada uno de los 3 nodos y guarda en /tmp/conditions-resumen.txt una línea por nodo con su nombre y el status de la Condition Ready.
2. Identifica el pod de calico-node correspondiente a cka-worker1 y guarda su nombre en /tmp/calico-worker1.txt.
3. Identifica el pod de kube-proxy correspondiente a cka-worker2 y guarda su nombre en /tmp/kubeproxy-worker2.txt.
4. Desde un pod cualquiera, obtén la tabla de rutas del nodo donde corre, vía un pod con `hostNetwork: true` y `nsenter`, o directamente por SSH, y guarda las líneas que mencionen rangos 192.168 en /tmp/rutas-pods.txt.

Criterios de éxito:

```bash exec
cat /tmp/conditions-resumen.txt
cat /tmp/calico-worker1.txt
cat /tmp/kubeproxy-worker2.txt
cat /tmp/rutas-pods.txt
```

Solución de referencia, no mirar hasta terminar:

```bash exec
for nodo in cka-cp1 cka-worker1 cka-worker2; do
  estado=$(kubectl get node $nodo -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')
  echo "$nodo: $estado" >> /tmp/conditions-resumen.txt
done

kubectl get pods -n kube-system -o wide | grep calico-node | grep cka-worker1 | awk '{print $1}' > /tmp/calico-worker1.txt

kubectl get pods -n kube-system -o wide | grep kube-proxy | grep cka-worker2 | awk '{print $1}' > /tmp/kubeproxy-worker2.txt

ip route | grep 192.168 > /tmp/rutas-pods.txt
```

## 10. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Este módulo depende directamente de tener múltiples nodos reales, control plane y 2 workers, con acceso SSH a cada uno, para poder aislar un problema a un nodo específico frente a un problema general del cluster.

**Alternativa K3s (plan B):** con un único nodo, la mayoría de los escenarios de este módulo, conectividad entre nodos, kube-proxy desincronizado en un nodo específico, no se pueden reproducir de forma realista. Las Conditions del nodo, DiskPressure, MemoryPressure, y el mecanismo de taints automáticos siguen siendo idénticos y sí se pueden practicar en K3s single-node.

---

**Siguiente módulo:** M17 - Troubleshooting: Aplicaciones y Storage