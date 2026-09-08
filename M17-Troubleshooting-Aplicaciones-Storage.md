# M17 - Troubleshooting: Aplicaciones y Storage

## 1. Resumen técnico

Tercer y último módulo de troubleshooting. Cubre fallos a nivel de aplicación dentro de un pod, imágenes que no se descargan, ConfigMaps o Secrets faltantes, init containers bloqueados, probes mal configuradas, y fallos de storage al nivel del pod, permisos de volumen incorrectos, volúmenes que no se pueden adjuntar a un nuevo nodo. Cierra el ciclo de troubleshooting del curso: M15 cubrió el control plane, M16 los nodos y la red, este cubre lo que ocurre dentro y alrededor de un pod individual.

## 2. Peso en el examen y preguntas típicas

Parte del 30% del examen dedicado a troubleshooting. Preguntas típicas:

- Un pod está en ImagePullBackOff, diagnostica y corrige la causa exacta.
- Un pod no arranca por un ConfigMap o Secret faltante, identifícalo y corrígelo.
- Un pod se queda bloqueado en Init, diagnostica qué init container está fallando.
- Un pod se reinicia constantemente pese a que la aplicación funciona bien, diagnostica la probe responsable.
- Un pod no puede escribir en su volumen montado, diagnostica el problema de permisos.
- Un pod queda Pending tras moverse de nodo, con un error de Multi-Attach en su volumen.

## 3. Prerrequisitos

De M05 (RBAC) usarás los Secrets como mecanismo de autenticación, aquí aplicado a credenciales de registros de imágenes privados.

De M07 (Workloads) usarás la diferencia entre readiness y liveness probes, mencionada ahí solo de pasada, profundizada aquí como causa de troubleshooting real.

De M08 (Jobs y recursos) usarás OOMKilled, ya cubierto en profundidad ahí; este módulo no lo repite, se enfoca en causas de fallo distintas.

De M14 (Storage) usarás el ciclo de binding de PV y PVC, aquí extendido a fallos que ocurren DESPUÉS del binding, al intentar montar el volumen dentro del pod.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Diagnosticar ImagePullBackOff distinguiendo un error de nombre de imagen de un error de credenciales.
2. Diagnosticar CreateContainerConfigError por un ConfigMap o Secret referenciado que no existe.
3. Diagnosticar un pod bloqueado en estado Init, identificando cuál init container falla.
4. Explicar la diferencia práctica entre una liveness probe fallida y una readiness probe fallida.
5. Corregir un error de permisos de volumen usando securityContext y fsGroup.
6. Diagnosticar un error de Multi-Attach en un volumen ReadWriteOnce.

## 5. Metodología: el orden de lectura de un pod roto

Un pod atraviesa fases secuenciales antes de estar Running, y el orden de diagnóstico debe seguir ese mismo orden: primero confirmar si el pod fue programado en absoluto, `Status` y la sección `Conditions`; luego revisar `Events`, que narra cronológicamente cada fase, scheduling, pull de imagen, creación de init containers, creación de containers principales; y solo si el contenedor llegó a arrancar, revisar `logs` y, si hace falta, `exec` para inspeccionar el estado interno de la aplicación. Saltar directamente a `logs` en un pod que nunca llegó a arrancar el contenedor principal es un error común que pierde tiempo, porque no hay ningún log que revisar todavía.

## 6. Diagrama ASCII - fases del ciclo de vida de un pod y sus fallos típicos

```text reference
Pod creado
    |
    v
Scheduling  ------ falla -----> Pending, Events: FailedScheduling
    |                            (taints/afinidad/recursos, M09)
    v
Pull de imagen(es) --- falla -> ImagePullBackOff / ErrImagePull
    |                            (nombre incorrecto o sin credenciales)
    v
Crear ConfigMaps/Secrets --- falla -> CreateContainerConfigError
montados como env o volumen         (el recurso referenciado
    |                                 no existe)
    v
Init containers, EN ORDEN --- falla -> Init:CrashLoopBackOff
(cada uno debe terminar                Init:Error
 exitosamente antes del                (main containers NUNCA
 siguiente)                             arrancan)
    |
    v
Container(s) principal(es) arranca
    |
    v
Liveness probe falla? --- SI --> kubelet REINICIA el contenedor
    |                             (RESTARTS aumenta)
    NO
    |
    v
Readiness probe falla? --- SI --> el pod sigue Running,
    |                              pero se retira de los
    |                              Endpoints del Service (M10)
    NO
    |
    v
Pod completamente sano
```

