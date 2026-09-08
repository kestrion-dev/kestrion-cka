# M08 - Jobs, CronJobs y Gestión de Recursos

## 1. Resumen técnico

Este módulo cubre Job, ejecución finita hasta completarse con éxito, y CronJob, Jobs programados por horario, y la gestión de recursos computacionales, requests, limits, QoS classes, que determina cómo el scheduler y el kubelet tratan cada pod bajo presión de recursos. A diferencia de Deployment, estos controllers están orientados a tareas con un final definido, no a servicios de larga duración.

## 2. Peso en el examen y preguntas típicas

15% del examen, dominio Workloads & Scheduling. Preguntas típicas:

- Crea un Job que ejecute una tarea con 3 completions y 2 en paralelo.
- Crea un CronJob que corra cada 5 minutos y limita el historial a 3 jobs exitosos.
- Un Job no termina nunca, diagnostica por qué.
- Configura requests y limits para que un pod quede en la clase QoS Guaranteed.
- Un pod fue eliminado por OOMKilled, diagnostica y corrige el límite de memoria.

## 3. Prerrequisitos

De M02 (Arquitectura) usarás el reconciliation loop, aplicado ahora a un controller cuyo estado deseado es "N ejecuciones completadas con éxito", no "N réplicas corriendo indefinidamente".

De M07 (Workloads) usarás la diferencia entre gestionar pods de larga duración, Deployment, y la lógica de template más selector que también usa Job.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Explicar la diferencia entre completions y parallelism en un Job y calcular cuántos pods corren simultáneamente según ambos valores.
2. Configurar backoffLimit y activeDeadlineSeconds según un requisito de tolerancia a fallos.
3. Crear un CronJob con el schedule correcto en sintaxis cron y controlar su historial.
4. Explicar la diferencia entre requests y limits y cómo cada uno afecta scheduling y runtime.
5. Determinar la QoS class resultante de una configuración de resources dada.
6. Diagnosticar un pod en OOMKilled o en CrashLoopBackOff por falta de recursos.

## 5. Explicación teórica progresiva

### 5.1 Job, ejecución hasta completar, no hasta siempre

Conexión con M07: un ReplicaSet garantiza "N pods corriendo SIEMPRE"; si un pod termina, exit 0, el ReplicaSet lo considera una pérdida y crea otro para mantener el conteo. Un Job invierte esa lógica: su estado deseado es "N pods han terminado con ÉXITO", y una vez alcanzado ese número, el Job se marca Complete y no crea más pods.

#### El campo completions

Define cuántas ejecuciones EXITOSAS, exit code 0, se necesitan en total para considerar el Job terminado. Por defecto vale 1.

#### El campo parallelism

Define cuántos pods pueden correr SIMULTÁNEAMENTE mientras se alcanza completions. Por defecto vale 1.

Ejemplo: completions=6, parallelism=2 significa que el Job lanzará pods de 2 en 2, y continuará lanzando nuevos pares hasta acumular 6 éxitos en total, 3 rondas de 2 en el caso ideal sin fallos.

#### El campo backoffLimit

Define cuántos REINTENTOS se permiten ante fallos, exit code distinto de 0, antes de marcar el Job entero como Failed. El valor por defecto es 6, confirmado contra la documentación oficial de Kubernetes. Cada reintento usa backoff exponencial, 10s, 20s, 40s, hasta un máximo de 6 minutos.

#### El campo activeDeadlineSeconds

Define el tiempo máximo total, en segundos, que el Job puede estar activo, sin importar reintentos. Al alcanzarlo, el Job se marca Failed y TODOS sus pods se terminan, sin importar backoffLimit. Es un límite de TIEMPO, backoffLimit es un límite de INTENTOS; son independientes.

El Job controller, parte de kube-controller-manager, el mismo componente visto en M02, observa los pods que crea vía su selector, cuenta cuántos terminaron con exit 0, y compara contra completions. Un pod que termina con exit distinto de 0 no cuenta para completions, pero SÍ consume un intento de backoffLimit.

