---
code: M12
order: 12
slug: networkpolicy-segmentacion
title: NetworkPolicy y segmentación
description: Restringe el tráfico ingress y egress entre pods con NetworkPolicy, combinando podSelector, namespaceSelector e ipBlock, implementadas realmente por el CNI.
access: free
updated: "2026-09-08"
prerequisites: [arquitectura-kubernetes, helm-kustomize-crds-operators]
---

## 1. Resumen técnico

Este módulo cubre NetworkPolicy, el objeto que restringe qué tráfico de red pueden enviar y recibir los pods entre sí. Por defecto, Kubernetes no aplica ninguna segmentación: cualquier pod puede hablar con cualquier otro pod del cluster, sin importar el namespace. NetworkPolicy introduce reglas de firewall a nivel de pod, implementadas por el CNI, no por el apiserver ni por ningún componente del control plane.

## 2. Peso en el examen y preguntas típicas

20% del examen, dominio Services & Networking. Preguntas típicas:

- Crea una NetworkPolicy que deniegue todo el tráfico ingress a un namespace por defecto.
- Permite tráfico únicamente desde pods con una label específica.
- Permite tráfico únicamente desde un namespace específico.
- Crea una NetworkPolicy de egress que restrinja hacia dónde puede conectarse un pod.
- Un pod no puede recibir tráfico que debería estar permitido, diagnostica por qué.

## 3. Prerrequisitos

De [M02 (Arquitectura)](/modulos/arquitectura-kubernetes/) usarás el concepto de CNI, Container Network Interface: NetworkPolicy es precisamente una de las responsabilidades que un CNI puede implementar o no.

De [M06 (Extension Interfaces)](/modulos/helm-kustomize-crds-operators/) usarás la comprensión de que Kubernetes define el contrato de NetworkPolicy en su API, pero es Calico, tu CNI, quien realmente traduce esas reglas en filtrado de paquetes real.

## 4. Objetivos de aprendizaje medibles

Al terminar este módulo serás capaz de:

1. Explicar el comportamiento de red por defecto de Kubernetes sin ninguna NetworkPolicy presente.
2. Crear una NetworkPolicy que deniegue todo el tráfico ingress de un namespace.
3. Escribir reglas de ingress y egress usando podSelector, namespaceSelector e ipBlock.
4. Explicar cómo se combinan varias NetworkPolicies que seleccionan el mismo pod.
5. Diagnosticar por qué un CNI concreto puede ignorar una NetworkPolicy válida.
6. Distinguir un problema de NetworkPolicy de un problema de Service o de DNS al diagnosticar conectividad rota.

## 5. Explicación teórica progresiva

### 5.1 Comportamiento por defecto, todo abierto

Sin ninguna NetworkPolicy en el cluster, el modelo de red de Kubernetes es completamente abierto: cualquier pod puede iniciar una conexión hacia cualquier otro pod, sin importar el namespace, y cualquier pod puede recibir tráfico de cualquier origen. Esto es intencional: Kubernetes prioriza la conectividad por defecto y deja la segmentación como una decisión explícita del operador, no un valor por defecto restrictivo.

Una NetworkPolicy nunca abre tráfico por sí sola; solo restringe. Si ningún objeto NetworkPolicy selecciona un pod dado, ese pod sigue completamente abierto, tanto en ingress como en egress, sin importar cuántas NetworkPolicies existan en el cluster para otros pods.

### 5.2 Cómo selecciona una NetworkPolicy

Toda NetworkPolicy define un `podSelector`, que determina a QUÉ pods del mismo namespace se aplica, y un campo `policyTypes`, una lista que puede contener `Ingress`, `Egress`, o ambos, que determina qué dirección de tráfico queda restringida para esos pods.

Un `podSelector: {}` vacío selecciona TODOS los pods del namespace, el patrón usado para políticas de deny-all.

En el momento en que un pod es seleccionado por al menos una NetworkPolicy con `Ingress` en `policyTypes`, ese pod deja de estar abierto por defecto en ingress: solo se permite el tráfico que coincida explícitamente con alguna regla de ingress de alguna policy que lo seleccione. Lo mismo aplica de forma independiente para egress. Un pod puede tener su ingress restringido y su egress completamente abierto, si ninguna policy con `Egress` lo selecciona.

### 5.3 Reglas de ingress y egress

