# M05 - RBAC y Seguridad del Cluster

## 1. Resumen técnico

RBAC, Role-Based Access Control, es el mecanismo de autorización de Kubernetes: define quién puede hacer qué sobre qué recursos y en qué ámbito. Se implementa con cuatro objetos, Role, ClusterRole, RoleBinding y ClusterRoleBinding, y dos tipos de identidad, usuarios vía certificados y ServiceAccounts. Este módulo cubre el flujo completo: crear una identidad, otorgarle permisos, construir su kubeconfig, y verificar accesos.

## 2. Peso en el examen y preguntas típicas

RBAC es de las tareas más frecuentes del dominio de 25%. Preguntas típicas:

- Crea un Role que permita get, list y watch sobre pods en un namespace, y asócialo a un usuario.
- Crea un ServiceAccount con permisos para crear deployments y asócialo a un pod.
- Un usuario no puede listar secrets, diagnostica por qué y corrígelo.
- Firma el CSR pendiente de un usuario y crea su kubeconfig.

## 3. Prerrequisitos

De M02 (Arquitectura) usarás el flujo de una petición a la API, autenticación, autorización, admisión, que aquí se profundiza específicamente en la fase de autorización.

De M03 (kubeadm) usarás la CA del cluster en `/etc/kubernetes/pki/` y la estructura de un kubeconfig, ambas necesarias para construir la identidad de un usuario nuevo.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Explicar el flujo autenticación, autorización, admisión, y en qué punto exacto encaja RBAC.
2. Crear Roles y ClusterRoles con los verbos y recursos correctos.
3. Distinguir cuándo usar Role frente a ClusterRole, y RoleBinding frente a ClusterRoleBinding.
4. Crear un usuario completo: clave, CSR, firma, kubeconfig funcional.
5. Crear ServiceAccounts y asociarlos a pods.
6. Diagnosticar errores de permisos con `kubectl auth can-i` y `describe`.

## 5. Explicación teórica progresiva

### 5.1 El flujo de seguridad de la API

Conexión con M02: toda petición pasa por el apiserver, que la somete a tres fases en orden estricto.

La fase de autenticación responde a la pregunta de quién eres. Los métodos principales son certificados X.509 para usuarios humanos, y tokens de ServiceAccount para pods y procesos. Si falla, la respuesta es 401 Unauthorized.

La fase de autorización responde a qué puedes hacer. Aquí vive RBAC: el apiserver evalúa si la identidad tiene permiso para el verbo, el recurso y el namespace de la petición. Si falla, la respuesta es 403 Forbidden.

La fase de admisión responde a si se permite esta operación concreta. Son webhooks y controladores que pueden mutar o rechazar el objeto, como quotas o policies, fuera del alcance de este módulo.

La regla clave para diagnóstico es que 401 significa problema de identidad, certificado o token, y 403 significa problema de permisos, RBAC. Distinguirlos ahorra minutos en el examen.

### 5.2 Identidades: usuarios y ServiceAccounts

Kubernetes no tiene un objeto User. No existe `kubectl create user`. Un usuario es simplemente cualquier identidad presentada con un certificado firmado por la CA del cluster: el campo CN, Common Name, del certificado es el nombre de usuario, y el campo O, Organization, es el grupo, que puede repetirse para pertenecer a varios grupos.

Los ServiceAccounts sí son objetos de la API, identidades para procesos como pods y controllers:

```bash exec
kubectl create serviceaccount mi-sa
```

Cada pod puede montar el token de un ServiceAccount y usarlo para autenticarse contra la API desde dentro.

### 5.3 Los cuatro objetos de RBAC

#### Role

Conjunto de permisos limitado a un namespace, por ejemplo get y list sobre pods en el namespace desarrollo.

#### ClusterRole

Conjunto de permisos sin namespace, con dos usos: recursos cluster-wide como nodes o namespaces, o permisos reutilizables en varios namespaces distintos.

#### RoleBinding

Asocia una identidad con un Role, o con un ClusterRole, dentro de un namespace concreto.

#### ClusterRoleBinding

Asocia una identidad con un ClusterRole en todo el cluster.

La matriz de decisión es la siguiente. Un permiso en un solo namespace usa Role más RoleBinding. El mismo permiso en varios namespaces usa un ClusterRole más un RoleBinding por namespace, ya que el RoleBinding puede referenciar un ClusterRole y el permiso queda limitado al namespace del binding, un patrón muy común en el examen. Un permiso sobre recursos cluster-wide o en todos los namespaces usa ClusterRole más ClusterRoleBinding.

