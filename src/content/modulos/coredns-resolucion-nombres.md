---
code: M13
order: 13
slug: coredns-resolucion-nombres
title: CoreDNS y resolución de nombres
description: Entiende cómo CoreDNS resuelve nombres de Services y pods, las convenciones DNS del cluster, el Corefile, y cómo diagnosticar fallos de resolución.
access: free
updated: "2026-09-08"
prerequisites: [arquitectura-kubernetes, workloads-deployments-daemonsets-statefulsets, services-kube-proxy]
---

## 1. Resumen técnico

Este módulo cubre CoreDNS, el servidor DNS que permite a los pods encontrarse entre sí por nombre en lugar de por IP. Complementa a M10: un Service da una IP estable, pero necesitas un mecanismo para descubrir esa IP sin codificarla a mano en cada aplicación; ese mecanismo es CoreDNS. Cubre cómo se despliega, cómo los pods lo descubren automáticamente, las convenciones de nombres, y el fichero de configuración, el Corefile, que controla su comportamiento.

## 2. Peso en el examen y preguntas típicas

20% del examen, dominio Services & Networking. Preguntas típicas:

- Resuelve el nombre DNS de un Service desde otro pod, con el nombre corto y con el FQDN completo.
- Un pod no puede resolver nombres, diagnostica la causa.
- CoreDNS está en CrashLoopBackOff, diagnostica y corrige.
- Modifica el Corefile para agregar un forward personalizado.
- Explica la diferencia de resolución DNS entre un Service normal y un Service headless.

## 3. Prerrequisitos

De [M02 (Arquitectura)](/modulos/arquitectura-kubernetes/) usarás el mecanismo de watch contra el apiserver, el mismo patrón que CoreDNS usa para mantener sus registros DNS sincronizados con los Services y Endpoints reales del cluster.

De [M07 (Workloads)](/modulos/workloads-deployments-daemonsets-statefulsets/) usarás el Headless Service que creaste para el StatefulSet, cuya resolución DNS individual por pod se profundiza aquí.

De [M10 (Services)](/modulos/services-kube-proxy/) usarás la ClusterIP como el destino real al que CoreDNS traduce un nombre de Service.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Explicar cómo un pod descubre la dirección de CoreDNS sin configuración manual.
2. Construir el nombre DNS completo, FQDN, de cualquier Service y de cualquier pod de un StatefulSet.
3. Leer y modificar el Corefile para cambiar el comportamiento de resolución.
4. Explicar la diferencia entre los valores de dnsPolicy.
5. Diagnosticar un pod que no puede resolver nombres, distinguiendo un problema de CoreDNS de un problema de red.
6. Diagnosticar y resolver un CoreDNS en CrashLoopBackOff por loop de resolución.

## 5. Explicación teórica progresiva

### 5.1 Qué es CoreDNS y cómo se despliega

CoreDNS es el servidor DNS que kubeadm instala por defecto como addon, junto con el CNI, al inicializar el cluster, tal como viste en M03. A diferencia de kube-proxy, que corre como DaemonSet, un pod por nodo, CoreDNS corre como Deployment, típicamente con 2 réplicas, sin importar cuántos nodos tenga el cluster. Esta diferencia tiene sentido con lo visto en M07: kube-proxy necesita existir en CADA nodo porque programa reglas locales de ese nodo específico; CoreDNS es un servicio de resolución centralizado, cualquier réplica puede responder cualquier consulta, así que se beneficia del modelo de Deployment, réplicas intercambiables balanceadas por un Service, en lugar del modelo de DaemonSet.

### 5.2 El Service kube-dns y cómo los pods lo descubren

CoreDNS se expone mediante un Service llamado `kube-dns`, nombre histórico mantenido por compatibilidad aunque el servidor real sea CoreDNS y no el antiguo kube-dns que reemplazó desde Kubernetes 1.13. Este Service tiene una ClusterIP fija, típicamente `10.96.0.10` en un cluster kubeadm con el rango de Services por defecto.