Cada regla de ingress define de dónde puede venir el tráfico permitido, y opcionalmente en qué puertos. Cada regla de egress define hacia dónde puede ir el tráfico permitido, y opcionalmente en qué puertos. Ambas usan la misma sintaxis de selección de origen o destino, llamada peer.

`podSelector` dentro de una regla selecciona pods por su label, dentro del mismo namespace que la NetworkPolicy, salvo que se combine con `namespaceSelector`.

`namespaceSelector` selecciona namespaces completos por su label; combinado con `podSelector` en el mismo elemento de la lista, actúa como AND, pods con esa label en namespaces con esa otra label; como elementos separados de la lista, actúa como OR.

`ipBlock` selecciona rangos de IP en formato CIDR, típicamente usado para tráfico hacia o desde fuera del cluster, con un campo `except` opcional para excluir subrangos específicos dentro del bloque permitido.

### 5.4 Cómo se combinan varias NetworkPolicies

Cuando varias NetworkPolicies seleccionan el mismo pod, sus reglas son ADITIVAS, se combinan como una unión, OR, nunca como una intersección restrictiva. Si la Policy A permite tráfico desde el namespace X, y la Policy B, sobre el mismo pod, permite tráfico desde el namespace Y, el resultado final permite tráfico desde X O desde Y, no exige que el origen cumpla ambas condiciones simultáneamente.

Este comportamiento aditivo es una de las confusiones más comunes en el examen: agregar una NetworkPolicy nueva sobre un pod ya restringido NUNCA puede volverlo más restrictivo por sí sola; solo puede abrir tráfico adicional. Para restringir más, hay que editar o eliminar la policy existente, no agregar una nueva.

### 5.5 Quién implementa realmente esto

Conexión con M02 y M06: el apiserver acepta y guarda el objeto NetworkPolicy en etcd exactamente igual que cualquier otro recurso, pero NO hace nada con él por sí mismo. Es el CNI, Calico en este cluster, quien observa estos objetos y traduce sus reglas en filtrado de paquetes real, usualmente vía iptables, eBPF o el mecanismo interno que use ese CNI en particular.

Esto tiene una consecuencia práctica importante para el examen: si el CNI del cluster no implementa NetworkPolicy, por ejemplo Flannel sin complementos adicionales, los objetos NetworkPolicy se pueden crear sin ningún error, se guardan correctamente en etcd, pero no tienen ningún efecto real sobre el tráfico. Calico, tu CNI, sí implementa NetworkPolicy completamente.

## 6. Diagrama ASCII - evaluación de NetworkPolicy

```text reference
Pod "db" en el namespace "produccion"
Tiene labels: app=db

NetworkPolicy A (namespace produccion):
  podSelector: app=db
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: app=backend

NetworkPolicy B (namespace produccion):
  podSelector: app=db
  policyTypes: [Ingress]
  ingress:
  - from:
    - namespaceSelector: entorno=staging

Pod "db" esta seleccionado por AMBAS policies.
Resultado: union (OR), no interseccion.

  Peticion desde pod app=backend (mismo namespace)
       -> PERMITIDA (coincide con Policy A)

  Peticion desde cualquier pod en un namespace
  con label entorno=staging
       -> PERMITIDA (coincide con Policy B)

  Peticion desde un pod app=frontend en el
  namespace produccion, sin label entorno=staging
       -> DENEGADA (no coincide con ninguna regla
          de ninguna policy que selecciona a "db")

  Egress de "db" hacia cualquier destino
       -> PERMITIDO SIN RESTRICCION, porque ninguna
          policy con Egress en policyTypes selecciona
          a este pod
```

## 7. Ejemplos prácticos desplegables

Preparación, un namespace con dos pods para las pruebas:

```bash exec
kubectl create namespace netpol-lab

kubectl run backend --image=nginx:1.25 -n netpol-lab --labels=app=backend
kubectl run frontend --image=busybox -n netpol-lab --labels=app=frontend --command -- sleep 3600
kubectl expose pod backend --port=80 -n netpol-lab
```

### 7.1 Deny-all de ingress

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-ingress
  namespace: netpol-lab
spec:
  podSelector: {}
  policyTypes:
  - Ingress
