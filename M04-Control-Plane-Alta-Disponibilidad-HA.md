# M04 - Control Plane de Alta Disponibilidad (HA)

## 1. Resumen técnico

Este módulo cubre la teoría y los comandos exactos para convertir un control plane de un único nodo, como el de tu laboratorio, en un control plane de alta disponibilidad con múltiples réplicas. Es la competencia oficial "Implement and configure a highly-available control plane" del dominio de 25%. Tu cluster actual tiene 1 solo control plane, así que este módulo es principalmente conceptual, con los comandos reales documentados para cuando decidas practicarlo con una cuarta VM.

## 2. Prerrequisitos

De M02 (Arquitectura) usarás la regla de que solo kube-apiserver habla directamente con etcd, y el concepto de que etcd es un almacén distribuido y consistente, la base para entender el quorum de esta sección.

De M03 (kubeadm) usarás el mecanismo interno de `kubeadm init` y `kubeadm join`, ya que HA reutiliza ambos comandos con flags adicionales, sin cambiar su lógica de fondo.

## 3. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Explicar por qué un control plane de 1 solo nodo es un punto único de fallo, y qué se pierde exactamente si ese nodo cae.
2. Calcular el quorum de etcd para cualquier número de miembros, y explicar por qué el número mínimo útil es 3, no 2.
3. Distinguir la topología de etcd apilado (stacked) de la topología de etcd externo, y sus ventajas y desventajas.
4. Explicar el rol del load balancer frente a los apiservers.
5. Escribir de memoria los comandos de kubeadm necesarios para inicializar y unir un control plane HA.

## 4. Explicación teórica progresiva

### 4.1 Por qué HA

Con tu configuración actual, 1 solo control plane, si cka-cp1 cae, ocurren dos cosas distintas. Los pods que ya corrían en cka-worker1 y cka-worker2 SIGUEN corriendo, porque kubelet es autónomo y no depende del apiserver para mantener vivos los contenedores que ya arrancó. Pero no puedes crear, modificar ni reprogramar nada: sin apiserver no hay forma de hablar con el cluster, y si un pod muere en ese intervalo, ningún controller lo va a recrear. Además, con 1 solo miembro de etcd, esa caída significa perder también la única copia del estado del cluster.

Con 3 control planes, la API sobrevive a la caída de 1 nodo, y etcd mantiene quorum: 3 miembros toleran la pérdida de 1.

### 4.2 Por qué el número de control planes siempre es impar

El quorum de etcd se calcula como `(n/2)+1`, redondeando hacia abajo la división entera.

Con 1 miembro, el quorum es 1: no tolera ninguna pérdida, es tu situación actual.

Con 2 miembros, el quorum es 2: perder 1 de los 2 detiene el cluster igual que con 1 solo miembro, así que 2 no aporta ninguna ventaja real sobre 1, solo más superficie de fallo.

Con 3 miembros, el quorum es 2: toleras la pérdida de 1.

Con 5 miembros, el quorum es 3: toleras la pérdida de 2, pero con más latencia de escritura, porque cada escritura debe confirmarse en más nodos.

Por eso el mínimo útil siempre es 3, y los números pares nunca mejoran la tolerancia a fallos respecto al número impar inmediatamente inferior.

### 4.3 Las dos topologías

#### Etcd apilado, stacked etcd

Es la topología por defecto de kubeadm. etcd corre como static pod DENTRO de cada nodo de control plane, exactamente igual que el `etcd-cka-cp1` que ya conoces de M02 y M03, pero replicado en cada uno de los 3 nodos. Cada control plane tiene su propio miembro etcd local. Es más simple de operar, requiere menos máquinas, 3 en vez de 6, pero acopla los fallos: perder un nodo de control plane significa perder también un miembro de etcd al mismo tiempo.

#### Etcd externo

etcd corre en su propio cluster de 3 nodos, completamente separado de los nodos de control plane. Desacopla los fallos: perder un control plane no afecta a etcd. Requiere el doble de máquinas como mínimo, 3 para el control plane y 3 para etcd, 6 en total.

### 4.4 El rol del load balancer

