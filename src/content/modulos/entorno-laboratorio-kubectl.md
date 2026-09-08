---
code: M01
order: 1
slug: entorno-laboratorio-kubectl
title: Entorno de laboratorio, kubectl avanzado y estrategia de examen CKA
description: Prepara el entorno de laboratorio, domina kubectl imperativo y practica una estrategia eficiente para el examen CKA.
access: free
updated: "2026-09-07"
---

## 1. Resumen técnico

El examen CKA es 100% práctico en terminal: 2 horas, 15-20 tareas, aprobado con 66%. La diferencia entre aprobar y fallar suele ser velocidad de ejecución, no conocimiento. Este módulo construye la base operacional que sostiene todo el curso: configuración de vim y bash, kubectl en modo imperativo, manejo de contextos y namespaces, extracción de datos, y la estrategia de gestión de tiempo del examen real.

## 2. Prerrequisitos

Ninguno. Este es el punto de partida del programa; el resto de los módulos asumen que ya dominas el contenido de este.

## 3. Entorno de práctica

Cluster kubeadm real de 3 nodos:

- cka-cp1, control-plane, 172.16.46.130
- cka-worker1, worker, 172.16.46.128
- cka-worker2, worker, 172.16.46.129

Ubuntu 24.04.4 LTS, Kubernetes v1.35.5, containerd 2.3.1, CNI Calico.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Configurar vim y bash para operar al ritmo del examen.
2. Generar cualquier recurso YAML en menos de 20 segundos usando kubectl en modo imperativo.
3. Navegar entre contextos y namespaces sin errores.
4. Extraer cualquier campo de un recurso usando custom-columns, jsonpath o grep/awk según el caso.
5. Localizar documentación permitida (kubernetes.io, helm.sh, gateway-api.sigs.k8s.io) en menos de 60 segundos.
6. Aplicar la estrategia de gestión de tiempo del examen.

## 5. Configuración del entorno

### 5.1 vim

El examen permite vim y nano. YAML es estricto: un tab en lugar de espacios rompe el manifiesto con errores poco claros.

Configuración validada en este laboratorio. Ejecutar una vez en cada nodo:

```bash exec
cat >> ~/.vimrc <<'EOF'
set number
set expandtab
set tabstop=2
set shiftwidth=2
EOF
```

#### El ajuste number

Muestra números de línea. Cuando kubectl reporta "error at line 14", localizas la línea al instante.

#### El ajuste expandtab

Convierte la tecla Tab en espacios. YAML no acepta tabs; este ajuste elimina la causa número uno de manifiestos rotos.

#### El ajuste tabstop=2

Cada Tab equivale a 2 espacios, una convención habitual y legible en manifiestos de Kubernetes.

#### El ajuste shiftwidth=2

La indentación con los comandos `>>` y `<<` de vim usa 2 espacios, consistente con tabstop.

#### Por qué no se incluyen autoindent ni pastetoggle

autoindent suma indentación propia al pegar YAML desde el navegador y termina rompiéndolo; pastetoggle solo existe para mitigar ese problema. Sin autoindent, ninguno de los dos es necesario. Esta configuración de 4 líneas está validada pegando manifiestos reales desde kubernetes.io sin que la indentación se altere.

Verificación:

```bash exec
vim /tmp/test.yaml
```

Pulsa Tab en cualquier línea: debe insertar 2 espacios, no el carácter `^I`. Pega un bloque YAML copiado desde kubernetes.io: la indentación debe mantenerse intacta. Comprobarlo con:

```bash exec
cat -A /tmp/test.yaml
```

Ningún `^I` debe aparecer en la salida.

### 5.2 bash: aliases y variables

Los aliases se dividen en dos grupos según su impacto real en el examen.

```bash exec
cat >> ~/.bashrc <<'EOF'
alias k='kubectl'
export do='--dry-run=client -o yaml'
export now='--force --grace-period=0'
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
source <(kubectl completion bash)
complete -F __start_kubectl k
EOF

source ~/.bashrc
```

#### El alias k, obligatorio

Reduce de siete a un carácter el nombre del comando y evita escritura repetitiva.

#### La variable do, obligatoria

Genera YAML sin crear el recurso. Es la base de todo el trabajo imperativo del examen. Uso típico: `kubectl create deployment web --image=nginx $do`.

#### La variable now, obligatoria