### 5.2 CronJob, Jobs programados

Un CronJob es un controller que crea Jobs según un horario, usando la sintaxis estándar de cron de Unix. El CronJob NO ejecuta nada directamente: en cada tick de su schedule, crea un objeto Job nuevo, que a su vez crea pods, exactamente como en 5.1. Por eso `kubectl get jobs` mostrará un Job distinto por cada ejecución programada, con un sufijo de timestamp.

La sintaxis cron usa 5 campos:

```text reference
*  *  *  *  *
|  |  |  |  |
|  |  |  |  +---- dia de la semana (0-6, 0=domingo)
|  |  |  +------- mes (1-12)
|  |  +---------- dia del mes (1-31)
|  +------------- hora (0-23)
+---------------- minuto (0-59)

Ejemplos:
*/5 * * * *    cada 5 minutos
0 2 * * *      todos los dias a las 2:00 AM
0 0 * * 0      cada domingo a medianoche
0 */6 * * *    cada 6 horas
```

#### El campo concurrencyPolicy

Controla qué hacer si un Job anterior sigue corriendo cuando toca lanzar el siguiente.

**Allow** es el valor por defecto y permite que corran en paralelo, sin restricción.

**Forbid** omite la nueva ejecución si la anterior sigue activa.

**Replace** cancela la ejecución anterior y lanza la nueva.

#### El campo startingDeadlineSeconds

Si el CronJob controller estuvo caído o no pudo lanzar el Job en el momento exacto, por ejemplo tras un reinicio del control plane, este campo define el margen de tiempo en el que aún se considera válido lanzarlo tarde. Pasado ese margen, se cuenta como ejecución perdida, missed.

#### Los campos successfulJobsHistoryLimit y failedJobsHistoryLimit

Definen cuántos Jobs terminados, exitosos y fallidos respectivamente, se conservan en el historial antes de que el CronJob controller los elimine automáticamente. Los valores por defecto son 3 y 1. Sin este límite, un CronJob de alta frecuencia acumularía miles de objetos Job en etcd indefinidamente.

### 5.3 Requests y limits, dos mecanismos distintos

Conexión con M02 y M07: en Arquitectura viste que el scheduler decide en qué nodo va cada pod. Requests es el dato que el scheduler usa para esa decisión. Limits, en cambio, es aplicado por el kubelet y el runtime DESPUÉS de que el pod ya está corriendo. Son dos mecanismos que actúan en momentos distintos del ciclo de vida.

#### Qué son los requests

Representan cuánto necesita el contenedor COMO MÍNIMO para funcionar. El scheduler SOLO coloca un pod en un nodo si ese nodo tiene recursos asignables, allocatable, suficientes para cubrir la suma de requests de todos los pods que ya corren ahí más el nuevo. Si ningún nodo cumple, el pod queda Pending indefinidamente.

`kubectl describe node` muestra dos secciones relevantes: Allocatable, lo disponible real, y Allocated resources, la suma de requests de los pods ya programados ahí.

#### Qué son los limits

Representan cuánto puede usar el contenedor COMO MÁXIMO. Se aplica en tiempo de ejecución vía cgroups, Control Groups del kernel Linux. El comportamiento difiere según el recurso.

Con un límite de CPU, el kernel usa CFS, Completely Fair Scheduler, quota/period para hacer throttling: el proceso no se mata, simplemente se le pausa su ejecución cuando excede su cuota en cada periodo, típicamente 100ms, haciéndolo más lento, no matándolo.

Con un límite de memoria no existe throttling posible, no se puede pausar el uso de RAM de forma útil. Si el contenedor excede su límite de memoria, el kernel invoca el OOM Killer, Out Of Memory Killer, que termina el proceso abruptamente. `kubectl describe pod` mostrará entonces State: Terminated, Reason: OOMKilled, Exit Code: 137, 128 más 9, la señal SIGKILL.

Las unidades de CPU: 1 equivale a 1 core completo, 500m, milicpu, equivale a medio core, 100m equivale al 10% de un core. Las unidades de memoria: Mi, mebibytes, 2^20 bytes, o M, megabytes, 10^6 bytes. El examen y la práctica real casi siempre usan Mi/Gi, no M/G.