## 7. Casos guiados de troubleshooting

### Caso 1: ImagePullBackOff

**Síntoma:**

`kubectl get pods` muestra un pod en estado ImagePullBackOff o ErrImagePull.

Diagnóstico paso a paso:

```bash exec
kubectl describe pod app-imagen-rota
```

```text output
Events:
  Warning  Failed  Failed to pull image "nginx:1.9999": rpc error: code = NotFound desc = failed to pull and unpack image: image not found
```

Si el mensaje indica que la imagen no existe, es un error de nombre o de tag.

```bash exec
kubectl get pod app-imagen-rota -o jsonpath='{.spec.containers[0].image}'
```

Si en cambio el mensaje indica `unauthorized` o `pull access denied`, el problema es de credenciales, no de nombre, típicamente un registro privado sin `imagePullSecrets` configurado.

**Solución:**

Para un nombre incorrecto, corregir la imagen y reaplicar. Para credenciales faltantes:

```bash exec
kubectl create secret docker-registry mi-registro --docker-server=registro.privado.com --docker-username=usuario --docker-password=clave
```

Y referenciarlo en el pod, vía `spec.imagePullSecrets`, o de forma más escalable asociándolo al ServiceAccount del namespace, siguiendo el mecanismo de identidades visto en M05.

### Caso 2: CreateContainerConfigError por ConfigMap o Secret faltante

**Síntoma:**

Un pod queda en estado `CreateContainerConfigError`, DISTINTO de CrashLoopBackOff: el contenedor nunca llega a arrancar en absoluto, así que no hay reinicios que contar.

Diagnóstico paso a paso:

```bash exec
kubectl describe pod app-config-rota
```

```text output
Events:
  Warning  Failed  Error: configmap "config-inexistente" not found
```

El mensaje identifica exactamente el recurso faltante y su tipo.

```bash exec
kubectl get configmap config-inexistente
```

Confirmar que efectivamente no existe, o existe con un nombre ligeramente distinto al referenciado en el pod.

**Solución:**

Crear el ConfigMap o Secret faltante con el nombre exacto esperado, o corregir la referencia en el pod si el nombre real es otro. A diferencia de CrashLoopBackOff, este estado nunca se resuelve solo con reintentos; el recurso referenciado debe existir antes de que el contenedor pueda arrancar en absoluto.

### Caso 3: pod bloqueado en estado Init

**Síntoma:**

`kubectl get pods` muestra un pod con estado `Init:0/2` o similar, sin avanzar nunca hacia Running.

Diagnóstico paso a paso:

Conexión con M07 y M08: los init containers se ejecutan en ORDEN estricto, cada uno debe terminar con éxito, exit 0, antes de que el siguiente arranque, y los containers principales del pod nunca arrancan hasta que TODOS los init containers hayan terminado.

```bash exec
kubectl describe pod app-init-bloqueada
```

```text output
Init Containers:
  esperar-db:
    State:  Running
Events:
  Normal  Pulled  Successfully pulled image "busybox"
```

El nombre del init container en curso indica exactamente cuál está bloqueado.

```bash exec
kubectl logs app-init-bloqueada -c esperar-db
```

El flag `-c` especifica el contenedor exacto, obligatorio cuando el pod tiene más de un container, principal o de init, con el mismo patrón visto para containers múltiples desde M01.

**Solución:**

Corregir la condición que el init container está esperando, según revele su log, típicamente una dependencia externa que nunca llega a estar lista, o un error real dentro del script del propio init container.

### Caso 4: liveness probe reiniciando una aplicación sana

**Síntoma:**

Un pod muestra un contador de RESTARTS creciente, aunque la aplicación responde correctamente cuando se prueba manualmente.

Diagnóstico paso a paso:

Diferencia clave frente al escenario de rollout de M07: ahí una readiness probe fallida dejaba el pod Running sin reiniciarlo, solo lo retiraba de los Endpoints. Aquí, una LIVENESS probe fallida SÍ reinicia el contenedor activamente.

```bash exec
kubectl describe pod app-liveness-agresiva
```

```text output
Liveness:  http-get http://:8080/salud delay=0s timeout=1s period=5s #success=1 #failure=1
Events:
  Warning  Unhealthy  Liveness probe failed: Get "http://10.244.1.9:8080/salud": context deadline exceeded
  Normal   Killing    Container app failed liveness probe, will be restarted
```