Elimina pods sin esperar el grace period de 30 segundos, forzando su borrado de la API antes de confirmar que el proceso terminó realmente. Kubernetes advierte que esto puede dejar procesos duplicados o inconsistencias si el contenedor seguía activo; úsala solo cuando la tarea lo permita explícitamente o el pod ya esté en un estado irrecuperable y el riesgo de un proceso concurrente sea aceptable. Uso típico: `kubectl delete pod mi-pod $now`.

#### Los aliases kgp y kgs, opcionales

Solo son útiles para el caso más simple: pods o services del namespace actual, sin ninguna opción adicional. En cuanto necesitas flags (`-n`, `-o wide`, `--show-labels`), usa `k` directamente, por ejemplo `k get pods -n kube-system -o wide`. Decide según tu preferencia; con `k` ya cubres todo lo que ellos ofrecen.

#### El autocompletado, obligatorio

`source <(kubectl completion bash)` habilita el autocompletado de recursos, flags, namespaces y nombres de objetos. `complete -F __start_kubectl k` extiende ese autocompletado al alias `k`; sin esta línea, Tab funciona con `kubectl` pero no con `k`.

Verificación:

```bash exec
k get nodes
kubectl create deployment demo --image=nginx:1.25 $do
```

```text output
NAME          STATUS   ROLES           VERSION
cka-cp1       Ready    control-plane   v1.35.5
cka-worker1   Ready    <none>          v1.35.5
cka-worker2   Ready    <none>          v1.35.5

apiVersion: apps/v1
kind: Deployment
metadata:
  creationTimestamp: null
  labels:
    app: demo
  name: demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: demo
  ...
```

Escribe `k get po` y pulsa Tab dos veces: debe ofrecer `pods`, `podtemplates`, `poddisruptionbudgets`.

Si el autocompletado no responde:

```bash exec
apt-get install bash-completion -y
source /usr/share/bash-completion/bash_completion
source ~/.bashrc
```

El entorno del examen real trae el autocompletado habilitado por defecto; en este laboratorio puede requerir esa instalación previa.

## 6. kubectl imperativo, la herramienta central

Nunca escribas un YAML desde cero si kubectl puede generarlo. El patrón es siempre el mismo:

```text reference
kubectl create <recurso> <nombre> <opciones> $do > fichero.yaml
vim fichero.yaml               # editar solo si es necesario
kubectl apply -f fichero.yaml
kubectl get <recurso>          # verificar
```

Recursos frecuentes en el examen:

```bash exec
kubectl create deployment mi-app --image=nginx:1.25 --replicas=3 $do > deployment.yaml
kubectl run mi-pod --image=busybox --restart=Never $do > pod.yaml
kubectl run debug-pod --image=busybox --restart=Never --command $do -- sh -c "sleep 3600" > pod-debug.yaml
kubectl expose deployment mi-app --port=80 --target-port=80 --name=mi-app-svc $do > svc.yaml
kubectl create configmap mi-config --from-literal=env=produccion $do > cm.yaml
kubectl create secret generic mi-secret --from-literal=password=supersecreta $do > sec.yaml
kubectl create serviceaccount mi-sa $do > sa.yaml
kubectl create cronjob mi-job --image=busybox --schedule="*/5 * * * *" $do -- echo hola > cron.yaml
```

Los campos `creationTimestamp: null` y `status: {}` que genera `$do` son inocuos, no pierdas tiempo eliminándolos.

Modificar recursos existentes, dos vías según el caso.

Para un cambio puntual, edítalo directamente sin pasar por un fichero intermedio:

```bash exec
kubectl edit deployment mi-app
```

O usa un comando específico cuando el cambio lo permite, por ejemplo actualizar solo la imagen:

```bash exec
kubectl set image deployment/mi-app nginx=nginx:1.26
```

Exportar un objeto vivo con `kubectl get -o yaml` y aplicarlo directamente NO es por sí sola una vía segura: `kubectl apply` calcula sus cambios a partir de la anotación `last-applied-configuration`, que solo existe si el recurso ya se gestionaba de forma declarativa, es decir, si se creó originalmente con `apply` o con `create --save-config`. Si el recurso se creó de forma imperativa y quieres migrarlo a gestión declarativa, exporta el YAML, retira los campos que rellena el servidor (`status`, `metadata.uid`, `metadata.resourceVersion`, `metadata.creationTimestamp`, entre otros) y aplícalo una primera vez para que `apply` empiece a registrar su propio historial:

```bash exec
kubectl get deployment mi-app -o yaml > mi-app.yaml
vim mi-app.yaml
```

```bash exec
kubectl apply -f mi-app.yaml
kubectl rollout status deployment/mi-app
```

