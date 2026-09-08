# M03 - kubeadm, Backup y Restore de etcd, Upgrade de Cluster

## 1. Resumen técnico

Este módulo cubre el ciclo de vida completo de un cluster Kubernetes gestionado con kubeadm: desde la preparación del sistema operativo hasta el upgrade entre versiones menores. kubeadm es la herramienta oficial para el bootstrapping de clusters Kubernetes: automatiza la generación de certificados TLS, el despliegue de los static pods del control plane que viste en M02, el RBAC inicial, y la unión de nodos worker. En el examen aparecen tareas de backup y restore de etcd, upgrade de control plane y workers, e inspección de certificados.

## 2. Prerrequisitos

De M02 (Arquitectura) usarás el concepto de static pods, el rol de cada componente del control plane, y la regla de que solo kube-apiserver habla directamente con etcd. Este módulo pone en práctica esa teoría con manifiestos y comandos reales.

## 3. Entorno de práctica

Cluster kubeadm de 3 nodos, Ubuntu 24.04.4 LTS: cka-cp1 (control-plane, 172.16.46.130), cka-worker1 (worker, 172.16.46.128), cka-worker2 (worker, 172.16.46.129). Versión de instalación: v1.35.5, con un ciclo de upgrade a v1.36 practicado en este módulo. CNI Calico.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Preparar un sistema operativo Ubuntu 24.04 para alojar un nodo de Kubernetes, explicando el propósito de cada ajuste.
2. Inicializar un control plane con kubeadm y explicar qué ocurre internamente en cada fase.
3. Unir workers al cluster y explicar el mecanismo de confianza detrás del token de bootstrap.
4. Realizar un backup y un restore de etcd en menos de 5 minutos.
5. Ejecutar el upgrade completo de un cluster, control plane primero y workers después, sin saltar versiones menores.
6. Inspeccionar certificados, kubeconfig y static pods reales para diagnosticar problemas del control plane.

## 5. Preparación del sistema operativo

Estos ajustes se ejecutan en los 3 nodos antes de instalar ningún componente de Kubernetes.

### 5.1 Módulos de kernel

overlay permite a containerd usar overlayfs como storage driver para las capas de las imágenes de contenedor. br_netfilter permite que iptables inspeccione tráfico que pasa por bridges de red, necesario para NetworkPolicy y kube-proxy.

```bash exec
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter
```

Verificación:

```bash exec
lsmod | grep overlay
lsmod | grep br_netfilter
```

### 5.2 Parámetros sysctl

```bash exec
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward = 1
EOF

sudo sysctl --system
```

`bridge-nf-call-iptables` y su equivalente para IPv6 hacen que el tráfico de los bridges de red pase por iptables. `ip_forward` permite al nodo reenviar paquetes entre interfaces, necesario para la comunicación pod a pod.

Validación:

```bash exec
sysctl net.bridge.bridge-nf-call-iptables
sysctl net.bridge.bridge-nf-call-ip6tables
sysctl net.ipv4.ip_forward
```

```text output
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward = 1
```

## 6. Instalación de containerd y kubetools

### 6.1 Scripts de instalación

Dos scripts automatizan esta parte, ejecutados en los 3 nodos en este orden.

`setup-container.sh` instala containerd desde GitHub releases, configura `SystemdCgroup = true`, obligatorio para que kubelet funcione correctamente, instala runc desde opencontainers, aplica un fix de apparmor específico de Ubuntu 24.04, instala crictl para inspección directa de contenedores, y crea `/tmp/container.txt` como flag de control para el siguiente script.

`setup-kubetools-previousversion.sh` verifica que el script anterior se ejecutó, detecta automáticamente la versión N-1 respecto a la última disponible, instala kubelet, kubeadm y kubectl en esa versión, marca los paquetes con `apt-mark hold` para evitar actualizaciones accidentales, deshabilita swap, requerido por kubelet, y configura crictl para usar el socket de containerd.