Todo pod, salvo que se configure lo contrario, recibe automáticamente un `/etc/resolv.conf` que apunta a esa IP como su servidor de nombres. Este comportamiento lo controla el campo `dnsPolicy` del pod, con el valor `ClusterFirst` como default: primero intenta resolver contra CoreDNS, y si el nombre no pertenece al dominio del cluster, CoreDNS reenvía la consulta hacia un resolutor externo, configurado en el Corefile.

### 5.3 Convenciones de nombres DNS

Un Service recibe un nombre DNS con el patrón `<nombre-service>.<namespace>.svc.cluster.local`. Dentro del mismo namespace que el pod que consulta, el nombre corto, sin namespace ni sufijo, ya resuelve correctamente, gracias a los dominios de búsqueda, search domains, que Kubernetes agrega automáticamente al `/etc/resolv.conf` de cada pod. Desde otro namespace, hace falta al menos `<nombre-service>.<namespace>`, como ya viste en M12.

Un pod individual detrás de un Headless Service, visto en M07, recibe además su propio registro DNS individual, con el patrón `<nombre-pod>.<nombre-service>.<namespace>.svc.cluster.local`, resolviendo directamente a la IP de ESE pod específico, no a un balanceo entre varios.

### 5.4 El Corefile

CoreDNS se configura mediante un fichero llamado Corefile, montado en el cluster como el ConfigMap `coredns`, en el namespace kube-system. Cada bloque del Corefile encadena plugins que procesan la consulta DNS en orden.

Los plugins relevantes que trae la configuración por defecto de kubeadm son los siguientes. `errors` registra errores en los logs del pod. `health` y `ready` exponen endpoints de liveness y readiness probes para el propio CoreDNS. `kubernetes` es el plugin central: consulta al apiserver, vía watch, exactamente el mismo mecanismo visto en M02, para resolver nombres de Services y pods del cluster. `prometheus` expone métricas. `forward` reenvía hacia un resolutor externo, por defecto usando el `/etc/resolv.conf` del propio nodo, las consultas que no pertenecen al dominio del cluster. `cache` cachea respuestas para reducir carga. `loop` detecta bucles de reenvío, tema central del troubleshooting de este módulo. `reload` permite aplicar cambios al Corefile sin reiniciar el pod. `loadbalance` baraja el orden de las respuestas A para repartir carga entre registros múltiples.

### 5.5 dnsPolicy y dnsConfig

El campo `dnsPolicy` de un pod controla de dónde saca su configuración de resolución. `ClusterFirst`, el valor por defecto, usa CoreDNS como resolutor principal para nombres del cluster, y reenvía el resto. `Default`, un nombre confuso a propósito de evitar en el examen, en realidad significa heredar el `/etc/resolv.conf` del NODO donde corre el pod, ignorando a CoreDNS por completo. `ClusterFirstWithHostNet` es la variante de ClusterFirst para pods que usan `hostNetwork: true`. `None` ignora toda configuración automática, y exige definir manualmente el campo `dnsConfig`, con nameservers, searches y options propios.

## 6. Diagrama ASCII - flujo de resolución DNS

```text reference
  Pod hace: wget http://backend
  (namespace: netpol-lab, dnsPolicy: ClusterFirst)
       |
       v
  /etc/resolv.conf del pod (generado automaticamente):
    nameserver 10.96.0.10
    search netpol-lab.svc.cluster.local svc.cluster.local
           cluster.local
    options ndots:5

  "backend" tiene menos de 5 puntos (ndots:5), asi que
  se intenta CON los search domains agregados, en orden,
  antes de probarlo como nombre absoluto:

    backend.netpol-lab.svc.cluster.local  -> CONSULTA 1
       |
       v
  +---------------------------------------------+
  |              CORE-DNS (Deployment)            |
  |                                               |
  |  plugin kubernetes: consulta al apiserver     |
  |  (watch, igual que en M02) por el Service     |
  |  "backend" en el namespace "netpol-lab"       |
  |                                               |
  |  ENCONTRADO -> responde con la ClusterIP      |
  |  del Service                                  |
  +-------------------|--------------------------+
                       v
              10.96.45.2 (ClusterIP de "backend")
                       |
                       v
         kube-proxy enruta hacia los pods reales
         (mismo flujo visto en M10)
```