EOF
```

Probar la conectividad, ahora bloqueada:

```bash exec
kubectl exec -n netpol-lab frontend -- wget -qO- --timeout=3 backend
```

```text output
wget: download timed out
```

`policyTypes: [Ingress]` con un `ingress` omitido, sin ninguna lista de reglas, significa cero reglas de permiso: todo el ingress queda denegado para los pods seleccionados por el `podSelector: {}`, es decir, todos los pods del namespace.

### 7.2 Permitir desde pods con label específica

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-frontend
  namespace: netpol-lab
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 80
EOF
```

```bash exec
kubectl exec -n netpol-lab frontend -- wget -qO- --timeout=3 backend
```

```text output
<!DOCTYPE html>
<html>
<title>Welcome to nginx!</title>
...
```

Ahora el tráfico pasa, porque esta segunda policy, sumada a la primera de forma aditiva, según 5.4, agrega una regla de permiso explícita desde pods con `app=frontend` hacia el puerto 80.

### 7.3 Permitir desde un namespace específico

```bash exec
kubectl create namespace netpol-confiable
kubectl label namespace netpol-confiable entorno=confiable

kubectl run cliente-externo --image=busybox -n netpol-confiable --command -- sleep 3600
```

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-namespace-confiable
  namespace: netpol-lab
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          entorno: confiable
EOF
```

```bash exec
kubectl exec -n netpol-confiable cliente-externo -- wget -qO- --timeout=3 backend.netpol-lab
```

```text output
<!DOCTYPE html>
<html>
<title>Welcome to nginx!</title>
...
```

El acceso cross-namespace funciona porque el namespace `netpol-confiable` tiene la label que la regla exige, y el nombre del Service se resuelve con el sufijo del namespace destino, `backend.netpol-lab`, patrón que se profundiza en el módulo de CoreDNS.

### 7.4 NetworkPolicy de egress

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: restringir-egress-frontend
  namespace: netpol-lab
spec:
  podSelector:
    matchLabels:
      app: frontend
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: backend
    ports:
    - protocol: TCP
      port: 80
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: UDP
      port: 53
EOF
```

La segunda regla, hacia el puerto 53 UDP en cualquier namespace, es imprescindible: sin permitir explícitamente DNS, `frontend` no podría resolver ningún nombre, ni siquiera `backend`, porque su egress quedaría completamente restringido salvo lo listado.

```bash exec
kubectl exec -n netpol-lab frontend -- wget -qO- --timeout=3 backend
kubectl exec -n netpol-lab frontend -- wget -qO- --timeout=3 http://neverssl.com
```

```text output
<!DOCTYPE html>
<html>
<title>Welcome to nginx!</title>
...

wget: download timed out
```

El tráfico hacia `backend` sigue permitido; el tráfico hacia un destino externo arbitrario queda bloqueado, porque ninguna regla de egress lo cubre.

## 8. Laboratorio guiado

Objetivo: diagnosticar una NetworkPolicy que bloquea tráfico que debería estar permitido, distinguiendo el problema de un fallo de Service o de DNS.

Paso 1, preparar un escenario con una regla mal escrita:

```bash exec
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: policy-incorrecta
  namespace: netpol-lab
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontendd
EOF
```

Paso 2, observar el síntoma, el tráfico previamente permitido en 7.2 ahora se comporta de forma inconsistente, porque esta nueva policy coexiste, aditiva, con `allow-from-frontend`, pero conviene entender qué aporta cada una por separado:

```bash exec
kubectl get networkpolicy -n netpol-lab
```

```text output
NAME                             POD-SELECTOR
deny-all-ingress                 <none>
allow-from-frontend              app=backend
allow-from-namespace-confiable   app=backend
policy-incorrecta                app=backend
```

Paso 3, diagnóstico paso a paso. Como el comportamiento es aditivo, esta cuarta policy NO puede haber roto nada que `allow-from-frontend` ya permitía; si el tráfico sigue funcionando, `policy-incorrecta` simplemente no está agregando la regla que su autor pretendía.

```bash exec
kubectl get networkpolicy policy-incorrecta -n netpol-lab -o yaml | grep -A2 podSelector
```

```text output
    podSelector:
      matchLabels:
        app: frontendd
```

El error de escritura es evidente: `frontendd` con doble d, en lugar de `frontend`. Esta regla nunca coincide con ningún pod real, así que no aporta ningún permiso adicional, aunque tampoco rompe nada gracias al comportamiento aditivo.

