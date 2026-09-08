---
code: M06
order: 6
slug: helm-kustomize-crds-operators
title: Helm, Kustomize, CRDs y Operators
description: Instala componentes con Helm y Kustomize, crea Custom Resource Definitions, entiende el patrón Operator y las interfaces de extensión CNI, CSI y CRI.
access: free
updated: "2026-09-08"
prerequisites: [arquitectura-kubernetes, rbac-seguridad-cluster]
---

## 1. Resumen técnico

Este módulo cubre cuatro competencias del temario oficial vigente: usar Helm y Kustomize para instalar componentes del cluster, entender Custom Resource Definitions y Operators, y comprender las interfaces de extensión, CNI, CSI y CRI, que permiten a Kubernetes delegar networking, storage y runtime a implementaciones intercambiables. Son piezas independientes que comparten un mismo hilo conductor: extender Kubernetes más allá de sus objetos nativos.

## 2. Peso en el examen y preguntas típicas

Estas competencias forman parte del dominio de 25%, Cluster Architecture, Installation & Configuration. Desde la revisión del examen, el candidato tiene acceso a helm.sh/docs durante la prueba, lo que confirma que Helm es materia evaluable. Preguntas típicas:

- Instala el chart X desde el repositorio Y con estos valores específicos.
- Realiza un rollback del release X a la revisión anterior.
- Despliega la aplicación usando la estructura de Kustomize proporcionada en una ruta dada.
- Aplica el overlay de producción sobre la base.
- Crea el CustomResourceDefinition según este esquema y crea una instancia de él.
- Identifica qué CNI, CSI y CRI usa este cluster.

## 3. Prerrequisitos

De [M02 (Arquitectura)](/modulos/arquitectura-kubernetes/) usarás el concepto de controller y el reconciliation loop, con kube-controller-manager como ejemplo nativo, la base para entender el patrón Operator de este módulo.

De [M03 (kubeadm)](/modulos/kubeadm-etcd-backup-restore-upgrade/) usarás static pods, `kubectl apply -f`, e inspección de componentes vía crictl.

De [M05 (RBAC)](/modulos/rbac-seguridad-cluster/) usarás `kubectl api-resources` para descubrir apiGroups, y RBAC en general, ya que los Operators necesitan permisos para operar sobre sus propios CRDs.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Instalar Helm y explicar qué resuelve frente a aplicar manifiestos YAML sueltos.
2. Instalar, actualizar y revertir un release de Helm.
3. Construir una estructura base y overlays con Kustomize y aplicarla con `kubectl apply -k`.
4. Crear un CustomResourceDefinition y distinguir por qué sin un controller no hace nada por sí solo.
5. Explicar el patrón Operator con un ejemplo real funcionando en tu cluster.
6. Identificar el CNI, CSI y CRI de un cluster dado usando solo comandos.

## 5. Explicación teórica progresiva

### 5.1 El problema que resuelve Helm

Conexión con M03 y M05: hasta ahora, cada recurso lo aplicaste con manifiestos individuales vía `kubectl apply -f`. Para una aplicación real con decenas de recursos relacionados, Deployment, Service, ConfigMap, Secret, RBAC, PVC, gestionar cada YAML por separado se vuelve inviable: no hay versionado del conjunto completo, no hay forma nativa de parametrizar valores como imagen, réplicas o dominio sin editar YAML, y no hay un mecanismo de deshacer un despliegue completo si algo sale mal.

Helm resuelve esto con tres conceptos.

#### Chart

Un paquete de manifiestos YAML con plantillas, templates, que aceptan variables. Es análogo a un paquete .deb o .rpm, pero para Kubernetes.

#### Release

Una instancia instalada de un Chart en el cluster, con un nombre y un namespace concretos. El mismo Chart puede instalarse varias veces como releases distintos.

#### Values

El fichero, o los flags, que parametrizan el Chart, imagen, tag, réplicas, recursos, sin tocar los templates del Chart.