## 7. Ejemplos prácticos desplegables

### 7.1 Ver CoreDNS y su Service

```bash exec
kubectl get deployment coredns -n kube-system
kubectl get svc kube-dns -n kube-system
```

```text output
NAME      READY   UP-TO-DATE   AVAILABLE
coredns   2/2     2            2

NAME       TYPE        CLUSTER-IP   PORT(S)
kube-dns   ClusterIP   10.96.0.10   53/UDP,53/TCP,9153/TCP
```

Confirmar que CoreDNS corre como Deployment, no como DaemonSet, según lo explicado en 5.1:

```bash exec
kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide
```

```text output
NAME                       READY   STATUS    NODE
coredns-6f9c8d7b5-4kxlq    1/1     Running   cka-cp1
coredns-6f9c8d7b5-9p2wr    1/1     Running   cka-cp1
```

Ambas réplicas pueden caer en el mismo nodo; a diferencia de un DaemonSet, no hay garantía de una por nodo.

### 7.2 Resolver un Service, nombre corto y FQDN

```bash exec
kubectl create namespace dns-lab
kubectl create deployment web-dns --image=nginx:1.25 -n dns-lab
kubectl expose deployment web-dns --port=80 -n dns-lab

kubectl run dns-client --image=busybox --restart=Never -n dns-lab -- sleep 3600
```

```bash exec
kubectl exec -n dns-lab dns-client -- nslookup web-dns
kubectl exec -n dns-lab dns-client -- nslookup web-dns.dns-lab.svc.cluster.local
```

```text output
Server:    10.96.0.10
Address:   10.96.0.10:53

Name:   web-dns.dns-lab.svc.cluster.local
Address: 10.96.77.3

Server:    10.96.0.10
Address:   10.96.0.10:53

Name:   web-dns.dns-lab.svc.cluster.local
Address: 10.96.77.3
```

Ambas resuelven al mismo resultado; el nombre corto funciona gracias a los search domains.

### 7.3 Ver el resolv.conf real de un pod

```bash exec
kubectl exec -n dns-lab dns-client -- cat /etc/resolv.conf
```

```text output
nameserver 10.96.0.10
search dns-lab.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

El valor `ndots:5` explica por qué una consulta a un dominio externo, como `google.com`, con un solo punto, menos de 5, prueba primero cada search domain antes de intentarse como nombre absoluto, agregando latencia perceptible en aplicaciones que hacen muchas llamadas a servicios externos.

### 7.4 Ver y editar el Corefile

```bash exec
kubectl get configmap coredns -n kube-system -o yaml
```

```text output
apiVersion: v1
data:
  Corefile: |
    .:53 {
        errors
        health {
           lameduck 5s
        }
        ready
        kubernetes cluster.local in-addr.arpa ip6.arpa {
           pods insecure
           fallthrough in-addr.arpa ip6.arpa
           ttl 30
        }
        prometheus :9153
        forward . /etc/resolv.conf {
           max_concurrent 1000
        }
        cache 30
        loop
        reload
        loadbalance
    }
kind: ConfigMap
metadata:
  name: coredns
  namespace: kube-system
```

Agregar un dominio personalizado que reenvíe hacia un servidor DNS interno específico de la organización:

```bash exec
kubectl edit configmap coredns -n kube-system
```

Dentro del editor, agregar un bloque nuevo antes del cierre del bloque `.:53`:

```text reference
    interno.corp:53 {
        forward . 10.0.0.53
    }