```bash exec
chmod +x setup-container.sh
chmod +x setup-kubetools-previousversion.sh

sudo ./setup-container.sh
sudo ./setup-kubetools-previousversion.sh
```

Verificación:

```bash exec
sudo systemctl status containerd
kubeadm version
kubelet --version
kubectl version --client
crictl version
sudo swapon --show
apt-mark showhold
```

```text output
active (running)

kubeadm version: &version.Info{GitVersion:"v1.35.5"...}
Kubernetes v1.35.5
Client Version: v1.35.5

crictl version v1.35.0

(sin salida, swap desactivado)

kubelet
kubeadm
kubectl
```

### 6.2 Por qué apt-mark hold es obligatorio

Los paquetes marcados con hold no se actualizan con `apt upgrade`. Sin esto, una actualización automática del sistema podría saltar directamente a una versión de Kubernetes varias releases por delante de la del cluster, algo que kubeadm no soporta: los upgrades deben hacerse de una versión menor a la siguiente, sin saltos.

## 7. Inicialización del cluster con kubeadm

### 7.1 Qué ocurre internamente en kubeadm init

kubeadm init despliega el control plane en un orden específico. Primero ejecuta preflight checks, verificando swap desactivado, puertos libres, containerd corriendo y permisos de root. Luego genera la CA del cluster y todos los certificados TLS derivados de ella en `/etc/kubernetes/pki/`. A continuación genera los ficheros kubeconfig para el administrador, kubelet, scheduler y controller-manager. Después despliega los static pods del control plane, los mismos que estudiaste en M02, escribiendo sus manifiestos en `/etc/kubernetes/manifests/`. Espera a que la API responda, configura el RBAC inicial, genera el token de bootstrap para los workers, e instala kube-proxy y CoreDNS como addons, ya como pods normales gestionados vía la API que en ese punto ya está operativa.

Ejecutar únicamente en cka-cp1:

```bash exec
sudo kubeadm init
```

Guarda toda la salida del comando: incluye el `kubeadm join` que necesitarás en la sección 7.3.

Configurar kubectl:

```bash exec
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

Verificación:

```bash exec
kubectl get nodes
kubectl get pods -n kube-system
```

```text output
NAME      STATUS     ROLES           VERSION
cka-cp1   NotReady   control-plane   v1.35.5

