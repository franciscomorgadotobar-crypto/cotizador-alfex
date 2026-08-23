import type { Context, Config } from "@netlify/functions";
import { getStore, getDeployStore } from "@netlify/blobs";

/**
 * API de la app de levantamientos de ALFEX.
 *
 * Guarda los levantamientos, las fotos, los ajustes (datos de la empresa y
 * catalogo de precios) y las personas del equipo en Netlify Blobs, para que
 * lo que se levanta en terreno quede disponible en la oficina y en el resto
 * de los equipos.
 *
 * El acceso es por persona: cada quien crea su cuenta (nombre + clave) desde
 * la app y entra con eso. No hay niveles de permiso — todas las cuentas ven
 * y editan lo mismo — el login sirve para identificar quien hizo cada cosa,
 * no para restringir. Las claves se guardan como hash SHA-256, nunca en
 * texto plano.
 */

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

type Usuario = { id: string; nombre: string; claveHash: string };
type Sesion = { id: string; nombre: string; creadoEn: number };

async function listaUsuarios(): Promise<Usuario[]> {
  const u = store("alfex-usuarios");
  const { blobs } = await u.list();
  const todos = await Promise.all(blobs.map((b) => u.get(b.key, { type: "json" }).catch(() => null)));
  return todos.filter(Boolean) as Usuario[];
}

async function sesionValida(req: Request): Promise<Sesion | null> {
  const token = req.headers.get("x-alfex-token");
  if (!token) return null;
  const s = store("alfex-sesiones");
  const sesion = await s.get(token, { type: "json" });
  return (sesion as Sesion) || null;
}

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const partes = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const recurso = partes[0] ?? "";
  const id = partes[1] ? decodeURIComponent(partes[1]) : "";
  const metodo = req.method.toUpperCase();

  try {
    // --- estado: sin sesion, solo para saber si el sitio tiene la API instalada ---
    if (recurso === "estado" && metodo === "GET") {
      const usuarios = await listaUsuarios();
      return json({ ok: true, usuarios: usuarios.length });
    }

    // --- usuarios: los nombres son visibles sin sesion (para elegir "quien eres");
    //     crear la primera cuenta tampoco requiere sesion (no hay a quien pedirsela);
    //     de ahi en mas, crear/editar/borrar exige estar identificado con alguna cuenta ---
    if (recurso === "usuarios") {
      const u = store("alfex-usuarios");

      if (metodo === "GET" && !id) {
        const todos = await listaUsuarios();
        return json(todos.map((x) => ({ id: x.id, nombre: x.nombre })));
      }
      if (metodo === "POST" && !id) {
        const todos = await listaUsuarios();
        if (todos.length > 0 && !(await sesionValida(req))) {
          return json({ error: "Inicia sesión para agregar a otra persona." }, 401);
        }
        const cuerpo = await req.json();
        const nombre = String(cuerpo.nombre || "").trim();
        const claveHash = String(cuerpo.claveHash || "");
        if (!nombre || !claveHash) return json({ error: "Falta el nombre o la clave." }, 400);
        if (todos.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase())) {
          return json({ error: "Ya existe una persona con ese nombre." }, 409);
        }
        const nuevo: Usuario = { id: crypto.randomUUID(), nombre, claveHash };
        await u.setJSON(nuevo.id, nuevo);
        return json({ id: nuevo.id, nombre: nuevo.nombre });
      }
      if (metodo === "PUT" && id) {
        if (!(await sesionValida(req))) return json({ error: "Sesión requerida." }, 401);
        const actual = (await u.get(id, { type: "json" })) as Usuario | null;
        if (!actual) return json({ error: "No existe esa persona." }, 404);
        const cuerpo = await req.json();
        const actualizado: Usuario = {
          ...actual,
          ...(cuerpo.nombre ? { nombre: String(cuerpo.nombre).trim() } : {}),
          ...(cuerpo.claveHash ? { claveHash: String(cuerpo.claveHash) } : {}),
        };
        await u.setJSON(id, actualizado);
        return json({ ok: true });
      }
      if (metodo === "DELETE" && id) {
        if (!(await sesionValida(req))) return json({ error: "Sesión requerida." }, 401);
        await u.delete(id);
        return json({ ok: true });
      }
    }

    // --- login: nombre + hash de clave -> token de sesion ---
    if (recurso === "login" && metodo === "POST") {
      const cuerpo = await req.json();
      const nombre = String(cuerpo.nombre || "").trim();
      const claveHash = String(cuerpo.claveHash || "");
      const todos = await listaUsuarios();
      const usuario = todos.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase());
      if (!usuario || usuario.claveHash !== claveHash) {
        return json({ error: "Nombre o clave incorrectos." }, 401);
      }
      const token = crypto.randomUUID();
      const s = store("alfex-sesiones");
      await s.setJSON(token, { id: usuario.id, nombre: usuario.nombre, creadoEn: Date.now() });
      return json({ token, id: usuario.id, nombre: usuario.nombre });
    }

    // --- de aqui en adelante, todo exige sesion valida ---
    const sesion = await sesionValida(req);
    if (!sesion) return json({ error: "Sesión requerida." }, 401);

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