## 7. Namespaces y contextos

Cada tarea del examen designa un host distinto en su enunciado. El flujo real de trabajo es: partes del sistema `base`, entras por SSH al host indicado para esa tarea, la resuelves, y ejecutas `exit` para volver a `base` antes de leer la siguiente pregunta.

```text reference
ssh <host-de-la-tarea>
... resolver la tarea ...
exit
```

Dentro del host de la tarea sigues necesitando contextos y namespaces del cluster para ubicarte, igual que en cualquier trabajo con kubectl. No son el mecanismo que selecciona la tarea, pero sí una herramienta operativa constante una vez dentro del host correcto.

Contextos:

```bash exec
kubectl config get-contexts
kubectl config use-context k3s
kubectl config current-context
kubectl config view --minify
```

El asterisco en `get-contexts` indica el contexto activo. Verifica el contexto y el namespace activos al llegar a cada host, antes de ejecutar cualquier comando.

Namespaces:

```bash exec
kubectl create namespace desarrollo
kubectl get namespaces
kubectl get pods -n kube-system
```

Fijar namespace por defecto, ahorra escribir `-n` en cada comando:

```bash exec
kubectl config set-context --current --namespace=desarrollo
kubectl config view --minify | grep namespace
```

Si una pregunta dice "trabaja en el namespace kube-system", fija ese namespace al inicio y todos los comandos siguientes ya no necesitan `-n kube-system`. Al terminar la pregunta, vuelve a default para no contaminar la siguiente tarea:

```bash exec
kubectl config set-context --current --namespace=default
```

## 8. Inspección y extracción de datos

### 8.1 describe, logs, exec

```bash exec
kubectl describe pod mi-pod
```

La sección Events al final es la razón de casi todo fallo de arranque o scheduling.

```bash exec
kubectl logs mi-pod
kubectl logs mi-pod --previous
kubectl logs mi-pod -c mi-contenedor
kubectl logs -f mi-pod
```

```bash exec
kubectl exec -it mi-pod -- /bin/sh
kubectl exec mi-pod -- env
kubectl exec mi-pod -- nslookup kubernetes.default
```

### 8.2 Extraer campos específicos

Tres herramientas complementarias. Las tres son material de examen; jsonpath NO es opcional.

#### custom-columns

Muestra campos específicos de múltiples recursos en formato tabla, referenciando cada campo por nombre en lugar de por posición de columna. No se rompe si el formato de salida cambia entre versiones de kubectl.

```bash exec
kubectl get pods -n kube-system -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,IMAGE:.spec.containers[0].image
```

#### jsonpath

Extrae un valor concreto, típicamente a fichero. Aparece en preguntas del tipo "guarda X en /tmp/fichero.txt".

```bash exec
kubectl get pod mi-pod -o jsonpath='{.status.podIP}'
kubectl get pod mi-pod -o jsonpath='{.spec.nodeName}' > /tmp/node.txt
kubectl get deployment mi-app -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get nodes -o jsonpath='{.items[*].metadata.name}'
```

#### grep y awk

Filtran y cuentan, algo que las otras dos herramientas no hacen.

```bash exec
kubectl get nodes --no-headers | grep -c " Ready"
kubectl get pods --no-headers | grep -v Running
```

Regla de decisión: mostrar campos en tabla usa custom-columns, extraer un valor a fichero usa jsonpath, filtrar o contar usa grep o awk.

### 8.3 Descubrir campos sin memorizar

No memorices rutas, descúbrelas con el cluster.

El YAML del recurso ES el mapa de campos. La ruta es el camino de indentación separado por puntos:

```bash exec
kubectl get pod mi-pod -o yaml
```

Si en el YAML ves `spec: nodeName: cka-worker1`, la ruta es `.spec.nodeName`. Si ves `spec: containers: - image: nginx`, la ruta es `.spec.containers[0].image`, donde `[0]` indica el primer elemento de la lista.

`kubectl explain` documenta la estructura de cualquier recurso sin salir de la terminal:

```bash exec
kubectl explain pod.spec
kubectl explain pod.spec.containers
kubectl explain node.status.conditions
```

## 9. Documentación permitida en el examen

El examen CKA permite acceder únicamente a cuatro sitios: kubernetes.io/docs, incluido su buscador interno (prohibido abrir resultados de búsqueda externos), kubernetes.io/blog, helm.sh/docs, y gateway-api.sigs.k8s.io, esta última solo en CKA. Además, la Quick Reference box de cada pregunta puede incluir enlaces específicos para esa tarea; léela siempre.