### 5.4 QoS classes, cómo Kubernetes prioriza pods

Kubernetes asigna automáticamente una de tres clases de Quality of Service a cada pod, según cómo están configurados sus requests y limits. Esta clase determina el ORDEN en que el kubelet elige qué pods eliminar, evict, cuando el NODO ENTERO, no un contenedor individual, se queda sin memoria disponible.

#### Guaranteed

TODOS los contenedores del pod tienen requests Y limits definidos, Y son EXACTAMENTE IGUALES para CPU y memoria. Es la clase más protegida: la ÚLTIMA en ser evictada bajo presión de recursos del nodo.

#### Burstable

Al menos un contenedor tiene requests definido, pero no cumple la condición de Guaranteed, limits ausente, o limits distinto de requests. Es la clase intermedia.

#### BestEffort

Ningún contenedor tiene requests NI limits definidos. Es la clase MENOS protegida: la PRIMERA en ser evictada bajo presión de memoria del nodo.

El orden de evicción bajo presión de memoria del nodo es: BestEffort primero, luego Burstable, y Guaranteed solo como último recurso, y únicamente si está excediendo su propio request.

Para verificar la QoS class de un pod:

```bash exec
kubectl get pod nginx-demo -o jsonpath='{.status.qosClass}'
```

## 6. Diagrama ASCII - Job con completions y parallelism

```text reference
Job: procesar-datos
completions: 6    parallelism: 2    backoffLimit: 3

TIEMPO -->

Ronda 1 (0s):
  Pod-1 [ejecutando]  Pod-2 [ejecutando]
  (2 corriendo, 0 completados)

Ronda 1 termina (Pod-1 exit 0, Pod-2 exit 1 FALLA):
  Pod-1 [Completed]   Pod-2 [Failed]
  completions acumuladas: 1
  intentos de backoff usados: 1 de 3

Ronda 2 (relanza para reemplazar a Pod-2,
y lanza uno nuevo para mantener parallelism=2):
  Pod-3 [ejecutando]  Pod-4 [ejecutando]
  (reintento de la tarea fallida + siguiente)

Ronda 2 termina (ambos exit 0):
  Pod-3 [Completed]   Pod-4 [Completed]
  completions acumuladas: 3

Ronda 3, Ronda 4... continua lanzando pares
hasta acumular 6 completions TOTALES exitosas.

Si en algun punto los FALLOS acumulados superan
backoffLimit (3 en este ejemplo), el Job completo
se marca Failed y deja de intentar, sin importar
cuantas completions ya se acumularon.
```

## 7. Ejemplos prácticos desplegables

### 7.1 Job simple, una sola ejecución

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: migracion-simple
spec:
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: migracion
        image: busybox
        command: ["sh", "-c", "echo Iniciando migracion; sleep 5; echo Migracion completada"]
EOF
```

Nota crítica: restartPolicy en un Job SOLO puede ser Never u OnFailure. El valor Default, usado por Deployment, no es válido aquí y será rechazado por el apiserver.

Verificar:

```bash exec
kubectl get jobs
kubectl logs -l job-name=migracion-simple
kubectl get pods -l job-name=migracion-simple
```

```text output
NAME                COMPLETIONS   DURATION
migracion-simple    1/1           6s

Iniciando migracion
Migracion completada

NAME                     STATUS
migracion-simple-4kxlq   Completed
```

### 7.2 Job con completions y parallelism

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: procesar-datos
spec:
  completions: 6
  parallelism: 2
  backoffLimit: 3
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: procesador
        image: busybox
        command: ["sh", "-c", "echo Procesando lote; sleep 3; echo Lote finalizado"]
EOF
```

Observar el comportamiento en vivo:

```bash exec
watch kubectl get pods -l job-name=procesar-datos
```

Nunca más de 2 pods activos simultáneamente, parallelism=2, hasta acumular 6 Completed. Ctrl+C para salir.

