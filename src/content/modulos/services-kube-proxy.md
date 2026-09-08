---
code: M10
order: 10
slug: services-kube-proxy
title: Services y kube-proxy
description: Domina los cuatro tipos de Service, Endpoints y EndpointSlices, y los tres modos de kube-proxy que traducen un Service en reglas reales de red.
access: free
updated: "2026-09-08"
prerequisites: [arquitectura-kubernetes, workloads-deployments-daemonsets-statefulsets]
---

## 1. Resumen técnico

Este módulo cubre cómo Kubernetes expone un conjunto de pods bajo una identidad de red estable: los cuatro tipos de Service, el rol de Endpoints y EndpointSlices, y el mecanismo real que hace funcionar todo esto en cada nodo, kube-proxy, incluidos sus tres modos de operación. Las IPs de los pods son efímeras, cambian en cada reinicio; un Service es la solución de Kubernetes a ese problema.

## 2. Peso en el examen y preguntas típicas

20% del examen, dominio Services & Networking. Preguntas típicas:

- Crea un Service ClusterIP que exponga un Deployment existente.
- Crea un Service NodePort en un puerto específico.
- Un Service no enruta tráfico a ningún pod, diagnostica por qué.
- Crea un Service sin selector, con Endpoints manuales, apuntando a un backend externo.
- Identifica en qué modo corre kube-proxy en este cluster.

## 3. Prerrequisitos

De [M02 (Arquitectura)](/modulos/arquitectura-kubernetes/) usarás el rol de kube-proxy como componente de cada nodo, y el hecho de que corre como DaemonSet, ya visto en M07.

De [M07 (Workloads)](/modulos/workloads-deployments-daemonsets-statefulsets/) usarás el Headless Service que ya creaste para el StatefulSet, un tipo especial de Service que se retoma aquí con más profundidad.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Explicar por qué los Services existen y qué problema resuelven frente a apuntar directamente a IPs de pods.
2. Crear y diferenciar los cuatro tipos de Service: ClusterIP, NodePort, LoadBalancer y ExternalName.
3. Explicar la relación entre un Service, sus Endpoints y sus EndpointSlices.
4. Identificar en qué modo corre kube-proxy en un cluster dado, y explicar las diferencias entre iptables, IPVS y nftables.
5. Crear un Service sin selector para exponer un backend externo al cluster.
6. Diagnosticar un Service que no enruta tráfico, distinguiendo un problema de selector de un problema de puerto.

## 5. Explicación teórica progresiva

### 5.1 Por qué existen los Services

Conexión con M07: viste que un pod eliminado y recreado por un Deployment recibe una IP NUEVA cada vez. Si otra aplicación necesitara hablar directamente con esa IP, se rompería en cada reinicio, cada rollout, cada escalado. Un Service resuelve esto dando una identidad de red ESTABLE, una IP virtual y un nombre DNS que no cambian, que enruta el tráfico hacia el conjunto de pods correcto en cada momento, sin importar cuántas veces esos pods hayan sido reemplazados.

Un Service selecciona sus pods destino mediante un `selector` de labels, exactamente el mismo mecanismo que usa un ReplicaSet para saber qué pods le pertenecen, pero aplicado aquí a enrutamiento de red en lugar de a conteo de réplicas.

### 5.2 Los cuatro tipos de Service

#### ClusterIP

El tipo por defecto. Asigna una IP virtual accesible SOLO dentro del cluster. Es el tipo correcto para comunicación entre servicios internos, por ejemplo un backend hablando con una base de datos, ninguno de los dos necesita ser accesible desde fuera.

#### NodePort

Además de la ClusterIP interna, abre un puerto fijo, por defecto en el rango 30000 a 32767, en TODOS los nodos del cluster. Cualquier tráfico que llegue a `IP-de-cualquier-nodo:puerto-asignado` se enruta hacia el Service, incluso si ese nodo no aloja ningún pod del Service. Es el mecanismo más simple para exponer una aplicación fuera del cluster en un laboratorio como el tuyo, sin depender de un load balancer externo.