Páginas críticas para practicar hasta llegar a ellas en menos de 30 segundos:

En kubernetes.io/docs: la referencia de API, taints y tolerations, NetworkPolicy, PersistentVolume y dynamic provisioning, RBAC, backup de etcd, y upgrade con kubeadm.

En helm.sh/docs: los comandos de helm, incluyendo install, upgrade, rollback y repo.

En gateway-api.sigs.k8s.io: los conceptos de Gateway, GatewayClass y HTTPRoute.

Uso eficiente: usa Ctrl+F dentro de la página para el campo exacto, copia solo el bloque que necesitas, y confía en tu vimrc, sin autoindent, para que la indentación se mantenga intacta al pegar.

## 10. Estrategia de tiempo

Datos del examen: 120 minutos, 15 a 20 tareas, aprobado con 66% o más; cada pregunta muestra su peso en porcentaje y designa el host donde debe resolverse.

Gestión de tiempo: el promedio es de 6 a 8 minutos por pregunta. Si llevas más de 10 minutos en una, márcala y sigue; vuelve al final. No te bloquees en una pregunta de 4% cuando hay tres de 8% sin resolver.

Orden de ataque recomendado: en los primeros 60 a 70 minutos resuelve todo lo que dominas con seguridad. En los siguientes 30 a 40 minutos vuelve a las preguntas marcadas. En los últimos 10 minutos verifica tus respuestas de mayor peso.

Verificación mínima por tipo de tarea: un Pod se confirma con `kubectl get pod`, esperando Running o Completed; un Deployment con `kubectl rollout status deployment/nombre`; un Service revisando tipo y puerto con `kubectl get svc`; RBAC con `kubectl auth can-i verbo recurso --as=usuario -n namespace`, esperando yes; un backup de etcd confirmando con `ls -lh` que el fichero existe y su tamaño es mayor a 0.

## 11. Laboratorio guiado

Tarea simulada: en el namespace `produccion`, crea un Deployment llamado `web-server` con imagen nginx:1.25 y 2 réplicas. Expónlo con un Service ClusterIP en el puerto 80. Guarda el nombre del nodo donde corre el primer pod en /tmp/node.txt.

Paso 1, contexto y namespace:

```bash exec
kubectl config current-context
kubectl create namespace produccion
kubectl config set-context --current --namespace=produccion
```

Paso 2, Deployment imperativo:

```bash exec
kubectl create deployment web-server --image=nginx:1.25 --replicas=2 $do > web-server.yaml
cat web-server.yaml
kubectl apply -f web-server.yaml
```

Paso 3, verificar:

```bash exec
kubectl rollout status deployment/web-server
kubectl get pods -l app=web-server -o wide
```

Paso 4, Service:

```bash exec
kubectl expose deployment web-server --port=80 --target-port=80 $do > web-server-svc.yaml
kubectl apply -f web-server-svc.yaml
kubectl get svc web-server
```

Paso 5, extraer el nodo con jsonpath:

```bash exec
kubectl get pods -l app=web-server -o jsonpath='{.items[0].spec.nodeName}' > /tmp/node.txt
cat /tmp/node.txt
```

```text output
cka-worker1
```

Paso 6, verificación final y limpieza de contexto:

```bash exec
kubectl get all -n produccion
kubectl config set-context --current --namespace=default
```

## 12. Troubleshooting - casos reales

### Caso 1: el autocompletado no funciona

**Síntoma:**

Al pulsar Tab después de escribir `k get po` no ocurre nada.

Diagnóstico paso a paso:

```bash exec
type _init_completion 2>/dev/null && echo OK || echo FALTA
type __start_kubectl 2>/dev/null && echo OK || echo FALTA
```

Si falta bash-completion:

```bash exec
apt-get install bash-completion -y
source /usr/share/bash-completion/bash_completion
source ~/.bashrc
```

Si falta kubectl completion:

```bash exec
echo 'source <(kubectl completion bash)' >> ~/.bashrc
echo 'complete -F __start_kubectl k' >> ~/.bashrc
source ~/.bashrc
```

**Solución:**

Ejecutar el bloque correspondiente según lo que reporte el diagnóstico, y confirmar de nuevo con Tab tras `k get po`.

### Caso 2: YAML rechazado por tabs

**Síntoma:**

`kubectl apply -f web-server.yaml` devuelve un error del tipo "error converting YAML to JSON: yaml: line X: found character that cannot start any token".

