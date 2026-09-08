---
code: M14
order: 14
slug: storage-pv-pvc-storageclass
title: Storage — PersistentVolume, PersistentVolumeClaim y StorageClass
description: Desacopla el almacenamiento del ciclo de vida del pod con PV, PVC y StorageClass, aprovisionamiento estático y dinámico, access modes y reclaim policies.
access: free
updated: "2026-09-08"
prerequisites: [helm-kustomize-crds-operators, workloads-deployments-daemonsets-statefulsets]
---

## 1. Resumen técnico

Este módulo cubre cómo Kubernetes desacopla el almacenamiento de los pods que lo usan. Un contenedor es efímero por diseño; cualquier dato escrito en su sistema de ficheros se pierde al reiniciarse, salvo que ese almacenamiento viva fuera del ciclo de vida del pod. PersistentVolume, PersistentVolumeClaim y StorageClass son las tres piezas que resuelven esto, con dos modelos de aprovisionamiento distintos, estático y dinámico, y varias reglas de coincidencia que generan la mayoría de los PVC atascados en Pending del examen real.

## 2. Peso en el examen y preguntas típicas

10% del examen, dominio Storage. Preguntas típicas:

- Crea un PersistentVolume estático y un PersistentVolumeClaim que se bindee a él.
- Monta un PVC en un pod y verifica que los datos persisten tras eliminar y recrear el pod.
- Crea una StorageClass que provisione volúmenes dinámicamente.
- Un PVC se queda en Pending indefinidamente, diagnostica por qué.
- Explica la diferencia entre reclaimPolicy Retain y Delete.

## 3. Prerrequisitos

De [M06 (Extension Interfaces)](/modulos/helm-kustomize-crds-operators/) usarás el concepto de CSI, Container Storage Interface, el contrato que un driver de almacenamiento real implementa para que Kubernetes pueda aprovisionar volúmenes sin conocer los detalles del backend.

De [M07 (Workloads)](/modulos/workloads-deployments-daemonsets-statefulsets/) usarás el `volumeClaimTemplate` que dejaste sin completar en el StatefulSet de ese módulo; aquí se cierra ese ciclo con almacenamiento persistente real.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Explicar la diferencia entre un PersistentVolume y una PersistentVolumeClaim, y quién crea cada uno.
2. Crear un PV estático y un PVC que se bindee correctamente a él.
3. Explicar los access modes y la diferencia real entre ReadWriteOnce y ReadWriteOncePod.
4. Explicar la diferencia entre reclaimPolicy Retain y Delete, y cuándo se aplica cada una.
5. Crear una StorageClass y provisionar almacenamiento dinámicamente.
6. Diagnosticar un PVC en Pending, distinguiendo un problema de access mode, de tamaño, o de storageClassName.

## 5. Explicación teórica progresiva

### 5.1 El problema que resuelve el storage persistente

Un pod puede tener volúmenes efímeros, como `emptyDir`, que viven mientras el pod existe y desaparecen con él. Para datos que deben sobrevivir al pod, un reinicio, un rollout, una recreación completa, se necesita almacenamiento que exista de forma independiente al ciclo de vida de cualquier pod concreto. Kubernetes separa esto en dos roles: quien administra el almacenamiento disponible, y quien lo consume, exactamente el mismo patrón de separación de responsabilidades visto en Gateway API en M11, aplicado aquí a storage en lugar de a networking.

### 5.2 PV y PVC, el ciclo de binding

Un PersistentVolume, PV, es un recurso de storage real del cluster, sin namespace, creado por un administrador de forma estática, o generado automáticamente por una StorageClass de forma dinámica. Representa un pedazo de almacenamiento concreto: un disco, un directorio NFS, un volumen cloud.

Una PersistentVolumeClaim, PVC, es la petición de un usuario, con namespace, pidiendo storage con ciertas características, tamaño, access mode, opcionalmente una clase. Kubernetes bindea automáticamente cada PVC con el PV disponible que mejor cumpla sus requisitos: el mismo access mode solicitado, capacidad suficiente, y una `storageClassName` compatible.

Un pod nunca referencia un PV directamente; siempre monta una PVC, que actúa como capa de abstracción entre la aplicación y los detalles reales del almacenamiento subyacente.

### 5.3 Access modes

`ReadWriteOnce`, RWO, el más común, permite montar el volumen en lectura y escritura, pero desde un único NODO a la vez, no un único POD. Varios pods programados en ESE MISMO nodo pueden compartir el mismo volumen RWO simultáneamente; la restricción es a nivel de nodo, no de pod individual, una confusión extremadamente común en el examen.