#### LoadBalancer

Extiende NodePort pidiendo, además, un load balancer al proveedor cloud, que reparte tráfico externo hacia los NodePorts de los nodos. En un cluster bare-metal como el tuyo, sin proveedor cloud configurado, un Service LoadBalancer se queda con su `EXTERNAL-IP` en estado `<pending>` indefinidamente, porque no hay ningún controlador que sepa cómo aprovisionar ese load balancer.

#### ExternalName

No enruta tráfico de pods en absoluto. Es un alias DNS: mapea el nombre del Service a un nombre DNS externo mediante un registro CNAME, útil para que las aplicaciones del cluster usen un nombre interno consistente, `mi-servicio.default.svc.cluster.local`, mientras el backend real vive fuera del cluster y puede cambiar de dominio sin tocar la aplicación.

### 5.3 Endpoints y EndpointSlices

Un Service, por sí mismo, no sabe directamente qué pods existen; delega esa información en otro objeto. Endpoints es el objeto original de Kubernetes que lista las IPs y puertos de los pods que coinciden con el selector del Service. Desde la versión 1.19, Kubernetes usa internamente EndpointSlices, una versión más escalable del mismo concepto, que divide la lista en fragmentos, slices, para clusters con miles de pods por Service, evitando actualizar un único objeto gigante en cada cambio.

`kubectl get endpoints` sigue funcionando por compatibilidad y sigue siendo material de examen, pero `kubectl get endpointslices` muestra el objeto que realmente usa el cluster internamente. Un controller dedicado mantiene ambos sincronizados automáticamente con el estado real de los pods, siguiendo el mismo patrón de reconciliation loop visto en M02.

### 5.4 kube-proxy y sus modos

kube-proxy, el componente de M02 que corre en cada nodo como DaemonSet, es quien traduce la existencia de un Service y sus Endpoints en reglas reales del kernel de Linux que efectivamente mueven los paquetes. Sin kube-proxy, un Service sería solo un objeto en etcd sin ningún efecto sobre el tráfico de red.

kube-proxy soporta tres modos de operación, con un estado muy distinto entre sí en la versión de tu cluster.

#### iptables

El modo por defecto histórico, y el que sigue siendo el default en kubeadm salvo configuración explícita. Representa cada Service como un conjunto de reglas de iptables encadenadas; el ruleset generado crece de forma proporcional a la suma de Services más Endpoints del cluster, lo que puede volverse lento de sincronizar en clusters muy grandes.

#### IPVS

Un modo introducido para resolver los problemas de rendimiento de iptables en clusters grandes, usando el subsistema IP Virtual Server del kernel. En la versión de tu cluster, este modo está DEPRECADO desde Kubernetes 1.35: sigue funcionando pero kube-proxy emite una advertencia al iniciar en este modo, y no se recomienda para instalaciones nuevas.

#### nftables

El modo más nuevo, estable, GA, desde Kubernetes 1.33, pensado como reemplazo definitivo tanto de iptables como de IPVS a largo plazo. Resuelve los problemas de escalado de iptables usando el subsistema nftables del kernel, más moderno. A pesar de ser el modo técnicamente recomendado hoy, iptables sigue siendo el default en kubeadm; cambiar a nftables requiere configuración explícita.

Verificar en qué modo corre tu cluster:

```bash exec
kubectl get configmap kube-proxy -n kube-system -o yaml | grep mode
```

Recuerda también, de M02, que kube-proxy es OPCIONAL: algunos CNI, como Cilium en modo de reemplazo de kube-proxy, implementan el enrutamiento de Services por su cuenta y prescinden de kube-proxy por completo. En tu cluster con Calico, kube-proxy sigue siendo el componente activo.

### 5.5 Service sin selector

Un Service no está obligado a tener un `selector`. Cuando se omite, Kubernetes no gestiona los Endpoints automáticamente; hay que crearlos y mantenerlos manualmente, apuntando a IPs arbitrarias, dentro o fuera del cluster. Este patrón se usa para exponer un backend externo, una base de datos legacy fuera de Kubernetes, con el mismo nombre DNS interno consistente que usarías para un Service normal, de modo que las aplicaciones del cluster no necesitan saber si el backend real vive dentro o fuera de Kubernetes.