```bash exec
kubectl get job procesar-datos
```

```text output
NAME             COMPLETIONS   DURATION
procesar-datos   6/6           11s
```

### 7.3 Job con fallos y backoffLimit

Simular un Job que falla deliberadamente para observar el backoff:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: job-con-fallos
spec:
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: falla-siempre
        image: busybox
        command: ["sh", "-c", "echo Intentando; exit 1"]
EOF
```

Observar los reintentos con backoff exponencial:

```bash exec
watch kubectl get pods -l job-name=job-con-fallos
```

Aparecerán nuevos pods Failed cada vez más espaciados en el tiempo, 10s, 20s, 40s. Ctrl+C para salir cuando el Job esté Failed. Con backoffLimit=2 se producen 3 pods Failed en total: 1 intento inicial más 2 reintentos.

```bash exec
kubectl get job job-con-fallos
kubectl describe job job-con-fallos
```

```text output
NAME              COMPLETIONS   DURATION
job-con-fallos    0/1           58s

Events:
  Warning  BackoffLimitExceeded  Job has reached the specified backoff limit
```

### 7.4 Job con activeDeadlineSeconds

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: job-con-timeout
spec:
  activeDeadlineSeconds: 10
  backoffLimit: 5
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: tarea-larga
        image: busybox
        command: ["sh", "-c", "sleep 300"]
EOF
```

```bash exec
kubectl get job job-con-timeout -w
```

Tras 10 segundos, el Job se marca Failed y su pod se termina, aunque backoffLimit=5 nunca se haya alcanzado. Ctrl+C para salir del watch.

```bash exec
kubectl describe job job-con-timeout
```

```text output
Events:
  Warning  DeadlineExceeded  Job was active longer than specified deadline
```

### 7.5 CronJob completo con control de historial

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-programado
spec:
  schedule: "*/2 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  startingDeadlineSeconds: 30
  jobTemplate:
    spec:
      backoffLimit: 1
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: backup
            image: busybox
            command: ["sh", "-c", "echo Backup ejecutado en $(date)"]
EOF
```

Esperar al menos 5-6 minutos y verificar:

```bash exec
kubectl get cronjob backup-programado
kubectl get jobs
```

```text output
NAME                 SCHEDULE      LAST SCHEDULE
backup-programado    */2 * * * *   62s ago

NAME                             COMPLETIONS
backup-programado-29431680       1/1
backup-programado-29431682       1/1
backup-programado-29431684       1/1
```

Nunca más de 3 Jobs en el historial exitoso, por successfulJobsHistoryLimit=3.

### 7.6 Requests y limits, las tres QoS classes

Pod Guaranteed, con requests y limits definidos y exactamente iguales:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-guaranteed
spec:
  containers:
  - name: app
    image: nginx:1.25
    resources:
      requests:
        cpu: 200m
        memory: 128Mi
      limits:
        cpu: 200m
        memory: 128Mi
EOF
```

Pod Burstable, con requests definido y limits distinto:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-burstable
spec:
  containers:
  - name: app
    image: nginx:1.25
    resources:
      requests:
        cpu: 100m
        memory: 64Mi
      limits:
        cpu: 500m
        memory: 256Mi
EOF
```

Pod BestEffort, sin ninguna sección resources:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-besteffort
spec:
  containers:
  - name: app
    image: nginx:1.25
EOF
```

Verificar las tres clases:

```bash exec
kubectl get pod pod-guaranteed -o jsonpath='{.status.qosClass}'
kubectl get pod pod-burstable -o jsonpath='{.status.qosClass}'
kubectl get pod pod-besteffort -o jsonpath='{.status.qosClass}'
```

```text output
Guaranteed
Burstable
BestEffort
```

### 7.7 Demostración de OOMKilled

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-oom-demo
spec:
  containers:
  - name: consumidor-memoria
    image: polinux/stress
    resources:
      requests:
        memory: 50Mi
      limits:
        memory: 100Mi
    command: ["stress"]
    args: ["--vm", "1", "--vm-bytes", "200M", "--vm-hang", "1"]