Paso 4, corregir:

```bash exec
kubectl patch networkpolicy policy-incorrecta -n netpol-lab --type=json -p='[{"op":"replace","path":"/spec/ingress/0/from/0/podSelector/matchLabels/app","value":"frontend"}]'
```

Paso 5, verificar, aunque en este caso concreto el tráfico ya funcionaba gracias a `allow-from-frontend`, la corrección asegura que `policy-incorrecta` cumple su propósito real de forma independiente:

```bash exec
kubectl get networkpolicy policy-incorrecta -n netpol-lab -o jsonpath='{.spec.ingress[0].from[0].podSelector.matchLabels.app}'
```

```text output
frontend
```

## 9. Checkpoint

**Pregunta 1**

Sin ninguna NetworkPolicy en el cluster, ¿qué pods pueden comunicarse entre sí?

Respuesta: todos. El modelo de red por defecto de Kubernetes es completamente abierto; cualquier pod puede iniciar conexiones hacia cualquier otro pod, sin importar el namespace.

**Pregunta 2**

Dos NetworkPolicies distintas seleccionan el mismo pod con reglas de ingress diferentes. ¿Cómo se combinan?

Respuesta: de forma aditiva, como una unión, OR. Se permite el tráfico que coincida con alguna regla de cualquiera de las policies, nunca se exige que coincida con todas simultáneamente.

**Pregunta 3**

Un pod tiene una NetworkPolicy con `policyTypes: [Ingress]` únicamente. ¿Su tráfico de egress está restringido?

Respuesta: no. policyTypes controla cada dirección de forma independiente; sin ninguna policy con Egress en policyTypes seleccionando a ese pod, su egress permanece completamente abierto.

**Pregunta 4**

Creaste una NetworkPolicy de egress que solo permite tráfico hacia un backend específico, y ahora el pod no puede resolver nombres DNS. ¿Cuál es la causa más probable?

Respuesta: la policy de egress no incluye una regla que permita tráfico UDP en el puerto 53 hacia CoreDNS. Sin esa regla explícita, la resolución DNS queda bloqueada junto con el resto del tráfico no permitido.

**Pregunta 5**

Un cluster usa Flannel sin complementos adicionales como CNI. ¿Qué ocurre al crear una NetworkPolicy ahí?

Respuesta: el objeto se crea sin error y se guarda correctamente en etcd, pero no tiene ningún efecto real sobre el tráfico, porque Flannel sin complementos adicionales no implementa el filtrado de NetworkPolicy.

## 10. Laboratorio cronometrado

Objetivo: completar en menos de 15 minutos.

Tarea:

1. Crea el namespace segmentado-lab con dos pods: api, imagen nginx:1.25, label role=api, y worker, imagen busybox con sleep 3600, label role=worker.
2. Expón api con un Service en el puerto 80.
3. Crea una NetworkPolicy que deniegue todo el ingress por defecto en ese namespace.
4. Crea una segunda NetworkPolicy que permita tráfico hacia api únicamente desde pods con label role=worker, en el puerto 80.
5. Guarda en /tmp/conectividad-permitida.txt el resultado de un wget desde worker hacia api.
6. Crea un tercer pod intruso, imagen busybox con sleep 3600, sin la label role=worker, y guarda en /tmp/conectividad-denegada.txt el resultado de su intento de conexión hacia api.

Criterios de éxito:

```bash exec
cat /tmp/conectividad-permitida.txt
cat /tmp/conectividad-denegada.txt
```

Solución de referencia, no mirar hasta terminar:

```bash exec
kubectl create namespace segmentado-lab

kubectl run api --image=nginx:1.25 -n segmentado-lab --labels=role=api
kubectl run worker --image=busybox -n segmentado-lab --labels=role=worker --command -- sleep 3600
kubectl run intruso --image=busybox -n segmentado-lab --command -- sleep 3600

kubectl expose pod api --port=80 -n segmentado-lab

kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: segmentado-lab
spec:
  podSelector: {}
  policyTypes:
  - Ingress
EOF

kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-worker
  namespace: segmentado-lab
spec:
  podSelector:
    matchLabels:
      role: api
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          role: worker
    ports:
    - protocol: TCP
      port: 80
EOF

kubectl exec -n segmentado-lab worker -- wget -qO- --timeout=3 api > /tmp/conectividad-permitida.txt

kubectl exec -n segmentado-lab intruso -- wget -qO- --timeout=3 api > /tmp/conectividad-denegada.txt 2>&1
```