## 6. Diagrama ASCII - flujo de tráfico a través de un Service ClusterIP

```text reference
  Pod cliente hace:
  curl http://mi-servicio.default.svc.cluster.local
       |
       v (resolucion DNS, profundidad en el modulo de CoreDNS)
  ClusterIP del Service: 10.96.45.2
       |
       v
  +---------------------------------------------+
  |         REGLAS DE KUBE-PROXY EN EL NODO       |
  |         (iptables / IPVS / nftables)          |
  |                                               |
  |  Trafico a 10.96.45.2:80 se reescribe (DNAT)  |
  |  hacia una de las IPs reales de los pods      |
  |  listadas en el EndpointSlice del Service     |
  +-------------------|--------------------------+
                       v
       +---------------+---------------+
       |               |               |
   +---v----+      +---v----+      +---v----+
   | Pod A  |      | Pod B  |      | Pod C  |
   | (192.168.135.5)|(192.168.198.11)|(192.168.222.3)|
   +--------+      +--------+      +--------+

  El Service y su ClusterIP son ESTABLES.
  Los pods destino pueden cambiar de IP libremente
  (reinicios, rollouts, escalado); el EndpointSlice
  se actualiza automaticamente y kube-proxy reescribe
  sus reglas en consecuencia, sin que el cliente note
  ningun cambio.
```

## 7. Ejemplos prácticos desplegables

### 7.1 ClusterIP básico

```bash exec
kubectl create deployment web-svc-demo --image=nginx:1.25 --replicas=3

kubectl expose deployment web-svc-demo --port=80 --target-port=80 --name=web-svc-demo
```

```bash exec
kubectl get svc web-svc-demo
```

```text output
NAME             TYPE        CLUSTER-IP     PORT(S)
web-svc-demo     ClusterIP   10.96.45.2     80/TCP
```

Verificar los Endpoints y el EndpointSlice generados automáticamente:

```bash exec
kubectl get endpoints web-svc-demo
kubectl get endpointslices -l kubernetes.io/service-name=web-svc-demo
```

```text output
NAME             ENDPOINTS
web-svc-demo     192.168.135.5:80,192.168.198.11:80,192.168.222.3:80

NAME                     ADDRESSTYPE   PORTS
web-svc-demo-x7k2p       IPv4          80
```

Probar la resolución desde otro pod:

```bash exec
kubectl run test-client --image=busybox --restart=Never -- sleep 3600
kubectl exec test-client -- wget -qO- web-svc-demo
```

```text output
<!DOCTYPE html>
<html>
<title>Welcome to nginx!</title>
...
```

### 7.2 NodePort

```bash exec
kubectl expose deployment web-svc-demo --port=80 --target-port=80 --type=NodePort --name=web-svc-nodeport
kubectl get svc web-svc-nodeport
```

```text output
NAME                TYPE       CLUSTER-IP    PORT(S)
web-svc-nodeport    NodePort   10.96.88.4    80:31245/TCP
```

Verificar acceso desde fuera del cluster, usando la IP de CUALQUIER nodo, no solo los que alojan pods del Deployment:

```bash exec
curl http://172.16.46.128:31245
curl http://172.16.46.130:31245
```

Ambas responden igual, kube-proxy enruta internamente hacia un pod válido sin importar a qué nodo llegó la petición.

### 7.3 LoadBalancer, comportamiento esperado en bare-metal

```bash exec
kubectl expose deployment web-svc-demo --port=80 --target-port=80 --type=LoadBalancer --name=web-svc-lb
kubectl get svc web-svc-lb
```

```text output
NAME           TYPE           CLUSTER-IP    EXTERNAL-IP   PORT(S)
web-svc-lb     LoadBalancer   10.96.12.9    <pending>     80:31890/TCP
```