Helm renderiza los templates del Chart con los values proporcionados, produce YAML final, y lo aplica contra la API de Kubernetes, el mismo apiserver de siempre; Helm no es un componente del cluster. Guarda el estado del release, qué se instaló y con qué values, como un Secret en el namespace del release, por eso `kubectl get secrets` muestra objetos con nombres del tipo `sh.helm.release.v1.<nombre>.v1`.

### 5.2 El problema que resuelve Kustomize

Kustomize resuelve un problema distinto: cómo mantener variantes de la misma aplicación, dev, staging, producción, sin duplicar YAML ni usar plantillas con variables.

La filosofía es opuesta a Helm: Helm parametriza con variables dentro de templates; Kustomize parte de YAML plano válido, una base, y aplica patches declarativos por encima, los overlays, sin tocar el YAML original.

#### Base

El conjunto de manifiestos común a todos los entornos.

#### Overlay

Una carpeta que referencia la base y aplica modificaciones: cambiar el número de réplicas, la imagen, agregar labels.

kubectl tiene Kustomize integrado desde la versión 1.14, con `kubectl apply -k`, sin requerir instalar nada adicional. Lee el fichero `kustomization.yaml` de la carpeta indicada, combina base más overlay, y aplica el resultado. La diferencia clave para el examen es que Helm no lo entiende kubectl de forma nativa, se ejecuta como binario externo, mientras que Kustomize sí lo entiende kubectl de forma nativa.

### 5.3 Custom Resource Definitions

Conexión con M05: en RBAC viste que Deployments pertenece al apiGroup `apps` y Pods al apiGroup vacío. Estos apiGroups no son fijos ni cerrados: un CRD permite registrar un nuevo tipo de recurso en la API de Kubernetes, con su propio apiGroup, schema y validaciones, sin modificar el código fuente de Kubernetes.

Un CRD es una definición: le dice al apiserver que existe un recurso, por ejemplo CronTab, que pertenece a un grupo determinado, y que tiene ciertos campos. A partir de ahí, `kubectl get crontabs` funciona exactamente igual que `kubectl get pods`.

Lo que un CRD no hace por sí solo es cualquier acción real. Si creas una instancia de CronTab, Kubernetes la guarda en etcd, como cualquier otro objeto, pero nadie hace nada con ella. Es solo almacenamiento estructurado con validación de schema. Esta distinción es la base para entender los Operators.

### 5.4 El patrón Operator

Conexión con M02: recuerda el controller-manager y su reconciliation loop, observar el estado deseado, compararlo con el estado actual, actuar para converger. Un Operator es exactamente ese mismo patrón, pero para un CRD personalizado en lugar de un recurso nativo.

Operator es CRD, el qué, más Controller, el quién actúa. El controller corre como un Deployment normal dentro del cluster, con permisos RBAC sobre su CRD, y ejecuta un bucle infinito: observa, watch, instancias del CRD; compara el estado deseado, definido en el YAML del CRD, contra el estado real del sistema; actúa, creando, modificando o eliminando recursos nativos, Pods, Services, Secrets, para converger al estado deseado; y vuelve al primer paso, indefinidamente.

Los Operators encapsulan conocimiento operacional complejo. cert-manager es un ejemplo real que usarás en el laboratorio: sin un Operator, emitir y renovar certificados TLS es un proceso manual de varios pasos. Con cert-manager, defines un objeto Certificate declarativo, y su controller se encarga de solicitar, renovar y almacenar el certificado como Secret automáticamente, para siempre, sin intervención humana.

### 5.5 Extension interfaces: CNI, CSI, CRI

Conexión con M03: cuando instalaste containerd antes de kubeadm, e instalaste Calico después de inicializar el cluster, ya usaste estas tres interfaces sin nombrarlas formalmente.

Las tres siguen el mismo principio: Kubernetes define un contrato, una interfaz, y distintos proveedores implementan ese contrato de forma intercambiable. Kubernetes no sabe ni le importa cuál implementación corre debajo.

#### CNI, Container Network Interface