Ningún cliente, ni kubectl, ni los kubelets, ni los controllers, puede apuntar a la IP de un control plane específico: si ese nodo cae, todo lo que apuntaba directamente a él pierde conexión. El load balancer da un endpoint estable frente a los 3 apiservers.

El flujo de una petición es: el cliente apunta al load balancer, por ejemplo en el puerto 6443; el load balancer hace health check contra los 3 apiservers; reenvía la petición al apiserver que esté sano, típicamente en round robin; ese apiserver responde con etcd exactamente igual que en un cluster de un solo nodo; la respuesta vuelve por el mismo camino.

Las opciones típicas de load balancer son HAProxy más keepalived en entornos on-premise como el tuyo, o el load balancer nativo del proveedor cloud cuando aplica.

### 4.5 Los comandos de kubeadm para HA

La diferencia clave frente al `kubeadm init` simple que usaste en M03 es el flag `--control-plane-endpoint`. Sin él, el cluster queda atado a la IP del primer control plane en sus certificados y kubeconfigs, y convertirlo en HA después requeriría regenerar certificados; kubeadm no automatiza esa migración. Por eso el flag se define desde el primer init, incluso si HA es solo una posibilidad futura.

`--control-plane-endpoint` define el endpoint estable, típicamente el load balancer, que usarán todos los clientes y los control planes adicionales. `--upload-certs` sube los certificados compartidos del cluster a un Secret cifrado dentro del propio cluster, para que los siguientes control planes los descarguen automáticamente en su join, en vez de tener que copiarlos a mano desde `/etc/kubernetes/pki/`.

La salida de un `kubeadm init` con estos flags incluye DOS comandos join distintos, y elegir el correcto es el detalle que evalúa el examen: uno para unir un control plane adicional, que lleva `--control-plane` y `--certificate-key`, y otro para unir un worker, idéntico al que ya usaste en M03, sin esos dos flags.

Si el `--certificate-key` expiró, dura 2 horas por defecto, se regenera con `kubeadm init phase upload-certs --upload-certs`. Si el token expiró, se regenera igual que en M03, con `kubeadm token create --print-join-command`.

## 5. Diagrama ASCII - topología stacked etcd

```text reference
             +------------------+
             |  Load Balancer   |   <- endpoint unico, puerto 6443
             |  (HAProxy, etc.) |      esto es --control-plane-endpoint
             +--------+---------+
                      |
      +---------------+----------------+
      |               |                |
  +---v----+      +---v----+      +---v----+
  |  cp1   |      |  cp2   |      |  cp3   |
  | apiserver     | apiserver     | apiserver
  | scheduler     | scheduler     | scheduler
  | ctrl-mgr      | ctrl-mgr      | ctrl-mgr
  | etcd (miembro)| etcd (miembro)| etcd (miembro)
  +--------+      +--------+      +--------+
      |               |                |
      +---------------+----------------+
        etcd forma un cluster de 3 miembros,
        quorum = 2, tolera perder 1 nodo

  Los workers, y kubectl, apuntan SIEMPRE al load
  balancer, nunca a la IP de un cp especifico.

QUORUM SEGUN NUMERO DE MIEMBROS DE ETCD:
  1 miembro  -> quorum 1  -> tolera perder 0
  2 miembros -> quorum 2  -> tolera perder 0 (inutil)
  3 miembros -> quorum 2  -> tolera perder 1
  5 miembros -> quorum 3  -> tolera perder 2
```

## 6. Ejemplos prácticos: lo que sí puedes verificar en tu cluster actual

Aunque tu cluster tiene 1 solo control plane, puedes inspeccionar el estado real de etcd y confirmar los conceptos de esta sección.

Ver el único miembro de etcd que existe hoy en tu cluster:

```bash exec
sudo ETCDCTL_API=3 etcdctl member list \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  --write-out=table
```

```text output
+------------------+---------+---------+---------------------------+
|        ID        | STATUS  |  NAME   |        PEER ADDRS         |
+------------------+---------+---------+---------------------------+
| 4a1b2c3d4e5f6a7b  | started | cka-cp1 | https://172.16.46.130:2380|
+------------------+---------+---------+---------------------------+
```

Con 1 solo miembro, el quorum es 1, exactamente lo explicado en 4.2: no hay margen para perder ningún nodo sin perder el cluster completo.