`ReadOnlyMany`, ROX, permite montar el volumen en modo solo lectura desde múltiples nodos simultáneamente.

`ReadWriteMany`, RWX, permite montar el volumen en lectura y escritura desde múltiples nodos simultáneamente; requiere un backend que lo soporte realmente, como NFS, no todos los tipos de storage lo permiten.

`ReadWriteOncePod`, RWOP, es la variante más estricta: restringe el montaje a un único POD en todo el cluster, ni siquiera otro pod en el mismo nodo puede montarlo simultáneamente. Se usa cuando la aplicación exige garantía absoluta de acceso exclusivo, por ejemplo ciertas bases de datos que corrompen datos si dos procesos escriben a la vez.

### 5.4 Reclaim policy

El campo `persistentVolumeReclaimPolicy` de un PV determina qué ocurre con los datos y con el PV mismo cuando su PVC asociada se elimina.

`Retain` conserva el PV y sus datos indefinidamente; el PV pasa a estado Released, ya no disponible para un nuevo binding automático, y requiere intervención manual del administrador para reutilizarlo o eliminarlo. Es la política más segura para datos críticos.

`Delete` elimina automáticamente tanto el PV como el almacenamiento real subyacente cuando la PVC se elimina. Es la política por defecto para volúmenes creados dinámicamente por una StorageClass, adecuada para datos no críticos o entornos donde la pérdida es aceptable.

`Recycle` está deprecada desde hace varias versiones de Kubernetes y no debe usarse; su función, un borrado básico de contenido antes de reutilizar el PV, quedó reemplazada por el aprovisionamiento dinámico.

### 5.5 StorageClass, aprovisionamiento estático frente a dinámico

Con aprovisionamiento estático, un administrador crea manualmente cada PV de antemano, y las PVCs se bindean contra ese inventario ya existente. Con aprovisionamiento dinámico, una StorageClass define un `provisioner`, típicamente un driver CSI, que crea automáticamente un PV nuevo cada vez que una PVC lo solicita, sin que ningún administrador haya preparado ese PV específico de antemano.

El campo `storageClassName` de una PVC tiene tres comportamientos distintos según cómo se defina, un matiz que genera una cantidad desproporcionada de PVCs atascados en el examen real. Si el campo se OMITE por completo, Kubernetes asigna automáticamente la StorageClass marcada como default en el cluster, si existe alguna. Si el campo se define explícitamente como cadena vacía, `""`, Kubernetes NO usa ninguna StorageClass, ni la default, y solo bindea contra un PV que también tenga `storageClassName` vacío o ausente, deshabilitando el aprovisionamiento dinámico para esa PVC de forma deliberada. Si el campo se define con un nombre concreto, debe coincidir exactamente con una StorageClass existente.

Una StorageClass se marca como default mediante la anotación `storageclass.kubernetes.io/is-default-class: "true"`.

### 5.6 volumeBindingMode

El campo `volumeBindingMode` de una StorageClass controla CUÁNDO ocurre el aprovisionamiento dinámico real. `Immediate`, el valor por defecto, crea el PV en cuanto se crea la PVC, sin esperar a que ningún pod la use. `WaitForFirstConsumer` retrasa la creación del PV hasta que un pod que referencia esa PVC es programado, permitiendo que el aprovisionamiento tenga en cuenta la topología real, en qué nodo terminó ese pod, especialmente relevante para storage local o con restricciones de zona.

## 6. Diagrama ASCII - ciclo de binding, estático frente a dinámico

```text reference
APROVISIONAMIENTO ESTATICO

  Administrador crea PV manualmente
       |
       v
  PV: STATUS=Available
       |
       | Usuario crea PVC pidiendo
       | tamano y access mode compatibles
       v
  Kubernetes busca un PV existente que cumpla
       |
       v
  PV y PVC: STATUS=Bound
       |
       v
  Pod monta la PVC -> usa el storage real


APROVISIONAMIENTO DINAMICO

  Usuario crea PVC con storageClassName
  apuntando a una StorageClass real
       |
       v
  volumeBindingMode: Immediate?
       |                    |
      SI                   NO (WaitForFirstConsumer)
       |                    |
       v                    v
  El provisioner       Espera hasta que un
  crea un PV nuevo      Pod que usa la PVC
  DE INMEDIATO          sea programado
       |                    |
       |                    v
       |               El provisioner crea
       |               el PV EN ESE NODO
       |                    |
       v                    v
  PV y PVC: STATUS=Bound (automatico, sin
  que ningun administrador haya preparado
  ese PV especifico de antemano)
```