Contrato para asignar red a los pods, IP, rutas, reglas de firewall para NetworkPolicy. Implementaciones: Calico, la tuya, Flannel, Cilium, Weave. Sin un CNI instalado, los nodos quedan NotReady indefinidamente, algo que ya viste en M03.

#### CSI, Container Storage Interface

Contrato para que Kubernetes pida almacenamiento a un backend externo, aprovisionar, montar, redimensionar volúmenes, sin conocer los detalles de ese backend. Implementaciones: AWS EBS CSI, GCE PD CSI, Ceph CSI. Se cubre en profundidad más adelante en el módulo dedicado a Storage.

#### CRI, Container Runtime Interface

Contrato entre kubelet y el runtime que realmente crea y destruye contenedores. Implementaciones: containerd, la tuya, y CRI-O. Docker no implementa CRI de forma nativa desde hace varias versiones; por eso Kubernetes usa containerd directamente.

## 6. Diagrama ASCII - Operator reconciliation loop

```text reference
  Usuario crea:
  apiVersion: cert-manager.io/v1
  kind: Certificate
  (instancia de un CRD)
       |
       v
  +-------------------------------------------+
  |            ETCD (via apiserver)             |
  |   guarda el objeto Certificate (deseado)    |
  +-------------------|------------------------+
                       |  watch (el controller
                       |  esta suscrito a cambios
                       |  en el CRD Certificate)
                       v
  +-------------------------------------------+
  |     CERT-MANAGER CONTROLLER (Operator)       |
  |     corre como Deployment normal              |
  |                                               |
  |   1. Detecta el nuevo objeto Certificate      |
  |   2. Estado deseado: certificado emitido      |
  |      Estado actual: no existe el Secret       |
  |   3. ACTUA:                                   |
  |      - genera CSR                             |
  |      - lo firma (self-signed o via ACME)      |
  |      - crea el Secret con el certificado      |
  |   4. Vuelve a esperar cambios (loop)          |
  +-------------------|------------------------+
                       v
              kubectl get secret
              (certificado TLS listo
               para usar en un Ingress)
```

## 7. Ejemplos prácticos desplegables

### 7.1 Instalación de Helm

Ejecutar solo en cka-cp1, Helm es un cliente, no un componente del cluster:

```bash exec
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh
```

```bash exec
helm version
```

```text output
version.BuildInfo{Version:"v3.15.2", GitCommit:"...", GoVersion:"go1.22.4"}
```

### 7.2 Helm, crear y entender un chart propio

```bash exec
helm create mi-app
cat mi-app/templates/deployment.yaml | grep -A2 image:
```

```text output
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
```

Renderizar sin instalar, equivalente a un dry-run:

```bash exec
helm template mi-app-release ./mi-app
```

Instalar el release:

```bash exec
helm install mi-app-release ./mi-app --set replicaCount=3 --set image.tag=1.25
helm list
kubectl get deployments
```

```text output
NAME            NAMESPACE   REVISION   STATUS     CHART
mi-app-release  default     1          deployed   mi-app-0.1.0

NAME                     READY   UP-TO-DATE   AVAILABLE
mi-app-release-mi-app    3/3     3            3
```

Actualizar el release, cambiar un value:

```bash exec
helm upgrade mi-app-release ./mi-app --set replicaCount=5
helm list
```

```text output
NAME            REVISION
mi-app-release  2
```

Revertir a la revisión anterior:

```bash exec
helm rollback mi-app-release 1
kubectl get deployment mi-app-release-mi-app
```

```text output
NAME                     READY
mi-app-release-mi-app    3/3
```

Ver el historial completo:

```bash exec
helm history mi-app-release
```

### 7.3 Helm, instalar un chart real de un repositorio

Agregar el repositorio oficial de ingress-nginx, que también se usará como controlador de Ingress más adelante en el curso:

```bash exec
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm search repo ingress-nginx
```

Inspeccionar los values disponibles antes de instalar:

```bash exec
helm show values ingress-nginx/ingress-nginx | head -30
```

Instalar en su propio namespace:

```bash exec
helm install nginx-ingress ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace
helm list -n ingress-nginx
kubectl get pods -n ingress-nginx
```