Confirmar que tu `kubeadm init` original NO usó `--control-plane-endpoint`, revisando el kubeconfig del admin:

```bash exec
grep server: /etc/kubernetes/admin.conf
```

```text output
    server: https://172.16.46.130:6443
```

La IP apunta directamente a cka-cp1, no a un load balancer. Esto confirma lo explicado en 4.5: como el cluster se inicializó sin ese flag, migrarlo a HA más adelante requeriría regenerar certificados, no es una operación soportada de forma directa por kubeadm.

## 7. Laboratorio guiado: plan de migración a HA

Objetivo: sin ejecutar los cambios reales, ya que requieren una cuarta VM que tu laboratorio no tiene, documentar el plan exacto de comandos que usarías, el mismo ejercicio de planificación que puede aparecer en el examen en forma de pregunta teórica.

Paso 1, si estuvieras planificando este cluster desde cero con HA en mente, el init original de M03 habría sido:

```yaml config
# Comando planeado, no ejecutar en este cluster:
# sudo kubeadm init \
#   --control-plane-endpoint "172.16.46.200:6443" \
#   --upload-certs
#
# 172.16.46.200 seria la IP del load balancer,
# no la de ningun nodo individual.
```

Paso 2, la salida de ese init habría mostrado dos comandos join distintos. El de control plane adicional:

```yaml config
# sudo kubeadm join 172.16.46.200:6443 \
#   --token <token-real-del-init> \
#   --discovery-token-ca-cert-hash sha256:<hash-real> \
#   --control-plane \
#   --certificate-key <key-real-del-init>
```

Y el de worker, sin cambios respecto a M03:

```yaml config
# sudo kubeadm join 172.16.46.200:6443 \
#   --token <token-real-del-init> \
#   --discovery-token-ca-cert-hash sha256:<hash-real>
```

Paso 3, verificación que ejecutarías tras unir los 3 control planes:

```bash exec
kubectl get nodes
sudo ETCDCTL_API=3 etcdctl member list \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

Esperarías 3 nodos con ROLES control-plane, y 3 miembros de etcd, todos en estado started.

## 8. Checkpoint

**Pregunta 1**

¿Por qué 3 control planes y no 2?

Respuesta: por el quorum de etcd, `(n/2)+1`. Con 2 miembros el quorum es 2, así que perder 1 detiene el cluster igual que con 1 solo miembro. Con 3, el quorum es 2 y sí toleras perder 1.

**Pregunta 2**

¿Qué hace `--upload-certs` y qué problema evita?

Respuesta: sube los certificados compartidos del cluster a un Secret cifrado, para que los nuevos control planes los descarguen automáticamente en su join, evitando copiar manualmente `/etc/kubernetes/pki/` entre nodos.

**Pregunta 3**

¿En qué se diferencia el join de un control plane del join de un worker?

Respuesta: el join de control plane agrega `--control-plane` y `--certificate-key`. El de worker no lleva ninguno de los dos.

**Pregunta 4**

Tu cluster se inicializó sin `--control-plane-endpoint`, y ahora quieres convertirlo a HA. ¿Cuál es el problema?

Respuesta: el cluster quedó atado a la IP del primer control plane, en certificados y kubeconfigs. Migrar a un endpoint de load balancer después requiere regenerar certificados y reconfigurar manualmente; kubeadm no automatiza esa migración. Por eso el flag se define desde el primer init si HA es una posibilidad futura.

**Pregunta 5**

¿Cuál es la diferencia principal entre etcd apilado y etcd externo?

Respuesta: en etcd apilado, cada nodo de control plane aloja también un miembro de etcd, acoplando ambos fallos con menos máquinas requeridas. En etcd externo, etcd corre en su propio cluster separado, desacoplando los fallos a costa de necesitar el doble de máquinas.

## 9. Laboratorio cronometrado

Objetivo: completar en menos de 10 minutos.

Tarea, sin ejecutar comandos destructivos en tu cluster real:

1. Calcula el quorum para clusters de etcd de 1, 3, 5 y 7 miembros, y guarda los cuatro valores en /tmp/quorums.txt, en ese orden, uno por línea.
2. Escribe en /tmp/comando-init-ha.txt el comando completo de `kubeadm init` que usarías para un cluster HA con load balancer en la IP 10.0.0.100.
3. Consulta el estado real del único miembro de etcd de tu cluster y guarda su STATUS en /tmp/estado-etcd-actual.txt.

Criterios de éxito:

```bash exec
cat /tmp/quorums.txt
cat /tmp/comando-init-ha.txt
cat /tmp/estado-etcd-actual.txt
```

```text output
1
2
3
4

