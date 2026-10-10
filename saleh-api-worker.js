const PUBLIC_ORIGIN = "https://salehd.cc";
const MEDIA_ORIGIN = "https://media.salehd.cc";
const cors = {
  "access-control-allow-origin": PUBLIC_ORIGIN,
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
  "vary": "Origin"
};

function out(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...cors,
      ...extra
    }
  });
}
function id() { return crypto.randomUUID(); }
function identity(req) { return req.headers.get("Cf-Access-Jwt-Assertion") || req.headers.get("cf-access-jwt-assertion"); }
function assetUrl(key) { return `${MEDIA_ORIGIN}/${key}`; }
function assetKey(url) {
  const value = String(url || "");
  return value.startsWith(`${MEDIA_ORIGIN}/`) ? value.slice(MEDIA_ORIGIN.length + 1) : "";
}
function clean(p) {
  return {
    id: String(p.id || id()),
    title: String(p.title || "").trim(),
    category: String(p.category || "مشروع إبداعي"),
    year: String(p.year || new Date().getFullYear()),
    status: ["draft", "published", "archived"].includes(p.status) ? p.status : "draft",
    description: String(p.description || ""),
    image: String(p.image || ""),
    link: String(p.link || ""),
    gallery: Array.isArray(p.gallery) ? p.gallery.filter(x => typeof x === "string") : []
  };
}
async function projects(db, all = false) {
  const q = all
    ? "SELECT * FROM projects ORDER BY updated_at DESC"
    : "SELECT * FROM projects WHERE status='published' ORDER BY updated_at DESC";
  const r = await db.prepare(q).all();
  const imgs = await db.prepare("SELECT project_id,image_url FROM project_images ORDER BY sort_order ASC").all();
  const by = {};
  for (const x of imgs.results || []) (by[x.project_id] ??= []).push(x.image_url);
  return (r.results || []).map(x => ({ ...x, gallery: by[x.id] || [] }));
}
function day() { return new Date().toISOString().slice(0, 10); }
async function recordAnalytics(db, event, projectId) {
  const today = day();
  if (event === "visit") {
    await db.prepare("INSERT INTO analytics_daily (day,visits,updated_at) VALUES (?,1,CURRENT_TIMESTAMP) ON CONFLICT(day) DO UPDATE SET visits=visits+1,updated_at=CURRENT_TIMESTAMP").bind(today).run();
  } else if (event === "project_view" && projectId) {
    await db.prepare("INSERT INTO project_views (project_id,views,last_viewed_at) VALUES (?,1,CURRENT_TIMESTAMP) ON CONFLICT(project_id) DO UPDATE SET views=views+1,last_viewed_at=CURRENT_TIMESTAMP").bind(projectId).run();
  }
}
async function analytics(db) {
  const total = await db.prepare("SELECT COALESCE(SUM(visits),0) AS total FROM analytics_daily").first();
  const today = await db.prepare("SELECT COALESCE(visits,0) AS visits FROM analytics_daily WHERE day=?").bind(day()).first();
  const daily = await db.prepare("SELECT day,visits FROM analytics_daily ORDER BY day DESC LIMIT 30").all();
  const top = await db.prepare("SELECT pv.project_id,pv.views,p.title,p.category FROM project_views pv LEFT JOIN projects p ON p.id=pv.project_id ORDER BY pv.views DESC,pv.last_viewed_at DESC LIMIT 10").all();
  return { totalVisits: Number(total?.total || 0), todayVisits: Number(today?.visits || 0), daily: (daily.results || []).reverse(), topProjects: top.results || [] };
}
async function getContact(db) {
  const row = await db.prepare("SELECT value,updated_at FROM site_settings WHERE key=?").bind("contact").first();
  try { return { ...(JSON.parse(row?.value || "{}")), updated_at: row?.updated_at || null }; }
  catch { return { updated_at: row?.updated_at || null }; }
}
function cleanContact(value) {
  const v = value && typeof value === "object" ? value : {};
  return { phone:String(v.phone||"").trim().slice(0,80), whatsapp:String(v.whatsapp||"").trim().slice(0,160), location:String(v.location||"").trim().slice(0,120), website:String(v.website||"").trim().slice(0,120), instagram:String(v.instagram||"").trim().slice(0,300), snapchat:String(v.snapchat||"").trim().slice(0,300), email:String(v.email||"").trim().slice(0,160) };
}
async function orphanAssets(env) {
  const refs = new Set();
  const covers = await env.DB.prepare("SELECT image FROM projects WHERE image IS NOT NULL AND image != ''").all();
  const gallery = await env.DB.prepare("SELECT image_url FROM project_images WHERE image_url IS NOT NULL AND image_url != ''").all();
  for (const row of covers.results || []) { const key=assetKey(row.image); if(key) refs.add(key); }
  for (const row of gallery.results || []) { const key=assetKey(row.image_url); if(key) refs.add(key); }
  const orphaned=[]; let cursor;
  do { const page=await env.ASSETS.list({prefix:"projects/",cursor}); for(const object of page.objects||[]) if(!refs.has(object.key)) orphaned.push({key:object.key,size:object.size||0,uploaded:object.uploaded||null}); cursor=page.truncated?page.cursor:undefined; } while(cursor);
  return {referenced:refs.size,orphaned};
}
function extension(contentType) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" })[contentType] || "bin";
}
async function uploadAsset(env, body, contentType, projectId, label = "image") {
  const key = `projects/${projectId}/${label}-${crypto.randomUUID()}.${extension(contentType)}`;
  await env.ASSETS.put(key, body, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable"
    }
  });
  return { key, url: assetUrl(key) };
}
async function deleteAsset(env, url) {
  const key = assetKey(url);
  if (key) await env.ASSETS.delete(key);
}
function decodeDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { contentType: match[1], bytes };
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors } });
    if (!u.pathname.startsWith("/api/")) return out({ service: "saleh-design-api", ok: true });

    try {
      if (u.pathname === "/api/projects" && request.method === "GET") {
        return out({ projects: await projects(env.DB, false) }, 200, { "cache-control": "public, max-age=60, s-maxage=300" });
      }
      if (u.pathname === "/api/settings" && request.method === "GET") {
        return out({ contact: await getContact(env.DB) }, 200, { "cache-control": "public, max-age=60, s-maxage=300" });
      }
      if (u.pathname === "/api/analytics/view" && request.method === "POST") {
        const p = await request.json().catch(() => ({}));
        if (["visit", "project_view"].includes(p.event)) await recordAnalytics(env.DB, p.event, String(p.project_id || ""));
        return out({ ok: true });
      }
      if (u.pathname.startsWith("/api/admin/") && !identity(request)) return out({ error: "Unauthorized" }, 401);
      if (u.pathname === "/api/admin/analytics" && request.method === "GET") return out(await analytics(env.DB));
      if (u.pathname === "/api/admin/settings/contact" && request.method === "GET") return out({ contact: await getContact(env.DB) });
      if (u.pathname === "/api/admin/settings/contact" && request.method === "PUT") {
        const contact=cleanContact(await request.json().catch(()=>({})));
        await env.DB.prepare("INSERT INTO site_settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind("contact",JSON.stringify(contact)).run();
        return out({ok:true,contact:await getContact(env.DB)});
      }
      if (u.pathname === "/api/admin/assets/orphans" && request.method === "GET") {
        return out({ok:true,dryRun:true,...await orphanAssets(env)});
      }
      if (u.pathname === "/api/admin/assets/orphans" && request.method === "DELETE") {
        const report=await orphanAssets(env),deleted=[];
        for(const item of report.orphaned){await env.ASSETS.delete(item.key);deleted.push(item);}
        return out({ok:true,dryRun:false,referenced:report.referenced,deleted,count:deleted.length});
      }

      if (u.pathname === "/api/admin/upload" && request.method === "POST") {
        const form = await request.formData();
        const file = form.get("file");
        const projectId = String(form.get("project_id") || id());
        if (!file || typeof file.stream !== "function") return out({ error: "لم يتم إرسال ملف صحيح" }, 400);
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
        if (!allowed.includes(file.type)) return out({ error: "يسمح فقط بصور JPG وPNG وWebP وAVIF وGIF" }, 415);
        if (file.size > 5 * 1024 * 1024) return out({ error: "حجم الصورة يجب ألا يتجاوز 5MB" }, 413);
        const result = await uploadAsset(env, file.stream(), file.type, projectId, String(form.get("label") || "image"));
        return out({ ok: true, ...result }, 201);
      }

      if (u.pathname === "/api/admin/migrate-images" && request.method === "POST") {
        const rows = await env.DB.prepare("SELECT id,image FROM projects WHERE image LIKE 'data:%'").all();
        const migrated = [];
        for (const row of rows.results || []) {
          const decoded = decodeDataUrl(row.image);
          if (!decoded) continue;
          const uploaded = await uploadAsset(env, decoded.bytes, decoded.contentType, String(row.id), "cover");
          await env.DB.prepare("UPDATE projects SET image=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(uploaded.url, row.id).run();
          migrated.push({ id: row.id, url: uploaded.url });
        }
        const gallery = await env.DB.prepare("SELECT id,project_id,image_url FROM project_images WHERE image_url LIKE 'data:%'").all();
        for (const row of gallery.results || []) {
          const decoded = decodeDataUrl(row.image_url);
          if (!decoded) continue;
          const uploaded = await uploadAsset(env, decoded.bytes, decoded.contentType, String(row.project_id), "gallery");
          await env.DB.prepare("UPDATE project_images SET image_url=? WHERE id=?").bind(uploaded.url, row.id).run();
          migrated.push({ id: row.id, url: uploaded.url });
        }
        return out({ ok: true, migrated, count: migrated.length });
      }

      if (u.pathname === "/api/admin/projects" && request.method === "GET") return out({ projects: await projects(env.DB, true) });
      if (u.pathname === "/api/admin/projects" && request.method === "POST") {
        const p = clean(await request.json());
        if (!p.title) return out({ error: "title required" }, 400);
        await env.DB.prepare(`INSERT INTO projects (id,title,category,year,status,description,image,link,created_by,updated_by,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(p.id, p.title, p.category, p.year, p.status, p.description, p.image, p.link, "access-user", "access-user", p.status === "published" ? new Date().toISOString() : null).run();
        for (let i = 0; i < p.gallery.length; i++) await env.DB.prepare("INSERT INTO project_images (id,project_id,image_url,sort_order) VALUES (?,?,?,?)").bind(id(), p.id, p.gallery[i], i).run();
        return out({ project: p }, 201);
      }

      const m = u.pathname.match(/^\/api\/admin\/projects\/([^/]+)$/);
      if (m && ["PUT", "DELETE"].includes(request.method)) {
        const pid = m[1];
        if (request.method === "DELETE") {
          const old = await env.DB.prepare("SELECT image FROM projects WHERE id=?").bind(pid).first();
          const gallery = await env.DB.prepare("SELECT image_url FROM project_images WHERE project_id=?").bind(pid).all();
          await env.DB.prepare("DELETE FROM projects WHERE id=?").bind(pid).run();
          await env.DB.prepare("DELETE FROM project_images WHERE project_id=?").bind(pid).run();
          await env.DB.prepare("DELETE FROM project_views WHERE project_id=?").bind(pid).run();
          await deleteAsset(env, old?.image);
          for (const row of gallery.results || []) await deleteAsset(env, row.image_url);
          return out({ ok: true });
        }
        const old = await env.DB.prepare("SELECT image FROM projects WHERE id=?").bind(pid).first();
        const p = clean({ ...await request.json(), id: pid });
        await env.DB.prepare(`UPDATE projects SET title=?,category=?,year=?,status=?,description=?,image=?,link=?,updated_by=?,updated_at=CURRENT_TIMESTAMP,published_at=? WHERE id=?`).bind(p.title, p.category, p.year, p.status, p.description, p.image, p.link, "access-user", p.status === "published" ? new Date().toISOString() : null, pid).run();
        const oldGallery = await env.DB.prepare("SELECT image_url FROM project_images WHERE project_id=?").bind(pid).all();
        await env.DB.prepare("DELETE FROM project_images WHERE project_id=?").bind(pid).run();
        for (let i = 0; i < p.gallery.length; i++) await env.DB.prepare("INSERT INTO project_images (id,project_id,image_url,sort_order) VALUES (?,?,?,?)").bind(id(), pid, p.gallery[i], i).run();
        if (old?.image && old.image !== p.image) await deleteAsset(env, old.image);
        const keep = new Set(p.gallery);
        for (const row of oldGallery.results || []) if (!keep.has(row.image_url)) await deleteAsset(env, row.image_url);
        return out({ project: p });
      }
      return out({ error: "Not found" }, 404);
    } catch (e) {
      return out({ error: e.message || "Server error" }, 500);
    }
  }
};