Causa muy común: la aplicación tarda más en arrancar que `initialDelaySeconds`, o el `timeout` de la probe es demasiado corto para una respuesta que a veces es lenta bajo carga real.

**Solución:**

Ajustar `initialDelaySeconds` para dar más margen al arranque real de la aplicación, o aumentar `timeoutSeconds` y `failureThreshold` para tolerar respuestas ocasionalmente lentas sin considerarlas un fallo definitivo. Nunca eliminar la liveness probe por completo como solución; eso oculta fallos reales futuros en lugar de corregir el ajuste incorrecto.

### Caso 5: volumen montado con permisos incorrectos

**Síntoma:**

Un contenedor no-root recibe "permission denied" al intentar escribir en un volumen montado, aunque el PVC está correctamente Bound.

Diagnóstico paso a paso:

```bash exec
kubectl logs app-storage-permisos
```

```text output
Error: EACCES: permission denied, open '/datos/archivo.txt'
```

```bash exec
kubectl get pod app-storage-permisos -o jsonpath='{.spec.securityContext}'
```

Si el resultado está vacío, el pod no define ningún `securityContext`, y el volumen se monta con la propiedad por defecto, típicamente root, incompatible con un proceso que corre como usuario no-root dentro del contenedor.

**Solución:**

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: app-storage-permisos
spec:
  securityContext:
    fsGroup: 2000
  containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "id; echo dato > /datos/archivo.txt; sleep 3600"]
    volumeMounts:
    - name: datos
      mountPath: /datos
    securityContext:
      runAsUser: 1000
  volumes:
  - name: datos
    persistentVolumeClaim:
      claimName: pvc-storage-permisos
EOF
```

`fsGroup`, definido a nivel de pod, cambia la propiedad de grupo del volumen montado para que coincida, permitiendo que el proceso, corriendo como el usuario 1000 definido en `runAsUser`, tenga permiso de escritura real sin necesitar privilegios de root.

### Caso 6: error de Multi-Attach en un volumen ReadWriteOnce

**Síntoma:**

Un pod queda Pending tras haberse reprogramado en un nodo distinto, típicamente después de que su nodo anterior falló, con un mensaje de error sobre el volumen.

Diagnóstico paso a paso:

```bash exec
kubectl describe pod app-multi-attach
```

```text output
Events:
  Warning  FailedAttachVolume  Multi-Attach error for volume "pvc-abc123" Volume is already exclusively attached to one node and can't be attached to another
