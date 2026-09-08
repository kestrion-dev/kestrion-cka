---
code: M15
order: 15
slug: troubleshooting-cluster-control-plane
title: Troubleshooting — Cluster y Control Plane
description: Diagnostica y resuelve fallos del control plane con metodología sistemática — apiserver inalcanzable, certificados expirados, etcd roto, static pods inválidos y kubeconfigs incorrectos.
access: free
updated: "2026-09-08"
prerequisites: [arquitectura-kubernetes, kubeadm-etcd-backup-restore-upgrade, control-plane-alta-disponibilidad, rbac-seguridad-cluster]
---

## 1. Resumen técnico

Este es el primero de tres módulos dedicados a troubleshooting, el dominio de mayor peso del examen. Cubre fallos del control plane: apiserver inalcanzable, certificados expirados, etcd corrupto, static pods rotos, y kubeconfigs mal configurados. A diferencia de los módulos anteriores, aquí no se introduce teoría nueva; se aplica de forma sistemática todo lo visto en M02, M03, M04 y M05 para diagnosticar y resolver fallos reales, con la misma metodología, síntoma, diagnóstico paso a paso, causa raíz, solución, que necesitarás bajo presión de tiempo en el examen.

## 2. Peso en el examen y preguntas típicas

Troubleshooting representa el 30% del examen, el dominio de mayor peso, dividido en tres módulos. Este cubre específicamente el subdominio de cluster y control plane. Preguntas típicas:

- El cluster no responde a ningún comando kubectl, diagnostica y restaura el acceso.
- Los certificados del cluster están próximos a expirar o ya expiraron, renuévalos.
- etcd no arranca tras un fallo del nodo, diagnostica la causa.
- Un componente del control plane está en CrashLoopBackOff, identifica y corrige el manifiesto roto.
- kubectl devuelve un error de certificado al conectar, diagnostica el kubeconfig.

## 3. Prerrequisitos

Este módulo depende de prácticamente todo el curso hasta ahora: [M02](/modulos/arquitectura-kubernetes/) para los componentes y el flujo del control plane, [M03](/modulos/kubeadm-etcd-backup-restore-upgrade/) para static pods, certificados y etcd, [M04](/modulos/control-plane-alta-disponibilidad/) para el concepto de quorum si el cluster fuera HA, y [M05](/modulos/rbac-seguridad-cluster/) para distinguir un fallo de autenticación de uno de autorización.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Aplicar una metodología sistemática de diagnóstico cuando kubectl no responde en absoluto.
2. Renovar certificados expirados y forzar correctamente a los componentes del control plane a recargarlos.
3. Diagnosticar por qué etcd no arranca, más allá del escenario de restore ya visto en M03.
4. Detectar y corregir un static pod con un manifiesto YAML sintácticamente inválido.
5. Diagnosticar un kubeconfig con una CA incorrecta, distinguiéndolo de un problema de RBAC.
6. Priorizar, bajo presión de tiempo, qué comando ejecutar primero ante un cluster que no responde.

## 5. Metodología sistemática de diagnóstico

Cuando el cluster falla, la tentación es probar comandos al azar. La metodología correcta va de arriba hacia abajo, exactamente en el orden que un cliente atraviesa para llegar hasta etcd, visto en M02: primero confirmar si kubectl puede conectar en absoluto, luego si el apiserver está corriendo como proceso, luego si kubelet está sano en el nodo del control plane, luego si containerd está sano, y solo al final revisar etcd directamente. Saltarse pasos hacia el final, por ejemplo revisar etcd antes de confirmar que kubelet está vivo, desperdicia tiempo revisando síntomas en lugar de causas.

En cada paso, el comando de diagnóstico cambia porque la herramienta disponible cambia: kubectl solo funciona si el apiserver responde; si no, se usa `crictl` directamente sobre el nodo, y si ni siquiera containerd responde, se usa `systemctl` y `journalctl` sobre el sistema operativo mismo, fuera de cualquier abstracción de Kubernetes.

## 6. Diagrama ASCII - árbol de diagnóstico del control plane

```text reference
kubectl get nodes  ->  responde?
       |
      NO
       v
kubectl cluster-info  -> mismo error de conexion?
       |
      SI (el problema es el apiserver, no tu kubeconfig)
       v
En cka-cp1: crictl ps -a | grep apiserver
       |
    +--+--+
    |     |
 EXISTE  NO EXISTE
    |     |
    v     v
 crictl   systemctl status kubelet
 logs     (kubelet es quien arranca
 <id>      los static pods, sin
    |      kubelet no hay nada)
    v         |
 revisar   +--+--+
 el error  |     |
 real      ACTIVE INACTIVE
            |     |
            v     v
      journalctl  systemctl start kubelet
      -u kubelet  y repetir el diagnostico
      (buscar el
       motivo por
       el que el
       static pod
       no arranca)
```