`<pending>` indefinido es el comportamiento correcto en este laboratorio, no un fallo: no hay ningún cloud provider que aprovisione el load balancer. El Service sigue siendo utilizable vía su NodePort autogenerado mientras tanto.

### 7.4 Service sin selector, backend externo

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: db-externa
spec:
  ports:
  - port: 5432
    targetPort: 5432
EOF
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Endpoints
metadata:
  name: db-externa
subsets:
- addresses:
  - ip: 172.16.46.200
  ports:
  - port: 5432
EOF
```

El nombre del objeto Endpoints DEBE coincidir exactamente con el nombre del Service para que Kubernetes los asocie; no hay ningún otro vínculo declarado entre ambos.

```bash exec
kubectl get svc db-externa
kubectl get endpoints db-externa
```

```text output
NAME          TYPE        CLUSTER-IP     PORT(S)
db-externa    ClusterIP   10.96.201.7    5432/TCP

NAME          ENDPOINTS
db-externa    172.16.46.200:5432
```

Cualquier pod del cluster ahora puede conectarse a `db-externa:5432`, sin saber que el backend real vive fuera de Kubernetes.

### 7.5 Inspeccionar las reglas reales de kube-proxy

Conexión con 5.4, ver el efecto físico de un Service en el nodo:

```bash exec
kubectl get configmap kube-proxy -n kube-system -o yaml | grep mode
```

```text output
mode: "iptables"
```

Si el modo es iptables, inspeccionar las reglas generadas para el Service de 7.1, ejecutar en cualquier nodo:

```bash exec
sudo iptables -t nat -L KUBE-SERVICES | grep web-svc-demo
```

```text output
KUBE-SVC-XYZ123  tcp  --  anywhere  10.96.45.2  /* default/web-svc-demo */ tcp dpt:http
```

Esta regla es la traducción física del Service: cualquier paquete dirigido a 10.96.45.2:80 se redirige hacia una cadena adicional que reparte el tráfico entre las IPs reales de los pods listadas en el EndpointSlice.

## 8. Laboratorio guiado

Objetivo: diagnosticar un Service que no enruta tráfico, el escenario de troubleshooting más frecuente de este dominio en el examen.

Paso 1, crear un Deployment y un Service con un selector que NO coincide, error deliberado y muy común en la práctica real:

```bash exec
kubectl create deployment app-mal-conectada --image=nginx:1.25 --replicas=2
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: svc-mal-conectado
spec:
  selector:
    app: nombre-incorrecto
  ports:
  - port: 80
    targetPort: 80