## 7. Ejemplos prácticos desplegables

### 7.1 PV estático con hostPath y PVC que se bindea

```bash exec
sudo mkdir -p /mnt/datos-estaticos
sudo chmod 777 /mnt/datos-estaticos
```

Ejecutar en cka-worker1, ya que el PV usará hostPath apuntando a ese nodo específico.

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-estatico
spec:
  capacity:
    storage: 1Gi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
  hostPath:
    path: /mnt/datos-estaticos
  nodeAffinity:
    required:
      nodeSelectorTerms:
      - matchExpressions:
        - key: kubernetes.io/hostname
          operator: In
          values:
          - cka-worker1
EOF
```

`nodeAffinity` es obligatorio con `hostPath`, ya que ese directorio solo existe físicamente en cka-worker1; sin esta restricción, un pod podría programarse en otro nodo y el volumen aparecería vacío.

```bash exec
kubectl get pv pv-estatico
```

```text output
NAME           CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS      STORAGECLASS
pv-estatico    1Gi        RWO            Retain           Available   manual
```

Crear la PVC que se bindeará contra este PV:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-estatico
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: manual
  resources:
    requests:
      storage: 500Mi
EOF
```

```bash exec
kubectl get pvc pvc-estatico
kubectl get pv pv-estatico
```

```text output
NAME            STATUS   VOLUME         CAPACITY   ACCESS MODES
pvc-estatico    Bound    pv-estatico    1Gi        RWO

NAME           STATUS   CLAIM
pv-estatico    Bound    default/pvc-estatico
```

El binding ocurre aunque la PVC pida solo 500Mi y el PV ofrezca 1Gi: la PVC obtiene la capacidad completa del PV al que se bindea, no exactamente la cantidad solicitada.

### 7.2 Pod que usa el PVC

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-storage-estatico
spec:
  nodeSelector:
    kubernetes.io/hostname: cka-worker1
  containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "echo 'dato persistente' > /datos/prueba.txt; sleep 3600"]
    volumeMounts:
    - name: almacenamiento
      mountPath: /datos
  volumes:
  - name: almacenamiento
    persistentVolumeClaim:
      claimName: pvc-estatico
EOF
```

Verificar que el dato persiste tras eliminar y recrear el pod:

```bash exec
kubectl delete pod pod-storage-estatico

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-storage-estatico
spec:
  nodeSelector:
    kubernetes.io/hostname: cka-worker1
  containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "cat /datos/prueba.txt; sleep 3600"]
    volumeMounts:
    - name: almacenamiento
      mountPath: /datos
  volumes:
  - name: almacenamiento
    persistentVolumeClaim:
      claimName: pvc-estatico
EOF

kubectl logs pod-storage-estatico
```

```text output
dato persistente
```

El dato sobrevivió a la eliminación completa del pod anterior, porque vive en la PVC, no en el sistema de ficheros efímero del contenedor.

### 7.3 StorageClass con aprovisionamiento dinámico real

Instalar local-path-provisioner, un provisioner ligero que funciona en cualquier cluster sin depender de un cloud provider:

```bash exec
kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.37/deploy/local-path-storage.yaml
```

```bash exec
kubectl get storageclass
kubectl get pods -n local-path-storage
```

```text output
NAME         PROVISIONER             VOLUMEBINDINGMODE      RECLAIMPOLICY
local-path   rancher.io/local-path   WaitForFirstConsumer   Delete

NAME                                     READY   STATUS
local-path-provisioner-6f9c8d-4kxlq      1/1     Running
```

Marcarla como default para simplificar los siguientes ejemplos:

```bash exec
kubectl patch storageclass local-path -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

### 7.4 PVC dinámico, comportamiento del storageClassName omitido

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-dinamico
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 2Gi
EOF
```

```bash exec
kubectl get pvc pvc-dinamico
```

```text output
NAME             STATUS    VOLUME   CAPACITY   STORAGECLASS
pvc-dinamico     Pending                        local-path
```

Pending es el estado correcto en este momento: `volumeBindingMode: WaitForFirstConsumer`, visto en 5.6, retrasa la creación real del PV hasta que un pod use esta PVC.

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-storage-dinamico
spec:
  containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "echo dinamico > /datos/archivo.txt; sleep 3600"]
    volumeMounts:
    - name: almacenamiento
      mountPath: /datos
  volumes:
  - name: almacenamiento
    persistentVolumeClaim:
      claimName: pvc-dinamico
EOF

kubectl get pvc pvc-dinamico
```