## 7. Casos guiados de troubleshooting

### Caso 1: kubectl no responde en absoluto

**Síntoma:**

Cualquier comando de kubectl devuelve "connection refused" o timeout, sin ningún mensaje relacionado con RBAC o autenticación.

Diagnóstico paso a paso, siguiendo la metodología de la sección 5:

```bash exec
kubectl cluster-info
```

Si también falla con el mismo error, el problema es el apiserver mismo, no una configuración local de kubectl.

```bash exec
crictl ps -a | grep apiserver
```

Ejecutado directamente en cka-cp1. Si el contenedor aparece pero no está Running, revisar su causa:

```bash exec
crictl logs $(crictl ps -a | grep apiserver | awk '{print $1}')
```

Si el contenedor NO aparece en absoluto, el problema es anterior: kubelet, quien arranca los static pods, no está funcionando.

```bash exec
systemctl status kubelet
journalctl -u kubelet --no-pager | tail -50
```

**Solución:**

Si kubelet está inactivo, `systemctl start kubelet` y volver a verificar si el static pod del apiserver arranca solo. Si kubelet está activo pero el contenedor del apiserver falla repetidamente, el log de crictl casi siempre apunta a un error de configuración o de certificados en `/etc/kubernetes/manifests/kube-apiserver.yaml`, corregible editando ese fichero directamente.

### Caso 2: certificados del control plane expirados

**Síntoma:**

kubectl devuelve un error del tipo "x509: certificate has expired or is not yet valid", y los pods del control plane pueden estar en Running pero rechazando conexiones, o en CrashLoopBackOff.

Diagnóstico paso a paso:

```bash exec
sudo kubeadm certs check-expiration
```

Confirmar qué certificados exactamente ya expiraron o están próximos a hacerlo.

**Solución:**

```bash exec
sudo kubeadm certs renew all
```

Este comando reescribe los ficheros de certificado en `/etc/kubernetes/pki/`, pero los procesos del control plane ya en ejecución tienen los certificados VIEJOS cargados en memoria; la recarga dinámica no está soportada para todos los componentes. Como son static pods, `kubectl` no puede usarse para reiniciarlos; hay que forzar a kubelet a recrearlos moviendo temporalmente cada manifiesto fuera del directorio vigilado:

```bash exec
sudo mkdir -p /tmp/manifests-backup
sudo mv /etc/kubernetes/manifests/*.yaml /tmp/manifests-backup/
```

Esperar a que kubelet detecte la ausencia y detenga los pods, el intervalo de detección por defecto, `fileCheckFrequency`, es de aproximadamente 20 segundos:

```bash exec
sleep 20
crictl ps | grep -E "kube-apiserver|kube-controller|kube-scheduler|etcd"
```

Confirmar que ya no aparece ninguno antes de continuar.

```bash exec
sudo mv /tmp/manifests-backup/*.yaml /etc/kubernetes/manifests/
```

kubelet detecta los manifiestos de vuelta y recrea los pods, ahora leyendo los certificados renovados desde disco.

```bash exec
until kubectl get --raw=/healthz 2>/dev/null | grep -q ok; do sleep 2; done
echo "apiserver de vuelta"
```

Actualizar también el kubeconfig local, que embebe su propio certificado con fecha de expiración independiente:

```bash exec
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

Verificar que las nuevas fechas de expiración son correctas:

```bash exec
sudo kubeadm certs check-expiration
```

### Caso 3: etcd no arranca, sin relación con un restore

**Síntoma:**

A diferencia del escenario de restore de M03, aquí no hubo ningún cambio deliberado de datos: etcd simplemente deja de arrancar tras un reinicio del nodo o un fallo de disco.

Diagnóstico paso a paso:

```bash exec
crictl ps -a | grep etcd
crictl logs $(crictl ps -a | grep etcd | awk '{print $1}')
```

Los mensajes de error más comunes en los logs de etcd apuntan a causas distintas. Un mensaje sobre permisos del directorio de datos:

```bash exec
ls -la /var/lib/etcd
```

```text output
drwx------ 2 root root ... /var/lib/etcd
```

Debe ser propiedad de root con permisos 700; permisos incorrectos, por ejemplo tras una restauración manual de backup fuera de procedimiento, impiden que etcd arranque.

Un mensaje sobre el WAL, Write-Ahead Log, corrupto, indica daño real en los datos, sin remedio salvo restaurar desde un backup válido, siguiendo el procedimiento completo de M03.

Un mensaje sobre espacio en disco agotado:

```bash exec
df -h /var/lib/etcd
```

**Solución:**

Corregir permisos con `chown -R root:root /var/lib/etcd` y `chmod 700 /var/lib/etcd` si esa fue la causa. Liberar espacio en disco si esa fue la causa. Si el WAL está corrupto sin remedio, restaurar desde el último snapshot válido, aceptando la pérdida de datos posteriores a ese backup, exactamente el procedimiento de M03.

### Caso 4: static pod con manifiesto YAML sintácticamente inválido

**Síntoma:**

Tras editar manualmente un manifiesto en `/etc/kubernetes/manifests/`, el pod correspondiente desaparece de `kubectl get pods` y no vuelve a aparecer, sin ningún error visible vía kubectl, porque el pod nunca llegó a registrarse en la API.

Diagnóstico paso a paso:

Este es el caso donde kubectl es completamente inútil: el error ocurre ANTES de que el apiserver se entere de nada.

```bash exec
journalctl -u kubelet --no-pager | tail -30
```

```text output
kubelet: E0908 error parsing file "/etc/kubernetes/manifests/kube-scheduler.yaml": error converting YAML to JSON: yaml: line 12: did not find expected key
```

El mensaje identifica el fichero y la línea exactos.

```bash exec
sudo cat -n /etc/kubernetes/manifests/kube-scheduler.yaml | sed -n '8,16p'
```

Revisar visualmente la indentación alrededor de la línea señalada, el error más común es exactamente el mismo problema de tabs frente a espacios visto desde M01.

**Solución:**

Corregir la sintaxis YAML directamente en el fichero, con vim configurado según M01, guardar, y esperar a que kubelet lo relea automáticamente, sin necesitar reiniciar kubelet para que detecte el cambio.

```bash exec
sudo vim /etc/kubernetes/manifests/kube-scheduler.yaml
```

```bash exec
sleep 20
kubectl get pods -n kube-system | grep scheduler
```

### Caso 5: kubeconfig con CA incorrecta

**Síntoma:**

kubectl devuelve un error del tipo "x509: certificate signed by unknown authority", distinto del error de expiración del Caso 2.

Diagnóstico paso a paso:

Este error específico significa que el certificado presentado por el apiserver fue firmado por una CA distinta a la que el kubeconfig del cliente espera, típicamente porque el kubeconfig fue copiado desde un cluster distinto, o porque el cluster fue reinstalado y su CA regenerada sin actualizar los kubeconfigs existentes.

```bash exec
grep certificate-authority-data ~/.kube/config | head -c 100
```

```bash exec
sudo cat /etc/kubernetes/pki/ca.crt | base64 -w0 | head -c 100
```

Comparar visualmente que ambos valores correspondan a la misma CA; si no coinciden, el kubeconfig está desactualizado o pertenece a otro cluster.

**Solución:**

Regenerar el kubeconfig desde el admin.conf actual del cluster:

```bash exec
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

Para usuarios distintos del admin, siguiendo el flujo de M05, regenerar su kubeconfig usando `--certificate-authority=/etc/kubernetes/pki/ca.crt` con la CA real y actual del cluster.

### Caso 6: kube-controller-manager no reconcilia nada

**Síntoma:**

Los pods eliminados manualmente de un Deployment no se recrean; el reconciliation loop visto en M02 parece completamente detenido, aunque el pod de kube-controller-manager aparece Running.

Diagnóstico paso a paso:

```bash exec
kubectl get pods -n kube-system -l component=kube-controller-manager
```

Confirmar que el pod está Running, no solo existente.

```bash exec
kubectl logs -n kube-system -l component=kube-controller-manager --tail=50
```

Un mensaje relacionado con leader election es la causa más común en clusters HA, visto en M04: si varios controller-managers compiten por el liderazgo y ninguno lo consigue, por ejemplo por reloj desincronizado entre nodos, ninguno reconcilia activamente. En un cluster de un solo control plane como el tuyo, esto es menos probable, pero el mismo síntoma puede aparecer por un error de configuración en sus flags, visibles en su manifiesto.

```bash exec
sudo cat /etc/kubernetes/manifests/kube-controller-manager.yaml | grep -A1 "\- --"
```

**Solución:**

Si el log muestra errores de leader election, revisar la sincronización horaria entre nodos con `timedatectl` en cada uno. Si el log muestra un error de flag o de conexión hacia el apiserver, corregir el manifiesto directamente, siguiendo el mismo procedimiento del Caso 4.

## 8. Checkpoint

**Pregunta 1**