EOF
```

Paso 2, observar el síntoma:

```bash exec
kubectl get endpoints svc-mal-conectado
```

```text output
NAME                 ENDPOINTS
svc-mal-conectado    <none>
```

Paso 3, diagnóstico paso a paso. Un Service con Endpoints vacío, `<none>`, casi siempre significa que el selector del Service no coincide con ninguna label de ningún pod, distinto de un Service cuyos Endpoints existen pero el cliente igualmente no puede conectar, que apunta a un problema de puerto o de red en lugar de selector.

```bash exec
kubectl get svc svc-mal-conectado -o jsonpath='{.spec.selector}'
```

```text output
{"app":"nombre-incorrecto"}
```

```bash exec
kubectl get deployment app-mal-conectada -o jsonpath='{.spec.template.metadata.labels}'
```

```text output
{"app":"app-mal-conectada"}
```

Las labels no coinciden: el Service busca `app=nombre-incorrecto`, y los pods reales tienen `app=app-mal-conectada`.

Paso 4, corregir:

```bash exec
kubectl patch service svc-mal-conectado --type=json -p='[{"op":"replace","path":"/spec/selector","value":{"app":"app-mal-conectada"}}]'
```

Paso 5, verificar la recuperación:

```bash exec
kubectl get endpoints svc-mal-conectado
```

```text output
NAME                 ENDPOINTS
svc-mal-conectado    192.168.135.9:80,192.168.198.14:80
```

## 9. Checkpoint

**Pregunta 1**

¿Qué problema resuelve un Service que apuntar directamente a la IP de un pod no resuelve?

Respuesta: la IP de un pod es efímera, cambia cada vez que el pod se reinicia, se reprograma o se reemplaza en un rollout. Un Service da una identidad de red estable, IP virtual y nombre DNS, que no cambia sin importar cuántas veces los pods destino hayan sido reemplazados.

**Pregunta 2**

Creaste un Service tipo LoadBalancer en tu cluster bare-metal y su EXTERNAL-IP se queda en `<pending>` indefinidamente. ¿Es un error?

Respuesta: no. Es el comportamiento esperado: no hay ningún cloud provider en este cluster que sepa aprovisionar el load balancer solicitado. El Service sigue siendo accesible vía su NodePort autogenerado mientras tanto.

**Pregunta 3**

¿Cuál es el modo de kube-proxy técnicamente recomendado hoy, y cuál sigue siendo el default en kubeadm?

Respuesta: nftables es GA desde Kubernetes 1.33 y es el reemplazo recomendado a largo plazo, especialmente porque IPVS quedó deprecado en la versión 1.35. Sin embargo, iptables sigue siendo el modo por defecto en kubeadm salvo que se configure explícitamente otro modo.

**Pregunta 4**

Un Service tiene Endpoints con `<none>`. ¿Qué revisas primero?

Respuesta: comparar el campo selector del Service contra las labels reales del template del Deployment o del pod destino; casi siempre el problema es que no coinciden exactamente.

**Pregunta 5**

¿Qué campo vincula un objeto Endpoints manual con su Service correspondiente?

Respuesta: el `metadata.name` de ambos objetos debe coincidir exactamente; no existe ningún otro campo de referencia explícita entre un Service y sus Endpoints.

## 10. Laboratorio cronometrado

Objetivo: completar en menos de 12 minutos.

Tarea:

1. Crea un Deployment api-backend con imagen nginx:1.25 y 3 réplicas.
2. Expón api-backend con un Service ClusterIP llamado api-backend-svc en el puerto 8080 hacia el puerto 80 del contenedor.
3. Expón el mismo Deployment con un segundo Service tipo NodePort llamado api-backend-nodeport en el puerto 80.
4. Crea un Service sin selector llamado legado-svc en el puerto 3306, con un Endpoints manual apuntando a la IP 172.16.46.201.
5. Guarda en /tmp/endpoints-count.txt el número de Endpoints de api-backend-svc.
6. Guarda en /tmp/nodeport.txt el NodePort asignado automáticamente a api-backend-nodeport.

Criterios de éxito:

```bash exec
kubectl get svc api-backend-svc api-backend-nodeport legado-svc
cat /tmp/endpoints-count.txt
cat /tmp/nodeport.txt
```

```text output
NAME                    TYPE        CLUSTER-IP     PORT(S)
api-backend-svc         ClusterIP   10.96.55.1     8080/TCP
api-backend-nodeport    NodePort    10.96.55.2     80:31500/TCP
legado-svc              ClusterIP   10.96.55.3     3306/TCP

3

31500
```

Solución de referencia, no mirar hasta terminar:

```bash exec
kubectl create deployment api-backend --image=nginx:1.25 --replicas=3

kubectl expose deployment api-backend --port=8080 --target-port=80 --name=api-backend-svc

kubectl expose deployment api-backend --port=80 --target-port=80 --type=NodePort --name=api-backend-nodeport

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: legado-svc
spec:
  ports:
  - port: 3306
    targetPort: 3306
EOF

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Endpoints
metadata:
  name: legado-svc
subsets:
- addresses:
  - ip: 172.16.46.201
  ports:
  - port: 3306
EOF

kubectl get endpoints api-backend-svc -o jsonpath='{.subsets[0].addresses}' | grep -o '"ip"' | wc -l > /tmp/endpoints-count.txt