```text output
NAME             STATUS   VOLUME                                     CAPACITY
pvc-dinamico     Bound    pvc-a1b2c3d4-e5f6-7890-abcd-ef1234567890   2Gi
```

En cuanto el pod fue programado, el provisioner creó automáticamente un PV nuevo, con un nombre autogenerado, sin que ningún administrador lo hubiera preparado de antemano.

### 7.5 Reclaim policy en acción

```bash exec
kubectl get pv pv-estatico -o jsonpath='{.spec.persistentVolumeReclaimPolicy}'
```

```bash exec
kubectl get storageclass local-path -o jsonpath='{.reclaimPolicy}'
```

El PV estático de 7.1 tiene `Retain`. La StorageClass `local-path` tiene `Delete`; cualquier PV que genere dinámicamente hereda esa política, verificable también de forma directa sobre el PV real con `kubectl get pvc pvc-dinamico -o jsonpath='{.spec.volumeName}'` seguido de `kubectl get pv <ese-nombre> -o jsonpath='{.spec.persistentVolumeReclaimPolicy}'`.

```bash exec
kubectl delete pod pod-storage-estatico
kubectl delete pvc pvc-estatico
kubectl get pv pv-estatico
```

```text output
NAME           STATUS     CLAIM
pv-estatico    Released
```

El PV pasa a Released, no se elimina ni se limpia automáticamente: con `Retain`, el dato en `/mnt/datos-estaticos` de cka-worker1 sigue existiendo físicamente, y el PV requiere intervención manual antes de reutilizarse.

### 7.6 StatefulSet con volumeClaimTemplate real

Retomando el StatefulSet de M07, ahora con almacenamiento persistente real:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: db-headless-storage
spec:
  clusterIP: None
  selector:
    app: db-storage
  ports:
  - port: 80
EOF

kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db-storage
spec:
  serviceName: db-headless-storage
  replicas: 2
  selector:
    matchLabels:
      app: db-storage
  template:
    metadata:
      labels:
        app: db-storage
    spec:
      containers:
      - name: db
        image: nginx:1.25
        volumeMounts:
        - name: datos
          mountPath: /var/lib/datos
  volumeClaimTemplates:
  - metadata:
      name: datos
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 1Gi
EOF
```

```bash exec
kubectl get pvc -l app=db-storage
```

```text output
NAME               STATUS   VOLUME
datos-db-storage-0 Bound    pvc-...
datos-db-storage-1 Bound    pvc-...
```

Cada réplica del StatefulSet obtuvo su PROPIA PVC, nombrada con el patrón `<template>-<statefulset>-<índice>`, exactamente lo anticipado en M07: si el pod `db-storage-1` se elimina y se recrea, se reconecta a `datos-db-storage-1`, sus mismos datos, no una PVC nueva.

## 8. Laboratorio guiado

Objetivo: diagnosticar tres causas distintas de un PVC en Pending, el escenario de troubleshooting más frecuente de este dominio.

Paso 1, causa 1, access mode incompatible:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-problema-1
spec:
  accessModes:
  - ReadWriteMany
  storageClassName: manual
  resources:
    requests:
      storage: 100Mi
EOF

kubectl get pvc pvc-problema-1
```

```text output
NAME              STATUS
pvc-problema-1    Pending
```

```bash exec
kubectl describe pvc pvc-problema-1
```

```text output
Events:
  Warning  FailedBinding  no persistent volumes available for this claim and no storage class is set
```

Diagnóstico: `pv-estatico` fue eliminado en 7.5, y ningún otro PV con `storageClassName: manual` ofrece `ReadWriteMany`; hostPath, además, nunca soporta RWX de forma nativa.

Paso 2, causa 2, storageClassName inexistente:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-problema-2
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: clase-que-no-existe
  resources:
    requests:
      storage: 100Mi
EOF

kubectl describe pvc pvc-problema-2
```

```text output
Events:
  Warning  ProvisioningFailed  storageclass.storage.k8s.io "clase-que-no-existe" not found