EOF
```

Observar el resultado:

```bash exec
kubectl get pod pod-oom-demo -w
```

STATUS pasa a OOMKilled o CrashLoopBackOff. Ctrl+C para salir.

```bash exec
kubectl describe pod pod-oom-demo
```

```text output
Last State:   Terminated
  Reason:     OOMKilled
  Exit Code:  137
```

Corregir aumentando el límite:

```bash exec
kubectl delete pod pod-oom-demo

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pod-oom-demo
spec:
  containers:
  - name: consumidor-memoria
    image: polinux/stress
    resources:
      requests:
        memory: 50Mi
      limits:
        memory: 300Mi
    command: ["stress"]
    args: ["--vm", "1", "--vm-bytes", "200M", "--vm-hang", "1"]
EOF
```

```bash exec
kubectl get pod pod-oom-demo
```

```text output
NAME            READY   STATUS    RESTARTS
pod-oom-demo    1/1     Running   0
```

## 8. Laboratorio guiado

Objetivo: diagnosticar un CronJob que deja de ejecutarse por acumulación silenciosa de Jobs fallidos, escenario realista de troubleshooting en producción.

Paso 1, crear un CronJob con concurrencyPolicy que oculta el problema:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: tarea-problematica
spec:
  schedule: "* * * * *"
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      backoffLimit: 1
      activeDeadlineSeconds: 50
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: tarea
            image: busybox
            command: ["sh", "-c", "sleep 90"]
EOF
```

Paso 2, esperar 3-4 minutos y observar el síntoma:

```bash exec
kubectl get cronjob tarea-problematica
kubectl get jobs
```

```text output
NAME                    SCHEDULE      LAST SCHEDULE
tarea-problematica      * * * * *     12s ago

NAME                              COMPLETIONS
tarea-problematica-29431690       0/1
tarea-problematica-29431691       0/1
tarea-problematica-29431692       0/1
```

LAST SCHEDULE avanza pero ningún Job llega a COMPLETIONS 1/1.

Paso 3, diagnóstico:

```bash exec
kubectl describe job tarea-problematica-29431690
```

```text output
Events:
  Warning  DeadlineExceeded  Job was active longer than specified deadline
```

Paso 4, causa raíz identificada: activeDeadlineSeconds, 50s, es MENOR que el tiempo real que tarda la tarea, 90s. Cada ejecución es cancelada por deadline antes de poder completarse, y concurrencyPolicy: Forbid hace que esto sea difícil de notar a simple vista porque siempre parece haber una ejecución en curso.

Paso 5, corregir:

```bash exec
kubectl patch cronjob tarea-problematica --type=json -p='[{"op":"replace","path":"/spec/jobTemplate/spec/activeDeadlineSeconds","value":120}]'
```

Paso 6, verificar la recuperación en el siguiente ciclo del minuto:

```bash exec
kubectl get jobs -w
```

El siguiente Job debe llegar a Completed.

## 9. Checkpoint

**Pregunta 1**

Un Job tiene completions=10, parallelism=3. ¿Cuántos pods como máximo estarán corriendo simultáneamente en algún momento dado?

Respuesta: 3. El campo parallelism limita la concurrencia; completions solo define el TOTAL acumulado necesario, no afecta cuántos corren a la vez.

**Pregunta 2**

¿Cuál es la diferencia entre backoffLimit y activeDeadlineSeconds?

Respuesta: backoffLimit limita el NÚMERO de reintentos ante fallos, exit code distinto de 0. activeDeadlineSeconds limita el TIEMPO TOTAL que el Job puede estar activo, sin importar cuántos reintentos lleve. Son independientes: puede fallar por cualquiera de los dos motivos primero.

**Pregunta 3**

¿Qué le sucede a un contenedor que excede su limit de CPU? ¿Y si excede su limit de memoria?

Respuesta: con CPU se le aplica throttling vía CFS quota/period, el proceso se ralentiza pero NO se mata. Con memoria, el OOM Killer del kernel termina el proceso con exit code 137, no existe throttling posible para memoria.