```text output
NAME            REVISION   STATUS
nginx-ingress   1          deployed

NAME                                       READY   STATUS
nginx-ingress-ingress-nginx-controller-x   1/1     Running
```

Desinstalar, opcional, para no interferir con módulos posteriores hasta llegar a ellos:

```bash exec
helm uninstall nginx-ingress -n ingress-nginx
```

### 7.4 Kustomize, base y overlays

```bash exec
mkdir -p kustomize-lab/base
mkdir -p kustomize-lab/overlays/desarrollo
mkdir -p kustomize-lab/overlays/produccion
```

Base, Deployment común a todos los entornos:

```yaml config
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
    spec:
      containers:
      - name: web-app
        image: nginx:1.25
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
```

Guardar el YAML anterior como `kustomize-lab/base/deployment.yaml`, y el fichero de índice de la base:

```yaml config
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- deployment.yaml
```

Guardar como `kustomize-lab/base/kustomization.yaml`.

Overlay desarrollo, solo referencia la base, sin cambios:

```yaml config
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- ../../base
namePrefix: dev-
```

Guardar como `kustomize-lab/overlays/desarrollo/kustomization.yaml`.

Overlay producción, patch que sube réplicas y cambia la imagen, sin tocar la base:

```yaml config
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 5
  template:
    spec:
      containers:
      - name: web-app
        image: nginx:1.26
```

Guardar como `kustomize-lab/overlays/produccion/patch-replicas.yaml`.

```yaml config
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- ../../base
namePrefix: prod-
patches:
- path: patch-replicas.yaml
```

Guardar como `kustomize-lab/overlays/produccion/kustomization.yaml`.

Ver el YAML final sin aplicar, equivalente a un dry-run:

```bash exec
kubectl kustomize kustomize-lab/overlays/desarrollo
kubectl kustomize kustomize-lab/overlays/produccion
```

Aplicar cada overlay:

```bash exec
kubectl apply -k kustomize-lab/overlays/desarrollo
kubectl apply -k kustomize-lab/overlays/produccion
kubectl get deployments
```

```text output
NAME             READY
dev-web-app      1/1
prod-web-app     5/5
```

```bash exec
kubectl get deployment prod-web-app -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get deployment dev-web-app -o jsonpath='{.spec.template.spec.containers[0].image}'
```

```text output
nginx:1.26
nginx:1.25
```

La base quedó sin modificar; solo el overlay de producción trae la imagen nueva.

### 7.5 CRD, crear un recurso personalizado sin controller

Ejemplo clásico de la documentación oficial de Kubernetes, para entender la mecánica antes de ver un CRD con controller real:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: crontabs.stable.example.com
spec:
  group: stable.example.com
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              cronSpec:
                type: string
              image:
                type: string
              replicas:
                type: integer
  scope: Namespaced
  names:
    plural: crontabs
    singular: crontab
    kind: CronTab
    shortNames:
    - ct
EOF
```

Verificar que el nuevo tipo de recurso existe en la API, exactamente igual que un tipo nativo:

```bash exec
kubectl api-resources | grep crontab
```

```text output
crontabs   ct   stable.example.com/v1   true   CronTab
```

Crear una instancia del CRD:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: stable.example.com/v1
kind: CronTab
metadata:
  name: mi-nueva-tarea
spec:
  cronSpec: "* * * * */5"
  image: mi-imagen-cron
  replicas: 3
EOF

kubectl get crontabs
```

```text output
NAME             AGE
mi-nueva-tarea   5s
```

Demostración de la ausencia de controller:

```bash exec
kubectl get pods
```

```text output
No resources found in default namespace.
```

Ningún pod se creó. El objeto CronTab existe en etcd, `kubectl get ct` lo confirma, pero nadie actúa sobre él. Esta es la diferencia central explicada en 5.3 y 5.4.

### 7.6 Operator real: cert-manager

cert-manager es un Operator ampliamente usado en producción, y se instala con Helm, conectando 7.2 con el patrón de 5.4.