Diagnóstico paso a paso:

```bash exec
cat -A web-server.yaml | head -20
```

Los tabs aparecen como `^I` en la salida.

**Solución:**

Dentro de vim, sobre el mismo fichero abierto:

```bash exec
vim web-server.yaml
```

```text reference
:set expandtab tabstop=2 shiftwidth=2
:retab
```

`:retab` convierte todos los tabs existentes a espacios usando la configuración de tabstop activa. La solución permanente es verificar que `~/.vimrc` tiene las líneas de la sección 5.1.

### Caso 3: recursos en el namespace o contexto equivocado

**Síntoma:**

`kubectl get pods` no muestra el pod recién creado, o muestra pods que no reconoces.

Diagnóstico paso a paso:

```bash exec
kubectl config current-context
kubectl config view --minify | grep namespace
```

**Solución:**

```bash exec
kubectl config use-context k3s
kubectl config set-context --current --namespace=produccion
```

Sustituye `k3s` y `produccion` por el contexto y namespace correctos de la pregunta. El hábito clave es verificar contexto y namespace activos al inicio de cada bloque de trabajo en el examen, sin excepción.

## 13. Checkpoint

**Pregunta 1**

¿Qué diferencia hay entre `kubectl create` y `kubectl apply`?

Respuesta: `create` falla si el recurso ya existe. `apply` crea el recurso si no existe, o actualiza su configuración si ya existe. En el examen, `apply` es el comando por defecto más seguro.

**Pregunta 2**

Necesitas guardar la IP del pod `web` en /tmp/ip.txt. ¿Qué comando usas?

Respuesta: `kubectl get pod web -o jsonpath='{.status.podIP}' > /tmp/ip.txt`.

**Pregunta 3**

Necesitas una tabla con nombre y nodo de todos los pods de kube-system. ¿Qué herramienta y comando usas?

Respuesta: custom-columns. `kubectl get pods -n kube-system -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName`.

**Pregunta 4**

No recuerdas la ruta de un campo. ¿Qué dos formas tienes de descubrirla sin salir de la terminal?

Respuesta: leer la estructura completa con `kubectl get recurso -o yaml`, o consultar la documentación integrada con `kubectl explain recurso.ruta`.

**Pregunta 5**

¿Qué documentación puedes abrir durante el examen CKA?

Respuesta: kubernetes.io/docs con su buscador interno, kubernetes.io/blog, helm.sh/docs, y gateway-api.sigs.k8s.io, esta última solo en CKA, además de los enlaces que traiga la Quick Reference box de cada pregunta.

## 14. Laboratorio cronometrado

Objetivo: completar en menos de 10 minutos.

Tarea:

1. Crea el namespace `lab-m01`.
2. Deployment `nginx-lab`, imagen nginx:latest, 3 réplicas, en ese namespace.
3. Service `nginx-lab-svc` ClusterIP puerto 8080 hacia el puerto 80 del contenedor.
4. Escala a 5 réplicas.
5. Guarda la imagen del deployment en /tmp/imagen.txt usando jsonpath.
6. Guarda el número de pods Running en /tmp/count.txt.

Criterios de éxito:

```bash exec
kubectl get deployment nginx-lab -n lab-m01
kubectl get svc nginx-lab-svc -n lab-m01
cat /tmp/imagen.txt
cat /tmp/count.txt
```

La salida se muestra abreviada: `kubectl get deployment` añade la columna AGE y `kubectl get svc` añade AGE y EXTERNAL-IP; ambas se omiten aquí por brevedad.

```text output
NAME        READY   UP-TO-DATE   AVAILABLE
nginx-lab   5/5     5            5

NAME              TYPE        CLUSTER-IP   PORT(S)
nginx-lab-svc     ClusterIP   10.96.45.2   8080/TCP

nginx:latest

5
```

Solución de referencia, no mirar hasta terminar:

```bash exec
kubectl create namespace lab-m01

kubectl create deployment nginx-lab --image=nginx:latest --replicas=3 -n lab-m01

kubectl expose deployment nginx-lab --port=8080 --target-port=80 --name=nginx-lab-svc -n lab-m01

kubectl scale deployment nginx-lab --replicas=5 -n lab-m01

kubectl get deployment nginx-lab -n lab-m01 -o jsonpath='{.spec.template.spec.containers[0].image}' > /tmp/imagen.txt

kubectl get pods -n lab-m01 --no-headers | grep -c Running > /tmp/count.txt
```
