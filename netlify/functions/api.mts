import type { Context, Config } from "@netlify/functions";
import { getStore, getDeployStore } from "@netlify/blobs";

/**
 * API de la app de levantamientos de ALFEX.
 *
 * Guarda los levantamientos, las fotos y los ajustes (datos de la empresa y
 * catalogo de precios) en Netlify Blobs, para que lo que se levanta en terreno
 * quede disponible en la oficina y en el resto de los equipos.
 *
 * Nota: Netlify empaqueta las variables de entorno dentro del build de la
 * funcion; un cambio de ALFEX_CLAVE requiere un deploy nuevo de este archivo
 * para que la funcion en ejecucion la tome (no basta con guardarla).
 *
 * Todas las llamadas exigen la clave compartida de la variable de entorno
 * ALFEX_CLAVE en el encabezado x-alfex-clave.
 */

const HEADER_CLAVE = "x-alfex-clave";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Los deploys que no son de produccion escriben en su propio store, para no
 *  mezclar datos de prueba con los levantamientos reales. */
function store(nombre: string) {
  const opciones = { name: nombre, consistency: "strong" as const };
  const contexto = (globalThis as any).Netlify?.context?.deploy?.context;
  return contexto === "production" ? getStore(opciones) : getDeployStore(opciones);
}

export default async (req: Request, _context: Context) => {
  const clave = Netlify.env.get("ALFEX_CLAVE");
  if (!clave) {
    return json(
      { error: "El sitio no tiene configurada la clave de acceso (variable ALFEX_CLAVE)." },
      503,
    );
  }
  if (req.headers.get(HEADER_CLAVE) !== clave) {
    return json({ error: "Clave de acceso incorrecta." }, 401);
  }

  const url = new URL(req.url);
  const partes = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const recurso = partes[0] ?? "";
  const id = partes[1] ? decodeURIComponent(partes[1]) : "";
  const metodo = req.method.toUpperCase();

  try {
    // --- estado: sirve para validar la clave desde la app ---
    if (recurso === "estado" && metodo === "GET") {
      const { blobs } = await store("alfex-levantamientos").list();
      return json({ ok: true, levantamientos: blobs.length });
    }

    // --- levantamientos ---
    if (recurso === "levantamientos") {
      const s = store("alfex-levantamientos");

      if (metodo === "GET" && !id) {
        const { blobs } = await s.list();
        const todos = await Promise.all(
          blobs.map((b) => s.get(b.key, { type: "json" }).catch(() => null)),
        );
        return json(todos.filter(Boolean));
      }
      if (metodo === "GET" && id) {
        const uno = await s.get(id, { type: "json" });
        return uno ? json(uno) : json({ error: "No existe ese levantamiento." }, 404);
      }
      if (metodo === "PUT" && id) {
        const cuerpo = await req.json();
        await s.setJSON(id, { ...cuerpo, guardadoEn: Date.now() });
        return json({ ok: true });
      }
      if (metodo === "DELETE" && id) {
        await s.delete(id);
        return json({ ok: true });
      }
    }

    // --- fotos (una por clave, {full, thumb, w, h}) ---
    if (recurso === "fotos" && id) {
      const s = store("alfex-fotos");

      if (metodo === "GET") {
        const foto = await s.get(id, { type: "json" });
        return foto ? json(foto) : json({ error: "No existe esa foto." }, 404);
      }
      if (metodo === "PUT") {
        const cuerpo = await req.json();
        await s.setJSON(id, cuerpo);
        return json({ ok: true });
      }
      if (metodo === "DELETE") {
        await s.delete(id);
        return json({ ok: true });
      }
    }

    // --- ajustes compartidos: datos de la empresa y catalogo de precios ---
    if (recurso === "ajustes") {
      const s = store("alfex-ajustes");

      if (metodo === "GET") {
        const a = await s.get("ajustes", { type: "json" });
        return json(a ?? null);
      }
      if (metodo === "PUT") {
        const cuerpo = await req.json();
        await s.setJSON("ajustes", cuerpo);
        return json({ ok: true });
      }
    }

    return json({ error: "Ruta no encontrada." }, 404);
  } catch (e) {
    return json({ error: "Error en el servidor: " + (e as Error).message }, 500);
  }
};

export const config: Config = {
  path: "/api/*",
};