```bash exec
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager --namespace cert-manager --create-namespace --set crds.enabled=true

kubectl get pods -n cert-manager
```

```text output
NAME                                       READY   STATUS
cert-manager-6d4b9f7c8d-x1234              1/1     Running
cert-manager-cainjector-7f8b9c6d5e-y5678   1/1     Running
cert-manager-webhook-9c8d7e6f5a-z9012      1/1     Running
```

Verificar los CRDs que trajo el Operator:

```bash exec
kubectl get crd | grep cert-manager.io
```

```text output
certificates.cert-manager.io
issuers.cert-manager.io
clusterissuers.cert-manager.io
```

Crear un ClusterIssuer self-signed:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: self-signed-issuer
spec:
  selfSigned: {}
EOF
```

Crear un Certificate, aquí es donde se ve el reconciliation loop en acción, en contraste directo con 7.5, donde no pasaba nada:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: demo-cert
  namespace: default
spec:
  secretName: demo-cert-tls
  issuerRef:
    name: self-signed-issuer
    kind: ClusterIssuer
  commonName: demo.local
  dnsNames:
  - demo.local
EOF
```

```bash exec
kubectl get certificate demo-cert
kubectl get secret demo-cert-tls
```

```text output
NAME        READY   SECRET
demo-cert   True    demo-cert-tls

NAME             TYPE                DATA
demo-cert-tls    kubernetes.io/tls   3
```

READY pasa a True en pocos segundos, y el Secret fue creado por el Operator automáticamente, sin intervención manual.

### 7.7 Extension interfaces, identificar las tuyas

CRI:

```bash exec
kubectl get nodes -o wide
crictl info | grep -A2 runtimeName
```

```text output
containerd://2.3.1
```

CNI:

```bash exec
kubectl get pods -n kube-system | grep calico
ls /etc/cni/net.d/
kubectl get nodes cka-cp1 -o jsonpath='{.spec.podCIDR}'
```

CSI:

```bash exec
kubectl get csidrivers
kubectl get storageclass
```

```text output
No resources found

No resources found
```

Ambos vacíos porque no se ha instalado ningún driver CSI ni configurado storage dinámico en este cluster; se resuelve en el módulo de Storage.

## 8. Laboratorio guiado

Objetivo: desplegar la misma aplicación en dos variantes usando Helm para una y Kustomize para la otra, y entender cuándo usar cada herramienta.

Paso 1, versión estable con Helm, usando el chart propio de 7.2:

```bash exec
helm install app-estable ./mi-app --set replicaCount=2 --set image.tag=1.25
```

Paso 2, versión canary con Kustomize, usando un overlay nuevo sobre la misma base de 7.4:

```bash exec
mkdir -p kustomize-lab/overlays/canary
```

```yaml config
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: web-app
        image: nginx:1.26
```

Guardar como `kustomize-lab/overlays/canary/patch.yaml`.

```yaml config
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- ../../base
namePrefix: canary-
patches:
- path: patch.yaml
```

Guardar como `kustomize-lab/overlays/canary/kustomization.yaml`.

```bash exec
kubectl apply -k kustomize-lab/overlays/canary
```

Paso 3, verificar que ambas conviven sin conflicto:

```bash exec
kubectl get deployments
helm list
```

```text output
NAME                    READY
app-estable-mi-app      2/2
canary-web-app          1/1

NAME            STATUS
app-estable     deployed
```

`helm list` solo muestra app-estable; Kustomize no usa el mecanismo de releases de Helm.

Paso 4, criterio de decisión: usa Helm cuando instalas software de terceros, ingress-nginx, cert-manager, prometheus, cuando necesitas versionado de releases y rollback, o cuando el software tiene muchas variantes configurables. Usa Kustomize cuando gestionas tu propia aplicación en múltiples entornos, prefieres YAML plano y patches declarativos sobre plantillas con variables, o no quieres una dependencia externa, ya que Kustomize ya viene en kubectl.

## 9. Checkpoint

**Pregunta 1**

¿Cuál es la diferencia fundamental de filosofía entre Helm y Kustomize?