kubectl no responde en absoluto. ¿Cuál es el primer comando que ejecutas, y por qué ese y no revisar etcd directamente?

Respuesta: `kubectl cluster-info`, para confirmar si el problema es el apiserver mismo o algo local de kubectl. Revisar etcd directamente sin antes confirmar que kubelet y el contenedor del apiserver están vivos desperdicia tiempo revisando un componente que podría no ser la causa raíz; la metodología va de arriba hacia abajo.

**Pregunta 2**

Tras `kubeadm certs renew all`, ¿por qué `kubectl get pods` no muestra ningún cambio en los componentes del control plane inmediatamente?

Respuesta: porque los procesos ya en ejecución mantienen los certificados VIEJOS cargados en memoria; el fichero en disco se actualizó pero eso no recarga dinámicamente el proceso. Hay que forzar a kubelet a recrear los static pods moviendo sus manifiestos fuera del directorio vigilado y de vuelta.

**Pregunta 3**

¿Por qué `kubectl delete pod` no funciona para reiniciar un componente del control plane?

Respuesta: los componentes del control plane corren como static pods, gestionados directamente por kubelet vía manifiestos locales, no por el apiserver. kubectl no tiene autoridad real sobre ellos; como mucho elimina el mirror pod visible, que kubelet recrea de inmediato.

**Pregunta 4**

Un manifiesto de static pod tiene un error de sintaxis YAML. ¿Por qué `kubectl describe pod` no ayuda a diagnosticarlo?

Respuesta: porque el pod nunca llega a registrarse en la API en absoluto; el fallo ocurre en kubelet, antes de que el apiserver se entere de que ese pod debería existir. El diagnóstico correcto es `journalctl -u kubelet`, no ningún comando de kubectl.

**Pregunta 5**

¿Cuál es la diferencia entre el error "certificate has expired" y "certificate signed by unknown authority"?

Respuesta: el primero indica que el certificado es válido en su cadena de confianza pero su fecha de validez ya pasó. El segundo indica que el certificado fue firmado por una CA distinta a la que el cliente reconoce, típicamente un kubeconfig desactualizado o de otro cluster, sin relación con fechas de expiración.

## 9. Laboratorio cronometrado

Objetivo: completar en menos de 20 minutos, simulando la presión real del examen ante un cluster con múltiples problemas encadenados.

Tarea:

1. Ejecuta `kubeadm certs check-expiration` y guarda la salida completa en /tmp/certs-antes.txt.
2. Ejecuta un renew completo de certificados.
3. Fuerza correctamente a los componentes del control plane a recargar los certificados nuevos, sin usar kubectl para ello.
4. Verifica que el apiserver responde de nuevo antes de continuar.
5. Actualiza tu kubeconfig local con el admin.conf renovado.
6. Ejecuta `kubeadm certs check-expiration` de nuevo y guarda la salida en /tmp/certs-despues.txt.

Criterios de éxito:

```bash exec
kubectl get nodes
diff /tmp/certs-antes.txt /tmp/certs-despues.txt
```

Los nodos deben responder Ready, y el diff debe mostrar fechas de expiración nuevas, aproximadamente un año adelante, para cada certificado listado.

Solución de referencia, no mirar hasta terminar:

```bash exec
sudo kubeadm certs check-expiration > /tmp/certs-antes.txt

sudo kubeadm certs renew all

sudo mkdir -p /tmp/manifests-backup
sudo mv /etc/kubernetes/manifests/*.yaml /tmp/manifests-backup/
sleep 20
sudo mv /tmp/manifests-backup/*.yaml /etc/kubernetes/manifests/

until kubectl get --raw=/healthz 2>/dev/null | grep -q ok; do sleep 2; done

sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

sudo kubeadm certs check-expiration > /tmp/certs-despues.txt

kubectl get nodes
```

## 10. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Este módulo depende directamente de tener acceso SSH real a cka-cp1 para ejecutar `crictl`, `journalctl` y `systemctl`, herramientas de sistema operativo que ningún kubeconfig ni RBAC puede sustituir.

**Alternativa K3s (plan B):** la metodología de diagnóstico de arriba hacia abajo aplica igual, pero las herramientas cambian. K3s no usa `crictl` con containerd de la misma forma expuesta; usa `k3s crictl` como wrapper, y sus logs se consultan con `journalctl -u k3s` en el nodo servidor, en lugar de `journalctl -u kubelet`, ya que kubelet está empaquetado dentro del propio binario k3s. El renew de certificados también difiere: K3s usa `k3s certificate rotate` en lugar de `kubeadm certs renew`.

---

**Siguiente módulo:** M16 - Troubleshooting: Nodos y Networking