```

Diagnóstico: la StorageClass referenciada simplemente no existe en el cluster.

```bash exec
kubectl get storageclass
```

Paso 3, causa 3, el matiz de storageClassName vacío frente a omitido, de 5.5:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-problema-3
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: ""
  resources:
    requests:
      storage: 100Mi
EOF

kubectl get pvc pvc-problema-3
```

```text output
NAME              STATUS
pvc-problema-3    Pending
```

Diagnóstico: `storageClassName: ""` deshabilita deliberadamente el aprovisionamiento dinámico, y no existe ningún PV estático sin clase disponible para bindear; a diferencia de omitir el campo, que sí habría usado la StorageClass default, `local-path`.

Paso 4, corregir cada caso según su causa real:

```bash exec
kubectl delete pvc pvc-problema-1 pvc-problema-2 pvc-problema-3

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-corregida
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 100Mi
EOF
```

Omitir `storageClassName` por completo usa la default, `local-path`, resolviendo el problema sin necesitar un PV estático preparado de antemano.

## 9. Checkpoint

**Pregunta 1**

¿ReadWriteOnce restringe el acceso a un único pod?

Respuesta: no. Restringe el montaje en lectura y escritura a un único NODO, no a un único pod. Varios pods en ese mismo nodo pueden compartir el volumen simultáneamente. Para restringir a exactamente un pod, se usa ReadWriteOncePod.

**Pregunta 2**

¿Qué diferencia hay entre `storageClassName` omitido y `storageClassName: ""` en una PVC?

Respuesta: omitido asigna automáticamente la StorageClass marcada como default, si existe alguna. `""` explícito deshabilita deliberadamente el aprovisionamiento dinámico, bindeando únicamente contra un PV que también tenga `storageClassName` vacío o ausente.

**Pregunta 3**

¿Qué diferencia hay entre reclaimPolicy Retain y Delete?

Respuesta: Retain conserva el PV y sus datos tras eliminar la PVC, pasando a estado Released y requiriendo intervención manual. Delete elimina automáticamente tanto el PV como el almacenamiento real subyacente.

**Pregunta 4**

Una PVC con `volumeBindingMode: WaitForFirstConsumer` queda en Pending inmediatamente después de crearla. ¿Es un error?

Respuesta: no. Es el comportamiento esperado: la creación real del PV se retrasa deliberadamente hasta que un pod que usa esa PVC sea programado, permitiendo que el aprovisionamiento tenga en cuenta la topología real del nodo asignado.

**Pregunta 5**

En un StatefulSet con `volumeClaimTemplates`, si el pod con índice 1 se elimina y se recrea, ¿obtiene una PVC nueva?

Respuesta: no. Se reconecta a la misma PVC que ya tenía, nombrada según el patrón `<template>-<statefulset>-1`, con los mismos datos, no una PVC nueva.

## 10. Laboratorio cronometrado

Objetivo: completar en menos de 15 minutos.

Tarea:

1. Crea un PV estático llamado pv-cronometrado, 2Gi, ReadWriteOnce, reclaimPolicy Retain, storageClassName manual, hostPath en /mnt/datos-cronometrado en cka-worker2, con la nodeAffinity correspondiente.
2. Crea una PVC pvc-cronometrada que se bindee a ese PV.
3. Crea un pod que monte esa PVC y escriba un archivo con el texto "examen cka" en /datos/archivo.txt.
4. Guarda en /tmp/pv-status.txt el STATUS del PV tras crear la PVC.
5. Crea una segunda PVC pvc-dinamica-cronometrada de 1Gi sin especificar storageClassName, y guarda en /tmp/clase-asignada.txt la StorageClass que terminó usando.

Criterios de éxito:

```bash exec
cat /tmp/pv-status.txt
cat /tmp/clase-asignada.txt
```

```text output
Bound

local-path
```

Solución de referencia, no mirar hasta terminar:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-cronometrado
spec:
  capacity:
    storage: 2Gi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
  hostPath:
    path: /mnt/datos-cronometrado
  nodeAffinity:
    required:
      nodeSelectorTerms:
      - matchExpressions:
        - key: kubernetes.io/hostname
          operator: In
          values:
          - cka-worker2
EOF

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-cronometrada
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: manual
  resources:
    requests:
      storage: 2Gi
EOF

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-cronometrado
spec:
  nodeSelector:
    kubernetes.io/hostname: cka-worker2
  containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "echo 'examen cka' > /datos/archivo.txt; sleep 3600"]
    volumeMounts:
    - name: almacenamiento
      mountPath: /datos
  volumes:
  - name: almacenamiento
    persistentVolumeClaim:
      claimName: pvc-cronometrada