**Pregunta 4**

¿Qué condición exacta determina que un pod sea clasificado como QoS Guaranteed?

Respuesta: todos los contenedores del pod deben tener requests Y limits definidos para CPU y memoria, y los valores de requests deben ser EXACTAMENTE IGUALES a los de limits.

**Pregunta 5**

Un CronJob con concurrencyPolicy: Forbid parece estar siempre ejecutando algo pero nunca produce resultados exitosos. ¿Qué dos campos revisarías primero?

Respuesta: activeDeadlineSeconds del jobTemplate, si es menor que el tiempo real de ejecución de la tarea, cada intento será cancelado por timeout, y backoffLimit, para ver cuántos intentos se están agotando antes de marcar el Job como Failed.

## 10. Laboratorio cronometrado

Objetivo: completar en menos de 12 minutos.

Tarea:

1. Crea un Job procesamiento-lotes con completions=8, parallelism=4, backoffLimit=2, imagen busybox, comando que haga echo y sleep 2.
2. Crea un CronJob limpieza-logs que corra cada 3 minutos, concurrencyPolicy=Replace, successfulJobsHistoryLimit=2, imagen busybox, comando que haga echo "Limpieza ejecutada".
3. Crea un pod app-critica-qos con requests y limits idénticos, cpu 250m, memory 200Mi, imagen nginx:1.25.
4. Crea un pod app-sin-limites sin ninguna sección resources, imagen nginx:1.25.
5. Guarda la QoS class de ambos pods en /tmp/qos-critica.txt y /tmp/qos-sinlimites.txt.

Criterios de éxito:

```bash exec
kubectl get job procesamiento-lotes
kubectl get cronjob limpieza-logs
cat /tmp/qos-critica.txt
cat /tmp/qos-sinlimites.txt
```

```text output
NAME                  COMPLETIONS
procesamiento-lotes   8/8

NAME             SCHEDULE
limpieza-logs    */3 * * * *

Guaranteed
BestEffort
```

Solución de referencia, no mirar hasta terminar:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: procesamiento-lotes
spec:
  completions: 8
  parallelism: 4
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: worker
        image: busybox
        command: ["sh", "-c", "echo procesando; sleep 2"]
EOF
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: limpieza-logs
spec:
  schedule: "*/3 * * * *"
  concurrencyPolicy: Replace
  successfulJobsHistoryLimit: 2
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: limpiador
            image: busybox
            command: ["sh", "-c", "echo Limpieza ejecutada"]
EOF
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: app-critica-qos
spec:
  containers:
  - name: app
    image: nginx:1.25
    resources:
      requests:
        cpu: 250m
        memory: 200Mi
      limits:
        cpu: 250m
        memory: 200Mi
EOF

kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: app-sin-limites
spec:
  containers:
  - name: app
    image: nginx:1.25
EOF