### 5.4 Anatomía de una regla

Toda regla RBAC tiene tres partes.

#### apiGroups

El grupo de API al que pertenece el recurso. El grupo vacío, `""`, es el grupo core, que incluye pods, services, secrets, configmaps y serviceaccounts. El grupo `apps` incluye deployments, daemonsets, statefulsets y replicasets. El grupo `batch` incluye jobs y cronjobs. El grupo `networking.k8s.io` incluye networkpolicies e ingresses. El grupo `rbac.authorization.k8s.io` incluye roles y bindings.

#### resources

El tipo de recurso, en plural y minúscula: pods, deployments, secrets, nodes. Los subrecursos usan una barra, por ejemplo `pods/log` o `pods/exec`.

#### verbs

Las acciones permitidas. get, list y watch son de lectura. create, update y patch son de escritura. delete y deletecollection son de borrado. El asterisco significa todos los verbos, y conviene evitarlo salvo que la tarea del examen lo pida explícitamente.

Cómo descubrir el apiGroup sin memorizar, conectando con M01:

```bash exec
kubectl api-resources | grep deployment
```

```text output
NAME          SHORTNAMES   APIVERSION   NAMESPACED   KIND
deployments   deploy       apps/v1      true         Deployment
```

Si el apiVersion es `apps/v1`, el apiGroup es `apps`. Si el apiVersion es simplemente `v1`, sin grupo, el apiGroup es la cadena vacía, `""`.

## 6. Diagrama ASCII - flujo de una petición autorizada

```text reference
  kubectl get pods -n desarrollo
  (certificado con CN=juan, O=dev-team)
       |
       v
  +---------------------------------------------+
  |              KUBE-APISERVER                  |
  |                                               |
  |  1. AUTHENTICATION                           |
  |     Certificado firmado por la CA?           |
  |     SI -> identidad: user=juan,               |
  |           groups=[dev-team]                  |
  |     NO -> 401 Unauthorized (FIN)              |
  |                |                              |
  |                v                              |
  |  2. AUTHORIZATION (RBAC)                      |
  |     Existe algun binding que asocie a juan    |
  |     (o a dev-team) con un Role o ClusterRole  |
  |     que permita:                              |
  |       verbo=list, recurso=pods,               |
  |       namespace=desarrollo?                   |
  |     SI -> continua                            |
  |     NO -> 403 Forbidden (FIN)                 |
  |                |                              |
  |                v                              |
  |  3. ADMISSION CONTROL                         |
  |     (no aplica a lecturas simples)            |
  +----------------|------------------------------+
                    v
              etcd (lectura)
                    |
                    v
              respuesta: lista de pods
```

## 7. Ejemplos prácticos desplegables

### 7.1 Role y RoleBinding para un usuario

```bash exec
kubectl create namespace desarrollo

kubectl apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: desarrollo
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["pods/log"]
  verbs: ["get"]
EOF

kubectl apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader-juan
  namespace: desarrollo
subjects:
- kind: User
  name: juan
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
EOF
```

Verificación inmediata, sin necesitar el usuario real:

```bash exec
kubectl auth can-i list pods --as=juan -n desarrollo
kubectl auth can-i delete pods --as=juan -n desarrollo
kubectl auth can-i list pods --as=juan -n default
```

```text output
yes
no
no
```

La última respuesta es no porque el Role es del namespace desarrollo, no de default.

El campo `roleRef` es inmutable. Si te equivocas de Role en un binding, no puedes editarlo: hay que borrar y recrear el binding.

Versión imperativa, más rápida en el examen:

```bash exec
kubectl create role pod-reader --verb=get,list,watch --resource=pods,pods/log -n desarrollo

kubectl create rolebinding pod-reader-juan --role=pod-reader --user=juan -n desarrollo
```

### 7.2 ClusterRole reutilizado en un namespace

Patrón de examen: un ClusterRole genérico, limitado a un namespace vía RoleBinding.

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: deployment-manager
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "create", "update", "patch"]
EOF

kubectl apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: deploy-mgr-ana
  namespace: desarrollo
subjects:
- kind: User
  name: ana
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: deployment-manager
  apiGroup: rbac.authorization.k8s.io
EOF
```

```bash exec
kubectl auth can-i create deployments --as=ana -n desarrollo
kubectl auth can-i create deployments --as=ana -n default
```

```text output
yes
no
```

El ClusterRole no da acceso global: el RoleBinding lo limita al namespace desarrollo.

### 7.3 ServiceAccount con permisos, montado en un pod

```bash exec
kubectl create serviceaccount app-sa -n desarrollo