NAME                              READY   STATUS
etcd-cka-cp1                       1/1     Running
kube-apiserver-cka-cp1             1/1     Running
kube-controller-manager-cka-cp1    1/1     Running
kube-scheduler-cka-cp1             1/1     Running
coredns-...                        0/1     Pending
```

NotReady y CoreDNS en Pending son esperados en este punto: aún no hay CNI instalado.

### 7.2 Instalar Calico

```bash exec
kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml
```

```bash exec
watch kubectl get pods -n kube-system
```

Espera hasta que calico-node y calico-kube-controllers estén Running, y CoreDNS pase a Running. Ctrl+C para salir del watch.

```bash exec
kubectl get nodes
```

```text output
NAME      STATUS   ROLES           VERSION
cka-cp1   Ready    control-plane   v1.35.5
```

### 7.3 Unir los workers

Ejecutar en cka-worker1 y cka-worker2 el comando `kubeadm join` que apareció en la salida de la sección 7.1. Si se perdió, regenerarlo desde cka-cp1:

```bash exec
kubeadm token create --print-join-command
```

Verificación final desde cka-cp1:

```bash exec
kubectl get nodes -o wide
kubectl get pods -A
```

```text output
NAME          STATUS   ROLES           VERSION
cka-cp1       Ready    control-plane   v1.35.5
cka-worker1   Ready    <none>          v1.35.5
cka-worker2   Ready    <none>          v1.35.5
```

## 8. Inspección de certificados y static pods reales

### 8.1 Confirmar que un pod del control plane es un static pod, no un pod normal

Conexión con M02: viste que la prueba definitiva de un mirror pod es la anotación `kubernetes.io/config.mirror`, no `ownerReferences`.

```bash exec
kubectl get pod kube-apiserver-cka-cp1 -n kube-system -o yaml | grep config.mirror
```

```text output
kubernetes.io/config.mirror: 7a3f9c8e1b2d4a6f5e0c9d8b7a6f5e0c
```

El valor es un hash del manifiesto fuente; su presencia confirma que este pod es un mirror pod de un static pod real gestionado localmente por kubelet, no un objeto creado a través del apiserver.

```bash exec
sudo cat /etc/kubernetes/manifests/kube-apiserver.yaml
```

Revisa los flags de arranque del apiserver en la salida: `--advertise-address`, `--etcd-servers`, `--service-cluster-ip-range`, `--cluster-cidr`. Son útiles para el troubleshooting de esta sección.

### 8.2 Certificados

kubeadm gestiona todos los certificados del cluster en `/etc/kubernetes/pki/`, incluyendo la CA raíz, el certificado del apiserver, el certificado que usa el apiserver para hablar con kubelet, y los certificados de etcd en su propio subdirectorio.

```bash exec
sudo kubeadm certs check-expiration
```

Los certificados de kubeadm expiran al año de su emisión. El examen puede incluir una tarea de renovación:

```bash exec
sudo kubeadm certs renew all
```

## 9. Backup y restore de etcd

### 9.1 Por qué importa

etcd almacena todo el estado del cluster, tal como viste en M02. Si se corrompe o pierde datos sin backup, el cluster pierde su memoria completa. El backup y restore de etcd aparece con frecuencia en el examen y hay que ejecutarlo en menos de 5 minutos.

### 9.2 Instalar etcdctl

```bash exec
sudo apt install etcd-client
etcdctl version
```

```text output
etcdctl version: 3.4.30
API version: 3.4
```

### 9.3 Localizar los certificados de etcd

etcdctl necesita autenticarse contra etcd usando TLS. Los certificados están en `/etc/kubernetes/pki/etcd/`.

```bash exec
ls /etc/kubernetes/pki/etcd/
```

```text output
ca.crt
server.crt
server.key
```

### 9.4 Backup

```bash exec
sudo ETCDCTL_API=3 etcdctl snapshot save /opt/etcd-backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

Verificar que el backup es válido:

```bash exec
sudo ETCDCTL_API=3 etcdctl snapshot status /opt/etcd-backup.db --write-out=table
ls -lh /opt/etcd-backup.db
```

```text output
+----------+----------+------------+------------+
|   HASH   | REVISION | TOTAL KEYS | TOTAL SIZE |
+----------+----------+------------+------------+
| a1b2c3d4 |   4821   |    687     |   2.1 MB   |
+----------+----------+------------+------------+

-rw------- 1 root root 2.1M /opt/etcd-backup.db
```

### 9.5 Restore

etcd no puede restaurarse mientras está corriendo. Como corre como static pod, hay que moverlo temporalmente fuera de `/etc/kubernetes/manifests/` para que kubelet lo detenga.

Paso 1, crear los datos restaurados en una ruta nueva, sin sobreescribir etcd en caliente:

```bash exec
sudo ETCDCTL_API=3 etcdctl snapshot restore /opt/etcd-backup.db \
  --data-dir=/var/lib/etcd-restored
```

Paso 2, detener etcd moviendo su manifiesto:

```bash exec
sudo mv /etc/kubernetes/manifests/etcd.yaml /tmp/etcd.yaml
```

```bash exec
watch crictl ps
```

Espera hasta que etcd desaparezca de la lista. Ctrl+C para salir.

Paso 3, reemplazar el directorio de datos:

```bash exec
sudo mv /var/lib/etcd /var/lib/etcd-old
sudo mv /var/lib/etcd-restored /var/lib/etcd
```

Paso 4, restaurar el manifiesto:

```bash exec
sudo mv /tmp/etcd.yaml /etc/kubernetes/manifests/etcd.yaml
```

```bash exec
watch crictl ps
```

Espera hasta que etcd reaparezca como Running, puede tardar 1 a 2 minutos. Ctrl+C para salir.