```

Conexión con M14: este es exactamente el límite de `ReadWriteOnce` en acción, restringido a un único NODO. Si el pod anterior, en el nodo viejo, no se desmontó limpiamente, por ejemplo porque ese nodo quedó NotReady abruptamente, visto en M16, el volumen sigue marcado como adjunto ahí, bloqueando el nuevo intento de adjuntarlo al nodo nuevo.

El siguiente comando se ejecuta sustituyendo el nombre base real del pod afectado:

```text reference
kubectl get pods -o wide | grep <nombre-base-del-pod>
```

Confirmar si efectivamente existe un pod fantasma o Terminating en el nodo viejo, aún reteniendo el volumen.

**Solución:**

Si el nodo viejo está genuinamente caído y no volverá, forzar la eliminación del pod atascado ahí libera el volumen para el reintento de attach en el nodo nuevo. El siguiente comando se ejecuta sustituyendo el nombre real de ese pod:

```text reference
kubectl delete pod <pod-en-nodo-viejo> --grace-period=0 --force
```

Usar `--force` con extrema cautela, solo cuando el nodo de origen esté confirmado como inalcanzable; en un nodo sano, esta acción puede provocar corrupción si el proceso viejo sigue realmente escribiendo en el volumen en el momento de forzar el borrado.

## 8. Checkpoint

**Pregunta 1**

¿Qué diferencia hay entre ImagePullBackOff y CreateContainerConfigError?

Respuesta: ImagePullBackOff ocurre cuando la imagen del contenedor no se puede descargar, por nombre incorrecto o falta de credenciales. CreateContainerConfigError ocurre cuando un ConfigMap o Secret que el pod referencia, como variable de entorno o volumen, no existe; en ambos casos el contenedor nunca llega a arrancar, pero la causa raíz y la solución son completamente distintas.

**Pregunta 2**

¿Qué le sucede a un pod cuando falla su readiness probe, y qué le sucede cuando falla su liveness probe?

Respuesta: una readiness probe fallida deja el pod Running sin reiniciarlo, solo lo retira de los Endpoints del Service asociado. Una liveness probe fallida hace que kubelet reinicie el contenedor activamente, incrementando el contador de RESTARTS.

**Pregunta 3**

Un pod muestra `Init:0/2` indefinidamente. ¿Los containers principales del pod están corriendo?

Respuesta: no. Ningún container principal arranca hasta que TODOS los init containers hayan terminado exitosamente, en orden estricto; con `Init:0/2`, ni siquiera el primero de los dos ha terminado.

**Pregunta 4**

¿Qué campo de securityContext corrige un error de permisos de escritura en un volumen montado por un proceso no-root?

Respuesta: `fsGroup`, definido a nivel de pod, cambia la propiedad de grupo del volumen montado para que coincida con el grupo del proceso, permitiendo escritura sin necesitar privilegios de root.

**Pregunta 5**

¿Qué límite de acceso de un volumen explica un error de Multi-Attach al reprogramar un pod en un nodo distinto?

Respuesta: el límite de ReadWriteOnce, restringido a un único nodo a la vez. Si el volumen sigue marcado como adjunto al nodo anterior, típicamente porque ese pod no se desmontó limpiamente, el intento de adjuntarlo al nuevo nodo falla hasta que se libere.

## 9. Laboratorio cronometrado

Objetivo: completar en menos de 20 minutos.

Tarea:

1. Crea un pod con una imagen inexistente y guarda en /tmp/razon-imagen.txt la razón exacta reportada en sus Events.
2. Crea un pod que referencia un ConfigMap inexistente como variable de entorno, vía `envFrom`, y guarda en /tmp/razon-config.txt la razón exacta reportada.
3. Crea el ConfigMap faltante del paso 2 con el contenido correcto, y verifica que el pod arranca correctamente tras recrearlo.
4. Crea un pod con un init container que falla deliberadamente, `exit 1`, y guarda en /tmp/estado-init.txt el estado READY/STATUS del pod tras esperar unos segundos.

Criterios de éxito:

```bash exec
cat /tmp/razon-imagen.txt
cat /tmp/razon-config.txt
cat /tmp/estado-init.txt
```

Solución de referencia, no mirar hasta terminar:

```bash exec
kubectl run pod-imagen-mala --image=nginx:noexiste123

sleep 5
kubectl get events --field-selector involvedObject.name=pod-imagen-mala -o jsonpath='{.items[-1:].message}' > /tmp/razon-imagen.txt

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-config-malo
spec:
  containers:
  - name: app
    image: nginx:1.25
    envFrom:
    - configMapRef:
        name: config-que-falta
EOF

sleep 5
kubectl get events --field-selector involvedObject.name=pod-config-malo -o jsonpath='{.items[-1:].message}' > /tmp/razon-config.txt

kubectl create configmap config-que-falta --from-literal=clave=valor

kubectl delete pod pod-config-malo

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-config-malo
spec:
  containers:
  - name: app
    image: nginx:1.25
    envFrom:
    - configMapRef:
        name: config-que-falta
EOF

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-init-malo
spec:
  initContainers:
  - name: init-falla
    image: busybox
    command: ["sh", "-c", "exit 1"]
  containers:
  - name: app
    image: nginx:1.25
EOF

sleep 15
kubectl get pod pod-init-malo --no-headers > /tmp/estado-init.txt
```

## 10. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Este módulo funciona igual en cualquier topología para los casos 1 a 5; el caso 6, Multi-Attach, se demuestra con más realismo en un cluster multi-nodo, donde el volumen realmente puede quedar adjunto a un nodo distinto del que recibe el pod reprogramado.

**Alternativa K3s (plan B):** todos los mecanismos de este módulo, probes, init containers, securityContext, Secrets de registro privado, son API estándar de Kubernetes y funcionan idéntico en K3s. El caso 6, Multi-Attach, pierde valor didáctico en K3s single-node, ya que solo existe un nodo posible para cualquier attach, sin ningún otro nodo candidato con el que generar el conflicto.

Limpieza del módulo:

```bash exec
kubectl delete pod app-imagen-rota app-config-rota app-init-bloqueada app-liveness-agresiva app-storage-permisos app-multi-attach pod-imagen-mala pod-config-malo pod-init-malo
kubectl delete configmap config-inexistente config-que-falta
kubectl delete secret mi-registro
```

---

**Siguiente módulo:** M18 - Simulacro CKA Cronometrado