kubectl create role cm-reader --verb=get,list --resource=configmaps -n desarrollo

kubectl create rolebinding cm-reader-app-sa --role=cm-reader --serviceaccount=desarrollo:app-sa -n desarrollo
```

El formato del subject es `--serviceaccount=NAMESPACE:NOMBRE`. En YAML, el subject de un ServiceAccount es `kind: ServiceAccount`, `name: app-sa`, `namespace: desarrollo`, sin el campo `apiGroup` que sí llevan los usuarios.

Pod que usa el ServiceAccount:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: sa-test
  namespace: desarrollo
spec:
  serviceAccountName: app-sa
  containers:
  - name: main
    image: curlimages/curl
    command: ["sh", "-c", "sleep 3600"]
EOF
```

Probar los permisos desde dentro del pod contra la API, un patrón que aparece en el examen:

```bash exec
kubectl exec -n desarrollo sa-test -- sh -c 'TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token); CACERT=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt; curl -s --cacert $CACERT -H "Authorization: Bearer $TOKEN" https://kubernetes.default.svc/api/v1/namespaces/desarrollo/configmaps'
```

```text output
{"kind":"ConfigMapList","apiVersion":"v1","items":[...]}
```

Respuesta 200 con la lista de configmaps.

```bash exec
kubectl exec -n desarrollo sa-test -- sh -c 'TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token); CACERT=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt; curl -s --cacert $CACERT -H "Authorization: Bearer $TOKEN" https://kubernetes.default.svc/api/v1/namespaces/desarrollo/secrets'
```

```text output
{"kind":"Status","status":"Failure","reason":"Forbidden","code":403}
```

403 porque el ServiceAccount no tiene permiso sobre secrets.

Verificación rápida sin entrar al pod, usando el formato de identidad de un ServiceAccount, `system:serviceaccount:<namespace>:<nombre>`:

```bash exec
kubectl auth can-i list configmaps --as=system:serviceaccount:desarrollo:app-sa -n desarrollo
```

```text output
yes
```

## 8. Laboratorio guiado: crear un usuario completo

Objetivo: crear el usuario maria con acceso de lectura a pods en desarrollo, desde la clave privada hasta un kubeconfig funcional. Este flujo completo es materia de examen.

Conexión con M03: se usará la CA del cluster que kubeadm creó en `/etc/kubernetes/pki/`. Todo se ejecuta en cka-cp1.

Paso 1, generar clave privada y CSR de maria, con CN igual al usuario y O igual al grupo:

```bash exec
openssl genrsa -out maria.key 2048
openssl req -new -key maria.key -subj "/CN=maria/O=dev-team" -out maria.csr
```

Paso 2, enviar el CSR a Kubernetes para su firma. El objeto CertificateSigningRequest espera el CSR en base64 sin saltos de línea.

Este heredoc usa EOF sin comillas a propósito, para que bash expanda la variable `CSR_B64`; es la única excepción a la convención de `<<'EOF'` de este curso.

```bash exec
CSR_B64=$(cat maria.csr | base64 | tr -d '\n')

kubectl apply -f - <<EOF
apiVersion: certificates.k8s.io/v1
kind: CertificateSigningRequest
metadata:
  name: maria
spec:
  request: ${CSR_B64}
  signerName: kubernetes.io/kube-apiserver-client
  expirationSeconds: 86400
  usages:
  - client auth
EOF
```

Paso 3, aprobar el CSR:

```bash exec
kubectl get csr
kubectl certificate approve maria
kubectl get csr
```

```text output
NAME    AGE   SIGNERNAME                            REQUESTOR          CONDITION
maria   5s    kubernetes.io/kube-apiserver-client    kubernetes-admin   Pending

certificatesigningrequest.certificates.k8s.io/maria approved

NAME    AGE   SIGNERNAME                            REQUESTOR          CONDITION
maria   8s    kubernetes.io/kube-apiserver-client    kubernetes-admin   Approved,Issued
```

Paso 4, extraer el certificado firmado:

```bash exec
kubectl get csr maria -o jsonpath='{.status.certificate}' | base64 -d > maria.crt
openssl x509 -in maria.crt -noout -subject
```

```text output
subject=O=dev-team, CN=maria
```

Paso 5, dar permisos a maria, reutilizando el Role pod-reader de la sección 7.1:

```bash exec
kubectl create rolebinding pod-reader-maria --role=pod-reader --user=maria -n desarrollo
```

Paso 6, construir el kubeconfig de maria:

```bash exec
kubectl config set-cluster kubernetes --server=https://172.16.46.130:6443 --certificate-authority=/etc/kubernetes/pki/ca.crt --embed-certs=true --kubeconfig=maria.kubeconfig

kubectl config set-credentials maria --client-certificate=maria.crt --client-key=maria.key --embed-certs=true --kubeconfig=maria.kubeconfig

kubectl config set-context maria@kubernetes --cluster=kubernetes --user=maria --namespace=desarrollo --kubeconfig=maria.kubeconfig

kubectl config use-context maria@kubernetes --kubeconfig=maria.kubeconfig
```

Paso 7, probar el kubeconfig:

```bash exec
kubectl --kubeconfig=maria.kubeconfig get pods
kubectl --kubeconfig=maria.kubeconfig get pods -n default
kubectl --kubeconfig=maria.kubeconfig delete pod sa-test
```

```text output
No resources found in desarrollo namespace.

Error from server (Forbidden): pods is forbidden: User "maria" cannot list resource "pods" in API group "" in the namespace "default"

Error from server (Forbidden): pods "sa-test" is forbidden: User "maria" cannot delete resource "pods" in API group "" in the namespace "desarrollo"
```

El 403 en los dos últimos comandos confirma que la autenticación funciona, no es 401, y que RBAC limita correctamente.

## 9. Checkpoint

**Pregunta 1**

Un usuario recibe 401 al ejecutar `kubectl get pods`. Otro recibe 403. ¿Cuál es el problema de cada uno?

Respuesta: 401 es autenticación fallida, certificado inválido, expirado o no firmado por la CA del cluster. 403 es autenticado correctamente pero sin permisos RBAC para esa operación.

**Pregunta 2**

Necesitas dar permiso de lectura de secrets a un usuario en tres namespaces distintos. ¿Qué objetos creas?

Respuesta: un ClusterRole y tres RoleBindings, uno por namespace, todos referenciando el mismo ClusterRole. No un ClusterRoleBinding, que daría acceso en todos los namespaces del cluster.

**Pregunta 3**

¿Cómo verificas si un ServiceAccount puede crear deployments en su propio namespace?

Respuesta: `kubectl auth can-i create deployments --as=system:serviceaccount:NAMESPACE:NOMBRE -n NAMESPACE`.

**Pregunta 4**

Creaste un RoleBinding apuntando al Role equivocado. ¿Puedes corregirlo con `kubectl edit`?

Respuesta: no. El campo `roleRef` es inmutable. Hay que borrar el binding y recrearlo con el Role correcto.

**Pregunta 5**

¿En qué campo del certificado va el nombre de usuario, y en cuál el grupo?

Respuesta: CN, Common Name, es el usuario. O, Organization, es el grupo.

## 10. Laboratorio cronometrado

Objetivo: completar en menos de 12 minutos.

Tarea:

1. Crea el namespace rbac-lab.
2. Crea el ServiceAccount ci-bot en rbac-lab.
3. Crea un Role ci-role en rbac-lab que permita get, list, create y delete sobre pods, y get y list sobre configmaps.
4. Asocia ci-role al ServiceAccount ci-bot.
5. Crea un ClusterRole node-viewer que permita get y list sobre nodes.
6. Da a ci-bot el permiso node-viewer a nivel cluster.
7. Guarda en /tmp/rbac1.txt si ci-bot puede borrar pods en rbac-lab.
8. Guarda en /tmp/rbac2.txt si ci-bot puede borrar nodes.

Criterios de éxito:

```bash exec
cat /tmp/rbac1.txt
cat /tmp/rbac2.txt
```

```text output
yes
no
```

Solución de referencia, no mirar hasta terminar:

```bash exec
kubectl create namespace rbac-lab

kubectl create serviceaccount ci-bot -n rbac-lab

kubectl apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ci-role
  namespace: rbac-lab
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "create", "delete"]
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list"]
EOF

kubectl create rolebinding ci-role-bot --role=ci-role --serviceaccount=rbac-lab:ci-bot -n rbac-lab

kubectl create clusterrole node-viewer --verb=get,list --resource=nodes

kubectl create clusterrolebinding node-viewer-bot --clusterrole=node-viewer --serviceaccount=rbac-lab:ci-bot

kubectl auth can-i delete pods --as=system:serviceaccount:rbac-lab:ci-bot -n rbac-lab > /tmp/rbac1.txt

kubectl auth can-i delete nodes --as=system:serviceaccount:rbac-lab:ci-bot > /tmp/rbac2.txt
```