## 11. Troubleshooting - casos reales

### Caso 1: NetworkPolicy creada pero el tráfico sigue completamente abierto

**Síntoma:**

Se crea una NetworkPolicy de deny-all, pero cualquier pod sigue pudiendo conectarse sin restricción alguna.

Diagnóstico paso a paso:

```bash exec
kubectl get networkpolicy -A
```

Confirmar que la NetworkPolicy realmente existe y está en el namespace correcto.

```bash exec
kubectl get pods -n kube-system -l k8s-app=calico-node
```

Confirmar que Calico está Running en todos los nodos; sin el CNI operativo, sus reglas de NetworkPolicy no se aplican.

```bash exec
kubectl get pods -n kube-system -l k8s-app=calico-node -o jsonpath='{.items[0].spec.nodeName}'
```

**Solución:**

Si Calico no está Running, resolver esa causa raíz primero, siguiendo el troubleshooting de componentes visto en módulos anteriores. Si Calico está sano pero el problema persiste, confirmar que el `podSelector` de la NetworkPolicy realmente coincide con las labels reales de los pods objetivo.

### Caso 2: se agregó una NetworkPolicy nueva esperando restringir más, y no restringió nada

**Síntoma:**

Se crea una NetworkPolicy adicional con la intención de reducir el acceso permitido, pero el tráfico previamente permitido sigue funcionando exactamente igual.

Diagnóstico paso a paso:

Este síntoma es la confusión de 5.4 manifestándose en la práctica. Agregar una NetworkPolicy nunca reduce el acceso ya permitido por otra policy existente sobre el mismo pod; solo puede sumar permisos adicionales.

```bash exec
kubectl get networkpolicy -n netpol-lab -o custom-columns=NAME:.metadata.name,SELECTOR:.spec.podSelector.matchLabels
```

Listar TODAS las policies que seleccionan al pod en cuestión, no solo la que se acaba de crear.

**Solución:**

Para restringir tráfico ya permitido, hay que editar o eliminar la NetworkPolicy existente que lo permite, no agregar una nueva. Una NetworkPolicy adicional solo sirve para abrir tráfico nuevo, nunca para cerrar el que otra policy ya abrió.

### Caso 3: egress bloqueado rompe DNS de forma silenciosa

**Síntoma:**

Un pod con una NetworkPolicy de egress restrictiva falla al conectarse a cualquier destino, incluidos los que la policy sí debería permitir, con errores que parecen de DNS más que de conectividad.

Diagnóstico paso a paso:

```bash exec
kubectl exec -n netpol-lab frontend -- nslookup backend
```

```text output
;; connection timed out; no servers could be reached
```

```bash exec
kubectl get networkpolicy -n netpol-lab -o yaml | grep -B5 "port: 53"
```

Confirmar si existe una regla de egress explícita hacia el puerto 53, UDP y TCP, ya que algunas resoluciones DNS usan TCP para respuestas grandes.

**Solución:**

Agregar una regla de egress que permita tráfico hacia CoreDNS, típicamente en el namespace kube-system, en los puertos 53 UDP y TCP, antes de restringir cualquier otro egress del pod.

## 12. Entorno requerido

Entorno principal: cluster kubeadm de 3 nodos con Calico. Este módulo depende directamente de que el CNI implemente NetworkPolicy; sin Calico, o con un CNI que no lo soporte, ninguno de los ejemplos tendría efecto real, aunque los comandos se ejecutarían sin error.

**Alternativa K3s (plan B):** NetworkPolicy es API estándar de Kubernetes, pero K3s usa Flannel como CNI por defecto, que NO implementa NetworkPolicy. Si practicas en K3s con su configuración por defecto, los objetos NetworkPolicy se crearán sin error pero no tendrán ningún efecto real sobre el tráfico; sería necesario instalar Calico u otro CNI compatible en K3s para replicar este módulo con sentido.

Limpieza del módulo:

```bash exec
kubectl delete namespace netpol-lab netpol-confiable segmentado-lab
```

---

**Siguiente módulo:** M13 - CoreDNS y Resolución de Nombres