kubectl get pod app-critica-qos -o jsonpath='{.status.qosClass}' > /tmp/qos-critica.txt
kubectl get pod app-sin-limites -o jsonpath='{.status.qosClass}' > /tmp/qos-sinlimites.txt
```

## 11. Troubleshooting - casos reales

### Caso 1: Job nunca alcanza sus completions

**Síntoma:**

El comando `kubectl get job` muestra COMPLETIONS en algo como 3/6 de forma permanente, sin avanzar.

Diagnóstico paso a paso:

```bash exec
kubectl get pods -l job-name=procesar-datos
```

Buscar pods en Error, CrashLoopBackOff, o ausencia total de pods nuevos.

```bash exec
kubectl describe job procesar-datos
```

Revisar Events: puede indicar BackoffLimitExceeded, lo que significa que ya se agotó el límite de reintentos y el Job dejó de intentar.

Si hay pods fallando repetidamente, revisar sus logs directamente para ver el error real de la aplicación, y confirmar cuántos intentos ya se usaron con `kubectl get job <nombre> -o jsonpath='{.status.failed}'`, sustituyendo `<nombre>` por el Job real.

**Solución:**

Si el problema es backoffLimit agotado por un bug real de la aplicación, corregir la imagen o el comando y recrear el Job. Los Jobs son inmutables en la mayoría de sus campos; a menudo hay que eliminar y recrear en lugar de editar.

### Caso 2: CronJob no crea ningún Job nuevo

**Síntoma:**

El comando `kubectl get cronjob` muestra LAST SCHEDULE vacío o desactualizado, sin Jobs nuevos apareciendo.

Diagnóstico paso a paso:

```bash exec
kubectl get cronjob backup-programado -o jsonpath='{.spec.schedule}'
kubectl get cronjob backup-programado -o jsonpath='{.spec.suspend}'
```

Verificar el schedule, un error de escritura común es usar 6 campos estilo algunos cron de sistema en lugar de los 5 campos estándar de Kubernetes. Verificar también si suspend está en true, lo que significa que el CronJob está pausado deliberadamente.

Revisar también si concurrencyPolicy es Forbid, lo que puede estar omitiendo ejecuciones porque considera que la anterior sigue activa, y revisar startingDeadlineSeconds: si el kube-controller-manager estuvo caído o lento y el deadline ya pasó, la ejecución se cuenta como perdida y no se lanza.

**Solución:**

Reanudar el CronJob si estaba suspendido:

```bash exec
kubectl patch cronjob backup-programado --type=json -p='[{"op":"replace","path":"/spec/suspend","value":false}]'
```

Corregir el schedule si tenía un formato incorrecto.

### Caso 3: pod evictado inesperadamente bajo presión de memoria del nodo

**Síntoma:**

Un pod BestEffort o Burstable desaparece o se reinicia sin que su propio contenedor haya excedido su limit individual.

Diagnóstico paso a paso:

```bash exec
kubectl get pod pod-besteffort -o yaml
```

Buscar reason: Evicted en la sección status.

```bash exec
kubectl get pod pod-besteffort -o jsonpath='{.status.qosClass}'
```

Si es BestEffort, es el primer candidato a evicción.

```bash exec
kubectl describe node cka-worker1
```

Revisar Conditions, buscando MemoryPressure=True, y revisar Events al final del describe para confirmar la presión de memoria del nodo, no del pod individual.

**Solución:**

No es un fallo en sí: es el comportamiento esperado del kubelet para proteger la estabilidad del nodo. La corrección es de diseño: asignar requests apropiados, subiendo de BestEffort a Burstable como mínimo, a las cargas que no deben ser las primeras candidatas a evicción.

## 12. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos. Todos los ejemplos de este módulo funcionan sin requerir múltiples nodos específicamente, pero se recomienda ejecutarlos en el cluster principal para mantener consistencia con el resto del curso y para que los ejemplos de QoS y presión de memoria sean observables en un entorno con recursos reales limitados, a diferencia de un entorno cloud con autoscaling.

**Alternativa K3s (plan B):** Jobs y CronJobs funcionan de forma idéntica, son parte de la API estándar de Kubernetes, batch/v1, sin ninguna dependencia de kubeadm ni del CNI. Requests, limits y QoS classes también funcionan idéntico, ya que dependen del kubelet y de cgroups del kernel Linux, no de la distribución de Kubernetes usada. Única diferencia a considerar: K3s por defecto puede traer configurados límites de recursos más ajustados para el propio sistema operativo base, dependiendo de la VM, lo que puede hacer que el ejemplo de OOMKilled dispare evicción del NODO completo más fácilmente si la VM tiene poca memoria total asignada. Ajustar los valores de --vm-bytes hacia abajo si esto ocurre.

Limpieza del módulo:

```bash exec
kubectl delete job migracion-simple procesar-datos job-con-fallos job-con-timeout procesamiento-lotes
kubectl delete cronjob backup-programado tarea-problematica limpieza-logs
kubectl delete pod pod-guaranteed pod-burstable pod-besteffort pod-oom-demo app-critica-qos app-sin-limites
```

---

**Siguiente módulo:** M09 - Scheduling Avanzado (Affinity, Taints, PriorityClasses)