## 11. Troubleshooting - casos reales

### Caso 1: auth can-i dice yes pero el usuario real recibe 403

**Síntoma:**

El comando `kubectl auth can-i list pods --as=juan -n desarrollo` devuelve yes, pero el usuario juan real recibe 403 al ejecutar el mismo comando desde su propio kubeconfig.

Diagnóstico paso a paso:

El error 403 real incluye la identidad exacta evaluada por el apiserver. Ese mensaje suele revelar la causa.

```bash exec
kubectl --kubeconfig=maria.kubeconfig get pods -n desarrollo
```

Comparar el nombre de usuario que aparece en el mensaje de error contra el nombre usado en el binding: RBAC distingue mayúsculas de minúsculas, así que "Juan" y "juan" son identidades distintas.

```bash exec
openssl x509 -in maria.crt -noout -subject
```

**Solución:**

Corregir el subject del binding, borrarlo y recrearlo, o regenerar el certificado con el CN correcto, para que ambos coincidan exactamente.

### Caso 2: ServiceAccount recibe 403 pese a que el binding existe

**Síntoma:**

Un pod con `serviceAccountName: app-sa` recibe 403, aunque el RoleBinding correspondiente exista.

Diagnóstico paso a paso:

```bash exec
kubectl describe rolebinding cm-reader-app-sa -n desarrollo
```

Revisar el subject completo: kind ServiceAccount, name correcto, y sobre todo el campo namespace del subject. Un error típico es que el subject diga `namespace: default` en lugar de `namespace: desarrollo`. Un ServiceAccount se identifica como `system:serviceaccount:NS:NOMBRE`; si el namespace del subject no coincide, es otra identidad completamente distinta.

```bash exec
kubectl auth can-i get configmaps --as=system:serviceaccount:desarrollo:app-sa -n desarrollo
```

```bash exec
kubectl get pod sa-test -n desarrollo -o jsonpath='{.spec.serviceAccountName}'
```

**Solución:**

Corregir el namespace del subject en el binding, borrándolo y recreándolo, o corregir el `serviceAccountName` del pod si apunta al ServiceAccount equivocado.

### Caso 3: Role correcto en apariencia, pero el recurso tiene otro apiGroup

**Síntoma:**

Un Role permite get y list sobre deployments, pero el usuario recibe 403 al listar deployments.

Diagnóstico paso a paso:

```bash exec
kubectl get role dev-role -n desarrollo -o yaml
```

Revisar el campo `apiGroups` de la regla. deployments pertenece al grupo `apps`, no al core. Con `apiGroups: [""]`, la regla aplica a un recurso deployments del core que no existe.

```bash exec
kubectl api-resources | grep deployments
```

```text output
NAME          APIVERSION   NAMESPACED   KIND
deployments   apps/v1      true         Deployment
```

**Solución:**

```bash exec
kubectl edit role dev-role -n desarrollo
```

Cambiar `apiGroups: [""]` por `apiGroups: ["apps"]`. Las rules, a diferencia del `roleRef` de los bindings, sí son editables.

```bash exec
kubectl auth can-i list deployments --as=juan -n desarrollo
```

```text output
yes
```

## 12. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Todo el módulo se ejecuta desde cka-cp1, ya que el laboratorio guiado necesita acceso a `/etc/kubernetes/pki/`.

**Alternativa K3s (plan B):** todo el RBAC funciona idéntico, ya que es API estándar. La diferencia es que la CA no está en `/etc/kubernetes/pki/` sino en `/var/lib/rancher/k3s/server/tls/`, con `client-ca.crt` y `client-ca.key` para firmar, y `server-ca.crt` para el kubeconfig, y el kubeconfig admin es `/etc/rancher/k3s/k3s.yaml`. El flujo de CSR vía la API de Kubernetes del paso 2 del laboratorio guiado funciona igual y es el método recomendado también en K3s.

Limpieza del módulo:

```bash exec
kubectl delete namespace desarrollo rbac-lab
kubectl delete clusterrole deployment-manager node-viewer
kubectl delete clusterrolebinding node-viewer-bot
kubectl delete csr maria
rm -f maria.key maria.csr maria.crt maria.kubeconfig
```

---

**Siguiente módulo:** M06 - Helm, Kustomize, CRDs, Operators y Extension Interfaces