# ALFEX · Levantamiento técnico

App de terreno para **Alfex Obras Civiles**: el equipo captura el levantamiento
(fotos + medidas por recinto), la app arma el **informe** y de ahí la
**cotización**, y todo sale como un **único PDF** para que el mandante lo revise
y lo firme.

Construida sobre el handoff de diseño `design_handoff_alfex_levantamiento`
(design system Industry con la marca Alfex: naranjo #e2651c + grafito).

## Tres roles, un solo producto

| Rol | Qué ve |
| --- | --- |
| **Terreno** | Visitas del día y captura: recintos, partidas del catálogo, medidas, fotos y checklist de condiciones. |
| **Oficina** | Panel con KPIs y pipeline, cotización editable, catálogo de precios y ajustes. |
| **Cliente** | El documento combinado (informe + cotización) y la firma con el dedo. |

## Cómo funciona

- **La cantidad se calcula, no se escribe**: es el producto de las dimensiones
  de la unidad de cada partida (m² = largo × alto o largo × ancho; ml = largo;
  un/gl/día = cantidad). Oficina puede sobrescribirla; el informe conserva la
  medida original.
- **Fórmulas** (exactas, según el handoff):
  ```
  neto            = Σ cantidad × precio unitario   (solo líneas incluidas)
  gastos generales = neto × 0,12
  utilidad         = neto × 0,08
  subtotal         = neto + gastos generales + utilidad
  iva              = subtotal × 0,19
  total            = subtotal + iva
  ```
- **Numeración**: OT `OT-####`, cotización `CT-###/AA`, fotos `F#` secuenciales
  por levantamiento. Si dos equipos crean una OT sin señal, el correlativo
  repetido se resuelve solo al sincronizar.
- **Offline primero**: todo se guarda en el equipo apenas se escribe
  (localStorage + IndexedDB para las fotos) y sube cuando hay red. El chip del
  encabezado muestra el estado: *En línea*, *Pendiente*, *Sin red*, *Sin clave*.
- **Conflictos**: gana la versión más reciente del levantamiento; el catálogo de
  precios y los parámetros se comparten entre todos los equipos.

## Acceso

El guardado en la nube se protege con una clave compartida (variable
`ALFEX_CLAVE` en Netlify). Cada persona la ingresa una vez, en el rol
**Oficina**. Sin clave la app funciona igual, pero guardando solo en ese equipo.

## Estructura

```
public/index.html            La app completa (un solo archivo)
netlify/functions/api.mts    API: levantamientos, fotos y ajustes compartidos
netlify.toml                 Configuración del sitio
```

Los datos viven en **Netlify Blobs** (`alfex-levantamientos`, `alfex-fotos`,
`alfex-ajustes`). No hay base de datos que administrar.

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