kubeadm init --control-plane-endpoint "10.0.0.100:6443" --upload-certs

started
```

Solución de referencia, no mirar hasta terminar:

```bash exec
printf "1\n2\n3\n4\n" > /tmp/quorums.txt

echo 'kubeadm init --control-plane-endpoint "10.0.0.100:6443" --upload-certs' > /tmp/comando-init-ha.txt

sudo ETCDCTL_API=3 etcdctl member list \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  --write-out=json | grep -o '"status":"[a-z]*"' | head -1 > /tmp/estado-etcd-actual.txt
```

## 10. Troubleshooting - casos reales

### Caso 1: kubeadm join --control-plane falla por certificate-key expirado

**Síntoma:**

El comando `kubeadm join` con `--control-plane` falla, con un mensaje relacionado con certificados no encontrados o expirados.

Diagnóstico paso a paso:

`--certificate-key` expira 2 horas después del init original, o de la última vez que se regeneró. Si el join se intenta después de ese margen, el Secret cifrado que contenía los certificados compartidos ya no está disponible.

**Solución:**

Regenerar la clave desde cualquier control plane ya existente en el cluster:

```bash exec
sudo kubeadm init phase upload-certs --upload-certs
```

Usar la nueva clave que devuelve este comando en el `kubeadm join --control-plane` pendiente.

### Caso 2: los clientes siguen apuntando a un control plane específico tras migrar a HA

**Síntoma:**

Se completó la migración a 3 control planes, pero si cka-cp1 cae, kubectl deja de responder igualmente, como si HA no hubiera tenido efecto.

Diagnóstico paso a paso:

```bash exec
grep server: ~/.kube/config
```

**Solución:**

Si la salida muestra la IP de un nodo individual en vez de la del load balancer, el kubeconfig se generó o se copió antes de completar la migración a `--control-plane-endpoint`, o se copió directamente desde `/etc/kubernetes/admin.conf` de un nodo específico en vez de usar el endpoint del load balancer. Hay que regenerar o editar ese kubeconfig para que apunte al load balancer, no a un nodo individual.

### Caso 3: el load balancer envía tráfico a un apiserver caído

**Síntoma:**

Las peticiones son intermitentes: a veces responden, a veces se quedan colgadas, después de que uno de los 3 control planes dejó de estar disponible.

Diagnóstico paso a paso:

El load balancer necesita un health check activo contra cada apiserver para dejar de enviarle tráfico cuando cae; sin esa configuración, sigue repartiendo peticiones en round robin hacia un nodo que ya no responde.

**Solución:**

Revisar la configuración del load balancer, HAProxy o el que corresponda, confirmando que tiene un chequeo de salud contra el puerto 6443 de cada apiserver, con un intervalo razonable, y que retira automáticamente de la rotación a cualquier backend que falle ese chequeo.

## 11. Entorno requerido

Entorno principal: este módulo es teórico sobre tu cluster kubeadm de 1 control plane. La práctica completa de una migración real requiere una cuarta VM, opcional para este curso. Si la agregas, se puede generar un laboratorio guiado completo con el join real de un segundo control plane.

**Alternativa K3s (plan B):** K3s soporta HA de forma distinta y más simple de configurar: con `--cluster-init` en el primer servidor y `--server https://<primer-nodo>:6443` en los siguientes, usando un etcd embebido similar en espíritu al stacked etcd de kubeadm, pero sin necesitar los flags `--control-plane-endpoint` ni `--upload-certs` de forma explícita. Los conceptos de quorum de esta sección aplican igual, ya que K3s en modo HA también usa etcd por debajo, no SQLite.

---

**Siguiente módulo:** M05 - RBAC y Seguridad del Cluster