```

Guardar y forzar que CoreDNS relea la configuración, ya que el plugin `reload` la detecta automáticamente en unos segundos, pero se puede acelerar reiniciando los pods:

```bash exec
kubectl rollout restart deployment coredns -n kube-system
```

### 7.5 Resolución cross-namespace

```bash exec
kubectl create namespace dns-lab-otro
kubectl run cliente-cruzado --image=busybox --restart=Never -n dns-lab-otro -- sleep 3600
```

```bash exec
kubectl exec -n dns-lab-otro cliente-cruzado -- nslookup web-dns
```

```text output
** server can't find web-dns: NXDOMAIN
```

Falla porque el search domain de este pod es `dns-lab-otro.svc.cluster.local`, no `dns-lab.svc.cluster.local`; el nombre corto solo funciona dentro del mismo namespace.

```bash exec
kubectl exec -n dns-lab-otro cliente-cruzado -- nslookup web-dns.dns-lab
```

```text output
Name:   web-dns.dns-lab.svc.cluster.local
Address: 10.96.77.3
```

Con el namespace incluido explícitamente, resuelve sin problema, sin necesitar el FQDN completo.

### 7.6 DNS para StatefulSet headless

Retomando el StatefulSet y el Headless Service de M07:

```bash exec
kubectl exec dns-client -n dns-lab -- nslookup web-stateful-0.web-headless.default.svc.cluster.local
```

Si el StatefulSet de M07 ya fue eliminado en la limpieza de ese módulo, recrearlo siguiendo los pasos de esa sección antes de este ejercicio. El resultado esperado es la IP individual de ESE pod concreto, no una IP compartida entre las 3 réplicas.

## 8. Laboratorio guiado

Objetivo: diagnosticar y resolver el caso de troubleshooting más citado de CoreDNS en producción: un loop de resolución que provoca CrashLoopBackOff.

Paso 1, entender la causa antes de reproducirla. El plugin `loop`, visto en 5.4, detecta cuando CoreDNS reenvía una consulta hacia sí mismo indefinidamente, típicamente porque el `/etc/resolv.conf` del NODO, no del pod, apunta de vuelta a la IP del propio CoreDNS, por ejemplo si el nodo usa `systemd-resolved` con una configuración de loopback local mal propagada al contenedor de CoreDNS.

Paso 2, verificar el estado normal antes de cualquier cambio:

```bash exec
kubectl get pods -n kube-system -l k8s-app=kube-dns
```

```text output
NAME                       READY   STATUS
coredns-6f9c8d7b5-4kxlq    1/1     Running
coredns-6f9c8d7b5-9p2wr    1/1     Running
```

Paso 3, simular la causa raíz, forzando temporalmente que el Corefile reenvíe hacia la propia IP del Service kube-dns, un bucle directo:

```bash exec
kubectl get svc kube-dns -n kube-system -o jsonpath='{.spec.clusterIP}'
```

```bash exec
kubectl patch configmap coredns -n kube-system --type=json -p='[{"op":"replace","path":"/data/Corefile","value":".:53 {\n    errors\n    health\n    ready\n    kubernetes cluster.local in-addr.arpa ip6.arpa {\n       pods insecure\n       fallthrough in-addr.arpa ip6.arpa\n       ttl 30\n    }\n    forward . 10.96.0.10\n    cache 30\n    loop\n    reload\n    loadbalance\n}\n"}]'

kubectl rollout restart deployment coredns -n kube-system
```

Paso 4, observar el síntoma:

```bash exec
kubectl get pods -n kube-system -l k8s-app=kube-dns -w
```

```text output
NAME                       READY   STATUS             RESTARTS
coredns-7d8f9c6b4-x9012    0/1     CrashLoopBackOff    3
```

Ctrl+C para salir del watch.

Paso 5, diagnóstico paso a paso:

```bash exec
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=20
```

```text output
[FATAL] plugin/loop: Loop (127.0.0.1:56789 -> :53) detected for zone ".", see https://coredns.io/plugins/loop#troubleshooting. Query: "HINFO 4.3.2.1.in-addr.arpa."
```

El mensaje FATAL de `plugin/loop` es inequívoco: CoreDNS detectó que su propio `forward` termina reenviando la consulta de vuelta a sí mismo, y se detiene deliberadamente para evitar un bucle infinito de consultas.

Paso 6, corregir, restaurando un `forward` válido hacia el resolutor del nodo en lugar de hacia CoreDNS mismo:

```bash exec
kubectl patch configmap coredns -n kube-system --type=json -p='[{"op":"replace","path":"/data/Corefile","value":".:53 {\n    errors\n    health {\n       lameduck 5s\n    }\n    ready\n    kubernetes cluster.local in-addr.arpa ip6.arpa {\n       pods insecure\n       fallthrough in-addr.arpa ip6.arpa\n       ttl 30\n    }\n    prometheus :9153\n    forward . /etc/resolv.conf {\n       max_concurrent 1000\n    }\n    cache 30\n    loop\n    reload\n    loadbalance\n}\n"}]'