Respuesta: Helm parametriza templates con variables, values, para generar YAML. Kustomize parte de YAML plano válido, la base, y aplica patches declarativos por encima, los overlays, sin variables ni templates.

**Pregunta 2**

Creaste un CRD y una instancia de él, pero `kubectl get pods` no muestra nada nuevo. ¿Es un error?

Respuesta: no. Un CRD solo define un esquema y permite guardar el objeto en etcd. Sin un controller, Operator, que observe ese CRD y actúe, no ocurre nada más; es el comportamiento esperado.

**Pregunta 3**

¿Qué dos componentes conforman un Operator?

Respuesta: un CRD, que define el qué, el esquema del recurso personalizado, y un Controller, que define el quién actúa, el reconciliation loop que observa el CRD y modifica el estado real del cluster para converger al estado deseado.

**Pregunta 4**

¿Qué comando usarías para ver el YAML final que generaría un overlay de Kustomize sin aplicarlo al cluster?

Respuesta: `kubectl kustomize` seguido de la ruta del overlay.

**Pregunta 5**

¿Qué interfaz de extensión es responsable de que un pod obtenga una IP al ser programado en un nodo?

Respuesta: CNI, Container Network Interface. En este cluster la implementa Calico.

## 10. Laboratorio cronometrado

Objetivo: completar en menos de 15 minutos.

Tarea:

1. Agrega el repositorio de Helm de ingress-nginx si no lo tienes agregado.
2. Instala el chart ingress-nginx en el namespace examen-helm, creando el namespace, con el nombre de release lab-ingress.
3. Realiza un upgrade del release cambiando el número de réplicas del controller a 2.
4. Crea una estructura de Kustomize con una base con un Deployment llamado api, imagen nginx:1.25, 1 réplica, y un overlay stage que sube a 3 réplicas.
5. Aplica el overlay stage.
6. Guarda en /tmp/revision.txt el número de revisión actual del release lab-ingress.

Criterios de éxito:

```bash exec
helm list -n examen-helm
kubectl get deployment stage-api
cat /tmp/revision.txt
```

```text output
NAME            REVISION   STATUS
lab-ingress     2          deployed

NAME        READY
stage-api   3/3

2
```

Solución de referencia, no mirar hasta terminar:

```bash exec
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install lab-ingress ingress-nginx/ingress-nginx -n examen-helm --create-namespace

helm upgrade lab-ingress ingress-nginx/ingress-nginx -n examen-helm --set controller.replicaCount=2

mkdir -p lab-kustomize/base lab-kustomize/overlays/stage
```

```yaml config
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: nginx:1.25
```

Guardar como `lab-kustomize/base/deployment.yaml`.

```yaml config
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- deployment.yaml
```

Guardar como `lab-kustomize/base/kustomization.yaml`.

```yaml config
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
```

Guardar como `lab-kustomize/overlays/stage/patch.yaml`.

```yaml config
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- ../../base
namePrefix: stage-
patches:
- path: patch.yaml
```

Guardar como `lab-kustomize/overlays/stage/kustomization.yaml`.

```bash exec
kubectl apply -k lab-kustomize/overlays/stage

helm list -n examen-helm -o json | grep -o '"revision":"[0-9]*"' | grep -o '[0-9]*' > /tmp/revision.txt
```

## 11. Troubleshooting - casos reales

### Caso 1: helm install falla con CRDs ya existentes

**Síntoma:**

El comando `helm install` falla con un mensaje del tipo "rendered manifests contain a resource that already exists. Unable to continue with install: CustomResourceDefinition already exists and cannot be imported into the current release".

Diagnóstico paso a paso:

Un intento anterior de instalación, o una instalación manual de los CRDs, dejó los CRDs en el cluster, pero Helm no los tiene registrados como parte de ningún release suyo.

```bash exec
kubectl get crd | grep cert-manager.io
helm list -A
```

**Solución:**

Si es un release huérfano, eliminar los CRDs manualmente antes de reinstalar, una acción destructiva que perdería las instancias existentes:

```bash exec
kubectl delete crd certificates.cert-manager.io issuers.cert-manager.io clusterissuers.cert-manager.io
```

O usar `helm upgrade --install` en lugar de `helm install`, que crea el release si no existe o lo actualiza si ya existe:

```bash exec
helm upgrade --install cert-manager jetstack/cert-manager -n cert-manager --create-namespace --set crds.enabled=true
```

### Caso 2: el patch de Kustomize no se aplica

**Síntoma:**

`kubectl apply -k` sobre un overlay no produce el cambio esperado; las réplicas siguen en el valor de la base.

Diagnóstico paso a paso:

```bash exec
kubectl kustomize kustomize-lab/overlays/produccion
```

Renderizar sin aplicar y revisar visualmente el YAML resultante. La causa más común es que el `metadata.name` del patch no coincide exactamente con el `metadata.name` del recurso en la base. Kustomize empareja recursos por kind más name, no por posición en el fichero.

```bash exec
grep name: kustomize-lab/overlays/produccion/patch-replicas.yaml
grep -A1 "^metadata:" kustomize-lab/base/deployment.yaml
```

Ambos deben decir `name: web-app` exactamente.

**Solución:**

Corregir el `name` en el patch para que coincida con el de la base. Recordar que `namePrefix` se aplica después de emparejar, no antes.

### Caso 3: Certificate se queda en READY False

**Síntoma:**

`kubectl get certificate demo-cert` muestra READY False de forma persistente, sin cambiar después de varios minutos.

Diagnóstico paso a paso:

```bash exec
kubectl describe certificate demo-cert
```

Revisar la sección Events y Conditions.

```bash exec
kubectl get certificaterequest
```

Ver si el CertificateRequest asociado se creó.

```bash exec
kubectl logs -n cert-manager -l app.kubernetes.io/name=cert-manager --tail=50
```

Ver logs del controller, el cerebro del Operator, donde está la lógica real.

Causas comunes: el ClusterIssuer referenciado no existe o tiene un error de escritura en `issuerRef.name`, el ClusterIssuer mismo no está Ready, o el webhook de cert-manager no está listo aún, tarda unos segundos tras la instalación.

```bash exec
kubectl describe clusterissuer self-signed-issuer
```

**Solución:**

Corregir el `issuerRef` si apunta a un nombre incorrecto, o esperar a que el webhook termine de inicializar, confirmando que todos los pods de cert-manager, incluido el webhook, estén Running.

## 12. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Todos los comandos de este módulo se ejecutan desde cka-cp1.

**Alternativa K3s (plan B):** Helm y Kustomize funcionan de forma idéntica en K3s, son herramientas de cliente independientes del tipo de cluster. K3s incluye además un controller propio llamado Helm Controller, que expone un CRD adicional, HelmChart, apiGroup `helm.cattle.io`, para instalar charts de forma declarativa vía manifiestos, además del Helm CLI tradicional usado en este módulo. No es parte del temario CKA, pero es útil saber que existe si practicas en K3s y ves ese CRD inesperado con `kubectl get crd`. Sobre CSI en K3s: trae por defecto el local-path-provisioner como StorageClass, que no es un driver CSI real, es anterior al estándar CSI y usa una implementación propia más simple; `kubectl get csidrivers` también aparecería vacío por defecto, igual que en tu cluster kubeadm sin CSI instalado.

Limpieza del módulo:

```bash exec
helm uninstall app-estable
helm uninstall lab-ingress -n examen-helm
helm uninstall cert-manager -n cert-manager
kubectl delete namespace examen-helm cert-manager
kubectl delete crd crontabs.stable.example.com
kubectl delete -k kustomize-lab/overlays/desarrollo
kubectl delete -k kustomize-lab/overlays/produccion
kubectl delete -k kustomize-lab/overlays/canary
kubectl delete -k lab-kustomize/overlays/stage
rm -rf mi-app kustomize-lab lab-kustomize get_helm.sh
```

---

**Siguiente módulo:** M07 - Workloads: Deployments, DaemonSets, StatefulSets