Paso 5, verificar la recuperación completa del cluster:

```bash exec
kubectl get nodes
kubectl get pods -A
```

Si kubectl no responde de inmediato, espera unos 60 segundos: etcd necesita tiempo para inicializarse completamente antes de que el apiserver pueda conectarse.

## 10. Upgrade del cluster

### 10.1 Reglas del proceso

El upgrade de un cluster kubeadm sigue un orden estricto: primero el control plane, luego los workers, uno a la vez, y nunca saltando versiones menores. Al ejecutar `kubeadm upgrade apply`, kubeadm verifica compatibilidad, descarga las nuevas imágenes del control plane, actualiza sus static pods uno por uno, actualiza certificados y kubeconfig, y actualiza los addons kube-proxy y CoreDNS. El upgrade de kubelet y kubectl es un paso aparte porque son paquetes apt independientes, no gestionados por kubeadm.

Objetivo de este módulo: haz un upgrade del cluster de v1.35.5 a v1.36.

### 10.2 Haz un upgrade del control plane

En cka-cp1, actualizar el repositorio apt a la nueva versión:

```bash exec
sudo sed -i 's|stable:/v1.35|stable:/v1.36|g' /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
apt-cache madison kubeadm | grep 1.36 | head -5
```

Actualizar kubeadm:

```bash exec
sudo apt-mark unhold kubeadm
sudo apt-get install -y kubeadm=1.36.*
sudo apt-mark hold kubeadm
kubeadm version
```

Revisar el plan antes de ejecutarlo:

```bash exec
sudo kubeadm upgrade plan
```

Haz un upgrade del control plane:

```bash exec
sudo kubeadm upgrade apply v1.36.0
```

Drenar el nodo antes de actualizar kubelet:

```bash exec
kubectl drain cka-cp1 --ignore-daemonsets --delete-emptydir-data
```

Haz un upgrade de kubelet y kubectl:

```bash exec
sudo apt-mark unhold kubelet kubectl
sudo apt-get install -y kubelet=1.36.* kubectl=1.36.*
sudo apt-mark hold kubelet kubectl
sudo systemctl daemon-reload
sudo systemctl restart kubelet
```

Devolver el nodo a servicio:

```bash exec
kubectl uncordon cka-cp1
kubectl get nodes
```

```text output
NAME          STATUS   ROLES           VERSION
cka-cp1       Ready    control-plane   v1.36.0
cka-worker1   Ready    <none>          v1.35.5
cka-worker2   Ready    <none>          v1.35.5
```

### 10.3 Haz un upgrade de cada worker

Repetir uno a la vez, nunca en paralelo. En cka-worker1, actualizar el repositorio y kubeadm igual que en 10.2, luego:

```bash exec
sudo kubeadm upgrade node
```

`kubeadm upgrade node`, a diferencia de `kubeadm upgrade apply`, solo actualiza la configuración local de kubelet en un worker; no toca componentes del control plane.

Desde cka-cp1, drenar el worker:

```bash exec
kubectl drain cka-worker1 --ignore-daemonsets --delete-emptydir-data
```

De vuelta en cka-worker1, haz un upgrade de kubelet y kubectl igual que en 10.2, y reinicia kubelet.

Desde cka-cp1, devolver a servicio:

```bash exec
kubectl uncordon cka-worker1
```

Repetir el mismo proceso completo para cka-worker2.

Verificación final:

```bash exec
kubectl get nodes
kubectl get pods -A
```

```text output
NAME          STATUS   ROLES           VERSION
cka-cp1       Ready    control-plane   v1.36.0
cka-worker1   Ready    <none>          v1.36.0
cka-worker2   Ready    <none>          v1.36.0
```

## 11. Diagrama ASCII - orden del upgrade