kubectl rollout restart deployment coredns -n kube-system
```

Paso 7, verificar la recuperación:

```bash exec
kubectl get pods -n kube-system -l k8s-app=kube-dns
```

```text output
NAME                       READY   STATUS
coredns-6f9c8d7b5-k2zxq    1/1     Running
coredns-6f9c8d7b5-n8p4t    1/1     Running
```

## 9. Checkpoint

**Pregunta 1**

¿Por qué CoreDNS corre como Deployment y no como DaemonSet, a diferencia de kube-proxy?

Respuesta: kube-proxy necesita existir en CADA nodo porque programa reglas de red locales de ese nodo específico. CoreDNS es un servicio de resolución centralizado, donde cualquier réplica puede responder cualquier consulta, así que se beneficia del modelo de réplicas intercambiables balanceadas por un Service, propio de Deployment.

**Pregunta 2**

¿Qué diferencia hay entre `dnsPolicy: ClusterFirst` y `dnsPolicy: Default`?

Respuesta: ClusterFirst, el valor por defecto, usa CoreDNS como resolutor principal para nombres del cluster. Default, pese al nombre, en realidad hereda el `/etc/resolv.conf` del NODO donde corre el pod, ignorando CoreDNS por completo.

**Pregunta 3**

Un pod en el namespace A intenta resolver `mi-servicio`, que existe en el namespace B. ¿Por qué falla, y cómo se corrige sin usar el FQDN completo?

Respuesta: falla porque los search domains automáticos del pod solo incluyen su propio namespace, A. Se corrige usando `mi-servicio.B`, que sí resuelve correctamente sin necesitar el FQDN completo con `.svc.cluster.local`.

**Pregunta 4**

¿Qué plugin del Corefile detecta y previene un bucle de reenvío de DNS, y qué mensaje exacto aparece en los logs cuando eso ocurre?

Respuesta: el plugin `loop`. El mensaje es del tipo `[FATAL] plugin/loop: Loop (...) detected for zone "."`.

**Pregunta 5**

¿Qué diferencia hay en la resolución DNS de un pod detrás de un Service normal frente a un pod detrás de un Headless Service?

Respuesta: con un Service normal, el nombre del Service resuelve a la ClusterIP compartida, balanceada entre todos los pods que coinciden con el selector. Con un Headless Service, cada pod obtiene además su propio registro DNS individual, `pod.service.namespace.svc.cluster.local`, resolviendo directamente a la IP de ese pod específico.

## 10. Laboratorio cronometrado

Objetivo: completar en menos de 12 minutos.

Tarea:

1. Crea el namespace dns-cronometrado con un Deployment app-dns, imagen nginx:1.25, y un Service en el puerto 80.
2. Crea un segundo namespace dns-cronometrado-b con un pod cliente, imagen busybox, comando sleep 3600.
3. Desde el cliente del segundo namespace, resuelve el nombre del Service del primer namespace usando la forma más corta posible, y guarda el resultado en /tmp/resolucion-corta.txt.
4. Guarda en /tmp/resolv-conf.txt el contenido completo de /etc/resolv.conf del pod cliente.
5. Guarda en /tmp/coredns-replicas.txt el número de réplicas READY del Deployment coredns.

Criterios de éxito:

```bash exec
cat /tmp/resolucion-corta.txt
cat /tmp/resolv-conf.txt
cat /tmp/coredns-replicas.txt
```

Solución de referencia, no mirar hasta terminar:

```bash exec
kubectl create namespace dns-cronometrado
kubectl create deployment app-dns --image=nginx:1.25 -n dns-cronometrado
kubectl expose deployment app-dns --port=80 -n dns-cronometrado

kubectl create namespace dns-cronometrado-b
kubectl run cliente --image=busybox --restart=Never -n dns-cronometrado-b -- sleep 3600

