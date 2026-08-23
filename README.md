# ALFEX · Levantamiento técnico

App de terreno para **Alfex Obras Civiles**: el equipo agenda la visita, captura
el levantamiento (fotos + medidas por recinto), la app arma el **informe** y de
ahí la **cotización**, y todo sale como un **único PDF** para que el cliente lo
revise y lo apruebe.

Construida sobre el handoff de diseño `design_handoff_alfex_levantamiento`
(design system Industry con la marca Alfex: naranjo #e2651c + grafito).

## Tres roles, un solo producto

| Rol | Qué ve |
| --- | --- |
| **Terreno** | Visitas del día (incluidas las agendadas) y captura: recintos, partidas del catálogo, medidas, fotos con descripción y checklist de condiciones. |
| **Oficina** | Panel con KPIs y pipeline, cotización editable con utilidad propia por proyecto. |
| **Clientes** | Directorio de clientes con sus sucursales y cotizaciones; el documento combinado y su aprobación. |

Todo lo que es de la **empresa** (no de un proyecto) — cuentas del equipo,
datos de ALFEX, parámetros por defecto y catálogo de precios — vive detrás de
la tuerca (⚙) del encabezado, en **Configuración**.

## Cómo funciona

- **La cantidad se calcula, no se escribe**: es el producto de las dimensiones
  de la unidad de cada partida (m² = largo × alto o largo × ancho; ml = largo;
  un/gl/día = cantidad). Oficina puede sobrescribirla; el informe conserva la
  medida original.
- **Fórmulas** (exactas, según el handoff):
  ```
  neto            = Σ cantidad × precio unitario   (solo líneas incluidas)
  gastos generales = neto × gg%                    (parámetro de la empresa)
  utilidad         = neto × utilidad%               (propia de cada cotización)
  subtotal         = neto + gastos generales + utilidad
  iva              = subtotal × iva%                (parámetro de la empresa)
  total            = subtotal + iva
  ```
  La utilidad se define en Oficina, dentro de cada cotización — no es un
  porcentaje único para toda la empresa. "Utilidad inicial" en Configuración
  solo sugiere el valor de un proyecto recién creado.
- **Numeración**: OT `OT-####`, cotización `CT-###/AA`, fotos `F#` secuenciales
  por levantamiento. Si dos equipos crean una OT sin señal, el correlativo
  repetido se resuelve solo al sincronizar.
- **Agendamiento**: desde Visitas, *+ Agendar* crea una OT en estado
  *Agendada* con cliente, sucursal (o un cliente nuevo creado ahí mismo),
  obra y fecha/hora. Se activa como *En terreno* apenas alguien la abre para
  capturar.
- **Dos firmas, ambas opcionales**: al terminar el informe, el contacto en
  obra puede firmar la *conformidad en terreno* con el dedo — deja constancia
  de que lo levantado está correcto, pero no es obligatorio para cotizar.
  Más adelante, la aprobación de la cotización también admite **firma en
  pantalla** o **aprobación sin firma** ("aprobado por correo"), porque en la
  práctica la mayoría de los clientes aprueba por ese medio.
- **Offline primero**: todo se guarda en el equipo apenas se escribe
  (localStorage + IndexedDB para las fotos) y sube cuando hay red. El chip del
  encabezado muestra el estado: *En línea*, *Pendiente*, *Sin red*, *Sin sesión*.
- **Conflictos**: gana la versión más reciente del levantamiento; el catálogo de
  precios, los parámetros y el directorio de clientes se comparten entre todos
  los equipos.

## Clientes y sucursales

Cada cliente tiene un nombre y una o más **sucursales** (nombre, dirección,
encargado, teléfono, email). Al abrir un cliente se ve su lista de sucursales
y todas sus cotizaciones con su estado. Se incorporan de a uno con
*+ Incorporar cliente*, o varios juntos con *Importación masiva* — un CSV
simple, una sucursal por línea: `cliente,sucursal,dirección,encargado,
teléfono,email`.

Los proyectos cargados antes de que existiera este directorio (con solo un
nombre de cliente escrito a mano, sin ficha) siguen apareciendo agrupados por
ese nombre, marcados como *"Sin ficha completa"*; un botón los convierte en
una ficha real sin perder sus cotizaciones ya hechas.

## Acceso

Cada persona entra con **su nombre y su clave**, en Configuración → *Tu
cuenta*. No hay niveles de permiso — todas las cuentas ven y editan lo mismo —
el login sirve para identificar quién hizo cada cosa (queda como "Levantó" en
la OT), no para restringir. La primera persona que abre la app crea la primera
cuenta; desde ahí, cualquiera que ya tenga sesión puede agregar a las demás
(Configuración → Tu cuenta → *Personas con acceso* → *+ Agregar persona*), o
quitarlas con el mismo panel.

Las claves se guardan como hash SHA-256 en el servidor, nunca en texto plano.
Sin sesión iniciada, la app funciona igual pero guarda solo en ese equipo, sin
compartir con el resto.

No hay ninguna variable de entorno que configurar en Netlify: todo el acceso
vive en los datos de la app (Netlify Blobs), no en la configuración del sitio.

## Catálogo de precios

Vive en Configuración → *Catálogo de precios*, compartido por todo el equipo.
Admite importación masiva por CSV: `código,familia,descripción,unidad,precio`
(unidades válidas: `m2`, `m3`, `ml`, `un`, `gl`, `dia`). Cambiar un precio ahí
no afecta cotizaciones ya enviadas, solo las partidas que se agreguen después.

## Estructura

```
public/index.html            La app completa (un solo archivo)
netlify/functions/api.mts    API: levantamientos, fotos, ajustes, clientes y usuarios
netlify.toml                 Configuración del sitio
```

Los datos viven en **Netlify Blobs**: `alfex-levantamientos`, `alfex-fotos`,
`alfex-ajustes`, `alfex-clientes`, `alfex-usuarios` y `alfex-sesiones`. No hay
base de datos que administrar.

## Datos de ejemplo vs. datos reales

El catálogo trae las 12 partidas del handoff (pintura, impermeabilización,
mantención, instalaciones, apoyo) con **precios de ejemplo**. Hay que
reemplazarlos por la lista real de precios de Alfex: se editan en
Oficina → *Catálogo de precios*, y quedan compartidos con todo el equipo.

## Desplegar

Arrastrar la carpeta a la pestaña **Deploys** de
https://app.netlify.com/projects/cotizador-alfex

O bien, desde esta carpeta:

```shell
npm install
npx netlify-cli deploy --prod --site 10d303bf-8399-438a-8a1b-c4b7f10e9449
```

Queda publicada en https://cotizador-alfex.netlify.app

## Versión anterior

`public/index-v1-respaldo.html` es la primera versión (capítulos y líneas de
cubicación, antes del handoff de diseño). Los levantamientos que se hayan
hecho con ella se convierten solos al abrir esta versión: cada partida pasa a
un recinto único conservando su cantidad ya calculada.

Publicado vía GitHub + Netlify (deploy continuo).