```text reference
ANTES: cluster completo en v1.35.5

PASO 1 - control plane (cka-cp1):
  kubeadm upgrade apply v1.36.0
  drain -> upgrade kubelet/kubectl -> uncordon
  cka-cp1 ahora en v1.36.0
  workers siguen en v1.35.5 (temporalmente mixto,
  es normal y soportado durante el upgrade)

PASO 2 - worker 1 (cka-worker1):
  kubeadm upgrade node
  drain (desde cka-cp1) -> upgrade kubelet/kubectl
  -> uncordon (desde cka-cp1)
  cka-worker1 ahora en v1.36.0

PASO 3 - worker 2 (cka-worker2):
  mismo proceso que el paso 2

DESPUES: cluster completo en v1.36.0

Regla: nunca actualizar dos workers en paralelo,
y nunca actualizar un worker antes que el control plane.
```

## 12. Laboratorio guiado

Objetivo: recuperar un cluster tras simular una pérdida de datos en etcd, el escenario de examen más crítico de este módulo.

Paso 1, crear un recurso de prueba antes del backup:

```bash exec
kubectl create namespace antes-del-backup
```

Paso 2, backup:

```bash exec
sudo ETCDCTL_API=3 etcdctl snapshot save /opt/backup-lab.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

Paso 3, simular pérdida de datos creando un recurso DESPUÉS del backup:

```bash exec
kubectl create namespace despues-del-backup
kubectl get namespaces
```

Paso 4, restaurar desde el backup, siguiendo los 5 pasos de la sección 9.5, usando `/opt/backup-lab.db` y un directorio `/var/lib/etcd-restored-lab`.

Paso 5, verificar el resultado esperado:

```bash exec
kubectl get namespaces
```

`antes-del-backup` debe existir. `despues-del-backup` NO debe existir: el restore retrocedió el estado del cluster exactamente al momento del snapshot.

## 13. Checkpoint

**Pregunta 1**

¿Cuál es el orden correcto para hacer un upgrade de un cluster con 1 control plane y 2 workers?

Respuesta: primero el control plane completo, control plane apply, drain, upgrade de kubelet y kubectl, uncordon; luego cada worker, uno a la vez, nunca en paralelo, con kubeadm upgrade node en lugar de upgrade apply.

**Pregunta 2**

¿Por qué no se puede hacer el restore de etcd mientras etcd está corriendo?

Respuesta: etcd bloquearía el directorio de datos y los nuevos datos restaurados entrarían en conflicto con el estado en memoria del proceso activo. Hay que detener etcd moviendo su manifiesto fuera de `/etc/kubernetes/manifests/` para que kubelet lo detenga.

**Pregunta 3**

¿Cómo confirmas de forma definitiva que un pod del namespace kube-system es un mirror pod de un static pod?

Respuesta: revisando la anotación `kubernetes.io/config.mirror` en su metadata; su presencia confirma el origen static pod.

**Pregunta 4**

¿Qué diferencia hay entre `kubeadm upgrade apply` y `kubeadm upgrade node`?

Respuesta: `kubeadm upgrade apply` se ejecuta en el control plane y actualiza todos sus componentes más los addons. `kubeadm upgrade node` se ejecuta en los workers y solo actualiza la configuración local de kubelet, sin tocar componentes del control plane.

**Pregunta 5**

¿Dónde guarda kubeadm los certificados TLS del cluster, y cómo verificas su expiración?

Respuesta: en `/etc/kubernetes/pki/`, y se verifica con `sudo kubeadm certs check-expiration`.

## 14. Laboratorio cronometrado

Objetivo: completar en menos de 20 minutos.

Tarea:

1. Haz un backup de etcd y guárdalo en /opt/backup/etcd-cronometrado.db, verificando que el snapshot es válido.
2. Guarda en /tmp/certs-expiracion.txt la salida completa de la verificación de expiración de certificados.
3. Guarda en /tmp/mirror-pod.txt el valor de la anotación config.mirror del pod de kube-scheduler.

Criterios de éxito:

```bash exec
ls -lh /opt/backup/etcd-cronometrado.db
cat /tmp/certs-expiracion.txt
cat /tmp/mirror-pod.txt
```

Solución de referencia, no mirar hasta terminar:

```bash exec
sudo mkdir -p /opt/backup