kubectl get svc api-backend-nodeport -o jsonpath='{.spec.ports[0].nodePort}' > /tmp/nodeport.txt
```

## 11. Troubleshooting - casos reales

### Caso 1: Endpoints vacío pese a que el Deployment tiene pods Running

**Síntoma:**

`kubectl get endpoints nombre-svc` muestra `<none>`, aunque `kubectl get pods` confirma que hay pods Running que deberían ser el destino.

Diagnóstico paso a paso:

```bash exec
kubectl get svc nombre-svc -o jsonpath='{.spec.selector}'
kubectl get pods --show-labels
```

Comparar el selector del Service, campo por campo, contra las labels reales de los pods. Un error de escritura, mayúscula distinta, o un valor de label distinto, aunque sea uno solo, hace que el selector no coincida con ningún pod.

**Solución:**

Corregir el selector del Service, o corregir las labels del Deployment, para que coincidan exactamente. Recordar que RBAC y los selectors son ambos case-sensitive.

### Caso 2: Endpoints correctos pero el cliente no puede conectar

**Síntoma:**

`kubectl get endpoints` muestra IPs y puertos válidos, pero un cliente dentro del cluster recibe connection refused o timeout al intentar conectarse al Service.

Diagnóstico paso a paso:

```bash exec
kubectl get svc nombre-svc -o jsonpath='{.spec.ports}'
```

Comparar `targetPort` del Service contra el puerto real en el que escucha la aplicación dentro del contenedor, no el puerto del Service mismo. Un error común es exponer el Service en el puerto correcto pero apuntar `targetPort` al puerto equivocado del contenedor.

El siguiente comando se ejecuta sustituyendo el nombre real del pod destino:

```text reference
kubectl exec -it <pod-destino> -- netstat -tlnp
```

Confirmar en qué puerto escucha realmente el proceso dentro del pod.

**Solución:**

Corregir `targetPort` en el Service para que coincida con el puerto real de escucha de la aplicación dentro del contenedor.

### Caso 3: kube-proxy no está aplicando las reglas esperadas

**Síntoma:**

El Service y sus Endpoints se ven correctos en la API, pero el tráfico igualmente no llega a los pods, incluso desde dentro del mismo nodo.

Diagnóstico paso a paso:

```bash exec
kubectl get pods -n kube-system -l k8s-app=kube-proxy -o wide
```

Confirmar que el pod de kube-proxy en el nodo relevante está Running.

```bash exec
kubectl logs -n kube-system -l k8s-app=kube-proxy --tail=50
```

Revisar si hay errores de sincronización de reglas.

```bash exec
kubectl get configmap kube-proxy -n kube-system -o yaml | grep mode
```

Confirmar el modo configurado, y verificar con el comando correspondiente, `iptables -t nat -L`, o la herramienta equivalente para IPVS o nftables, que las reglas realmente existen en ese nodo.

**Solución:**

Si el pod de kube-proxy está en CrashLoopBackOff o Error, revisar sus logs para la causa exacta. Reiniciar el pod de kube-proxy en ese nodo suele forzar una resincronización completa de reglas si el problema fue una desincronización transitoria.

## 12. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. El ejemplo de NodePort de este módulo depende de tener múltiples nodos reales para demostrar que el puerto se abre en todos ellos, no solo en los que alojan pods del Deployment.

**Alternativa K3s (plan B):** Services, Endpoints y EndpointSlices son API estándar de Kubernetes y funcionan idéntico. K3s usa kube-proxy en modo iptables por defecto, igual que kubeadm. La diferencia relevante es que K3s en single-node hace menos evidente el valor de NodePort, ya que solo existe un nodo donde probar el puerto, y LoadBalancer se comporta igual en `<pending>` salvo que se use el ServiceLB integrado de K3s, que sí aprovisiona un load balancer simple usando las IPs de los propios nodos del cluster.

Limpieza del módulo:

```bash exec
kubectl delete deployment web-svc-demo app-mal-conectada api-backend
kubectl delete svc web-svc-demo web-svc-nodeport web-svc-lb db-externa svc-mal-conectado api-backend-svc api-backend-nodeport legado-svc
kubectl delete endpoints db-externa legado-svc
kubectl delete pod test-client
```

---

**Siguiente módulo:** M11 - Ingress y Exposición de Servicios