kubectl exec -n dns-cronometrado-b cliente -- nslookup app-dns.dns-cronometrado > /tmp/resolucion-corta.txt

kubectl exec -n dns-cronometrado-b cliente -- cat /etc/resolv.conf > /tmp/resolv-conf.txt

kubectl get deployment coredns -n kube-system -o jsonpath='{.status.readyReplicas}' > /tmp/coredns-replicas.txt
```

## 11. Troubleshooting - casos reales

### Caso 1: pod no resuelve ningún nombre, ni siquiera Services del propio namespace

**Síntoma:**

Cualquier `nslookup` o `wget` por nombre desde un pod falla con timeout o "server can't find", incluso para Services del mismo namespace.

Diagnóstico paso a paso:

```bash exec
kubectl exec -n dns-lab dns-client -- cat /etc/resolv.conf
```

Confirmar que el `nameserver` apunta a la ClusterIP real de `kube-dns`, no a una IP obsoleta o incorrecta.

```bash exec
kubectl get pods -n kube-system -l k8s-app=kube-dns
```

Confirmar que los pods de CoreDNS están Running; si están en CrashLoopBackOff, seguir el procedimiento del laboratorio guiado de este módulo.

```bash exec
kubectl exec -n dns-lab dns-client -- nslookup kubernetes.default
```

Probar la resolución de un nombre conocido y estable, el Service del propio apiserver, para descartar un problema general de red frente a un problema específico de un Service concreto.

**Solución:**

Si CoreDNS está caído, resolver esa causa raíz. Si CoreDNS está sano pero el `resolv.conf` del pod es incorrecto, revisar si el pod tiene `dnsPolicy: Default` en lugar de `ClusterFirst`, heredando la configuración del nodo en vez de usar CoreDNS.

### Caso 2: CoreDNS en CrashLoopBackOff por loop de resolución

**Síntoma:**

Ya cubierto en profundidad en la sección 8, laboratorio guiado. El mensaje clave es `[FATAL] plugin/loop: Loop (...) detected`.

**Solución:**

Restaurar el `forward` del Corefile hacia `/etc/resolv.conf`, la configuración por defecto, en lugar de hacia una IP que termine reenviando de vuelta a CoreDNS mismo.

### Caso 3: resolución lenta pero funcional hacia dominios externos

**Síntoma:**

Las conexiones hacia dominios externos, por ejemplo APIs de terceros, tardan varios segundos en resolver, aunque eventualmente funcionan.

Diagnóstico paso a paso:

```bash exec
kubectl exec -n dns-lab dns-client -- cat /etc/resolv.conf | grep ndots
```

```text output
options ndots:5
```

Con `ndots:5`, cualquier nombre con menos de 5 puntos, prácticamente cualquier dominio externo normal, se intenta primero contra cada uno de los search domains del cluster, generando varias consultas fallidas antes de probarlo como nombre absoluto.

**Solución:**

Para pods que hacen muchas llamadas a servicios externos, agregar un punto final al nombre de dominio en el código de la aplicación, `google.com.`, fuerza la resolución absoluta inmediata, o ajustar `dnsConfig` con un `ndots` menor si el pod usa `dnsPolicy: None`. No es un fallo de CoreDNS, es el comportamiento esperado del mecanismo de search domains combinado con ndots.

## 12. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Todos los ejemplos de este módulo funcionan igual en cualquier topología, ya que CoreDNS es un componente estándar independiente del número de nodos.

**Alternativa K3s (plan B):** K3s también instala CoreDNS por defecto, con la misma mecánica de Corefile, ConfigMap y Service `kube-dns`. La diferencia principal es que K3s puede traer un Corefile con configuración ligeramente distinta por defecto, orientada a su modelo single-binary; conviene revisar el ConfigMap real con `kubectl get configmap coredns -n kube-system -o yaml` antes de asumir que coincide exactamente con el de kubeadm.

Limpieza del módulo:

```bash exec
kubectl delete namespace dns-lab dns-lab-otro dns-cronometrado dns-cronometrado-b
```

---

**Siguiente módulo:** M14 - Storage: PV, PVC, StorageClass