sudo ETCDCTL_API=3 etcdctl snapshot save /opt/backup/etcd-cronometrado.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

sudo ETCDCTL_API=3 etcdctl snapshot status /opt/backup/etcd-cronometrado.db --write-out=table

sudo kubeadm certs check-expiration > /tmp/certs-expiracion.txt

kubectl get pod kube-scheduler-cka-cp1 -n kube-system \
  -o jsonpath='{.metadata.annotations.kubernetes\.io/config\.mirror}' > /tmp/mirror-pod.txt
```

## 15. Troubleshooting - casos reales

### Caso 1: kubeadm upgrade apply falla con error de etcd

**Síntoma:**

El comando de upgrade falla con un error del tipo "error execution phase upgrade/etcd: couldn't upgrade control plane: timed out waiting for the condition".

Diagnóstico paso a paso:

```bash exec
sudo ETCDCTL_API=3 etcdctl endpoint health \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

Confirmar que etcd está healthy antes de reintentar. Si no lo está, revisar sus logs directamente con crictl.

```bash exec
crictl ps | grep etcd
```

**Solución:**

Resolver el problema de etcd, revisando el Caso 3 de la sección 9, antes de reintentar el upgrade.

### Caso 2: kubectl drain falla por pods con storage local

**Síntoma:**

El comando `kubectl drain` se detiene con un error del tipo "cannot delete Pods with local storage" o pods pendientes de drenar.

Diagnóstico paso a paso:

La causa habitual es la presencia de pods con volúmenes emptyDir, o pods standalone sin ningún controller detrás.

```bash exec
kubectl drain cka-worker1 --ignore-daemonsets --delete-emptydir-data --force
```

`--ignore-daemonsets` ignora pods de DaemonSets, que no pueden moverse por diseño. `--delete-emptydir-data` acepta perder los datos de volúmenes emptyDir. `--force` elimina pods sin ningún controller detrás.

**Solución:**

Usar los tres flags juntos cuando la tarea del examen lo permita explícitamente; en producción real, evaluar antes si perder esos datos es aceptable.

### Caso 3: etcd no arranca tras el restore

**Síntoma:**

Tras seguir los pasos de restore de la sección 9.5, `kubectl get nodes` no responde y `crictl ps` no muestra etcd como Running.

Diagnóstico paso a paso:

```bash exec
crictl ps -a | grep etcd
```

```bash exec
sudo journalctl -u kubelet --no-pager | tail -50
```

Causas comunes: permisos incorrectos en el directorio de datos, el manifiesto de etcd apunta a un `--data-dir` distinto al que se restauró, o el snapshot está corrupto.

```bash exec
sudo chown -R root:root /var/lib/etcd
sudo chmod 700 /var/lib/etcd
```

```bash exec
sudo cat /etc/kubernetes/manifests/etcd.yaml | grep data-dir
```

**Solución:**

Corregir permisos con los comandos anteriores si ese era el problema, o corregir el `--data-dir` del manifiesto para que coincida con la ruta real donde se restauraron los datos.

## 16. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Este módulo instala y opera ese cluster desde cero; es el módulo fundacional para todos los que siguen.

**Alternativa K3s (plan B):** K3s no usa kubeadm en absoluto, así que ninguno de los pasos de instalación de este módulo aplica directamente. K3s reemplaza etcd por SQLite por defecto, y su comando de backup es `k3s etcd-snapshot save` cuando corre con el backend etcd habilitado explícitamente, o herramientas propias de SQLite en su configuración por defecto. El upgrade de K3s se gestiona con su propio instalador, no con `kubeadm upgrade`. Si tu cluster kubeadm queda inutilizable, K3s sirve como entorno alternativo ligero para seguir practicando módulos posteriores que no dependen de kubeadm específicamente.

---

**Siguiente módulo:** M04 - Control Plane de Alta Disponibilidad (HA)