EOF

kubectl get pv pv-cronometrado -o jsonpath='{.status.phase}' > /tmp/pv-status.txt

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-dinamica-cronometrada
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
EOF

kubectl get pvc pvc-dinamica-cronometrada -o jsonpath='{.spec.storageClassName}' > /tmp/clase-asignada.txt
```

## 11. Troubleshooting - casos reales

### Caso 1: PVC atascada en Pending sin razón evidente

**Síntoma:**

`kubectl get pvc` muestra el PVC en Pending indefinidamente, sin que el usuario entienda por qué.

Diagnóstico paso a paso:

```bash exec
kubectl describe pvc pvc-dinamico
```

Revisar la sección Events al final; el mensaje siempre indica la causa exacta: falta de PV compatible, StorageClass inexistente, o espera legítima por WaitForFirstConsumer.

```bash exec
kubectl get storageclass
```

Confirmar que la StorageClass referenciada, o la default si el campo fue omitido, realmente existe.

```bash exec
kubectl get pv
```

Si el aprovisionamiento es estático, confirmar que existe algún PV en estado Available que cumpla access mode y capacidad.

**Solución:**

Corregir según la causa exacta indicada en Events: crear el PV faltante, corregir el nombre de la StorageClass, o simplemente esperar y crear el pod consumidor si el modo es WaitForFirstConsumer.

### Caso 2: pod no arranca porque su PVC nunca se bindea

**Síntoma:**

`kubectl get pod` muestra el pod en Pending, y el mensaje de Events menciona la PVC, no directamente el pod.

Diagnóstico paso a paso:

```bash exec
kubectl describe pod pod-storage-estatico
```

```text output
Events:
  Warning  FailedScheduling  pod has unbound immediate PersistentVolumeClaims
```

Este mensaje, ya anticipado en el troubleshooting de M07, confirma que el problema real está en la PVC, no en el pod ni en el scheduler directamente. El siguiente comando se ejecuta sustituyendo el nombre real de esa PVC:

```text reference
kubectl describe pvc <nombre-de-la-pvc-del-pod>
```

**Solución:**

Resolver la causa raíz de la PVC, siguiendo el Caso 1, antes de esperar que el pod arranque; el pod permanecerá Pending hasta que su PVC esté Bound.

### Caso 3: datos perdidos tras eliminar una PVC con reclaimPolicy Delete

**Síntoma:**

Se eliminó una PVC pensando que el almacenamiento se conservaría, y los datos ya no existen.

Diagnóstico paso a paso:

```bash exec
kubectl get storageclass local-path -o jsonpath='{.reclaimPolicy}'
```

```text output
Delete
```

Confirmar la reclaimPolicy heredada por el PV dinámico desde su StorageClass; si es Delete, el comportamiento fue el esperado por diseño, no un fallo.

**Solución:**

No hay recuperación posible una vez eliminado el PV con Delete. La prevención es la corrección real: para datos críticos, usar una StorageClass con `reclaimPolicy: Retain`, o PVs estáticos con esa política, antes de que ocurra la pérdida, nunca después.

## 12. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Los ejemplos de PV estático con hostPath dependen de tener nodos distintos identificables por nombre, cka-worker1 y cka-worker2, para demostrar correctamente el uso de nodeAffinity.

**Alternativa K3s (plan B):** K3s incluye local-path-provisioner preinstalado por defecto como StorageClass, sin necesitar instalarlo manualmente como en 7.3 de este módulo. Los conceptos de PV, PVC, access modes y reclaimPolicy son idénticos, API estándar de Kubernetes. La diferencia principal es que en K3s single-node no se puede demostrar la restricción de ReadWriteOnce a nivel de nodo con el mismo realismo, al existir un único nodo candidato.

Limpieza del módulo:

```bash exec
kubectl delete pod pod-storage-estatico pod-storage-dinamico pod-cronometrado
kubectl delete statefulset db-storage
kubectl delete svc db-headless-storage
kubectl delete pvc pvc-dinamico pvc-cronometrada pvc-dinamica-cronometrada
kubectl delete pv pv-estatico pv-cronometrado
kubectl delete pvc -l app=db-storage
sudo rm -rf /mnt/datos-estaticos /mnt/datos-cronometrado
```

---

**Siguiente módulo:** M15 - Troubleshooting: Cluster y Control Plane