import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Level, PhenomenonAssessment } from "@/lib/domain";
import { snapPoint } from "@/lib/geo";
import { env } from "@/server/core/env";
import { fetchSource } from "@/server/core/http";
import { log } from "@/server/core/log";
import { candidatesFor } from "../alerts/candidates";
import { decide, type Notice } from "../alerts/engine";
import { inQuietHours, sendPush } from "../notify/push";
import { assessPoint } from "../risk/assess";
import { INA_SERIES_CORDOBA, observationsUrl, parseObservations } from "../sources/ina-a5";
import { fetchOfficialAlerts } from "../sources/official";
import { SMN_CAP_INDEX } from "../sources/smn-cap";

/*
 * Corrida completa: adquisición → normalización → inferencia → decisión → envío.
 * Cada paso registra su resultado en source_runs/deliveries para medir latencia y fallos de punta a punta.
 */
const MAX_PLACES_PER_RUN = 500;

export interface RunReport {
  startedAt: string;
  finishedAt?: string;
  officialAlerts: number;
  observations: number;
  places: number;
  predictions: number;
  decisions: number;
  notified: number;
  failedDeliveries: number;
  errors: string[];
}

async function recordRun(sb: SupabaseClient, sourceId: string, started: Date, ok: boolean, items: number, dataTime: string | null, error?: string) {
  await sb.from("source_runs").insert({
    source_id: sourceId, started_at: started.toISOString(), finished_at: new Date().toISOString(), ok, items,
    latency_ms: Date.now() - started.getTime(), data_time: dataTime, error: error ?? null,
  });
}

export async function runIngest(sb: SupabaseClient, now = new Date()): Promise<RunReport> {
  const report: RunReport = { startedAt: now.toISOString(), officialAlerts: 0, observations: 0, places: 0, predictions: 0, decisions: 0, notified: 0, failedDeliveries: 0, errors: [] };

  // 1. Alertas oficiales: crudo + normalizado.
  const t1 = new Date();
  const official = await fetchOfficialAlerts(now);
  try {
    const idx = await fetchSource(SMN_CAP_INDEX, { revalidate: false, maxBytes: 2_000_000 });
    await sb.from("raw_payloads").upsert(
      { source_id: "smn-cap", url: idx.url, fetched_at: idx.fetchedAt, http_status: idx.status, content_type: idx.contentType, bytes: idx.bytes, sha256: idx.sha256, body: idx.body },
      { onConflict: "source_id,sha256", ignoreDuplicates: true },
    );
  } catch (e) {
    report.errors.push(`crudo smn-cap: ${String(e)}`);
  }
  if (official.alerts.length) {
    const { error } = await sb.from("official_alerts").upsert(
      official.alerts.map((a) => ({
        id: a.id, source: a.source, product: a.product, msg_type: a.msgType, refs: a.references, event: a.event, headline: a.headline,
        description: a.description, instruction: a.instruction, color: a.color, color_from: a.colorFrom, severity: a.severity,
        certainty: a.certainty, urgency: a.urgency, sent: a.sent, onset: a.onset, expires: a.expires, area_desc: a.areaDesc,
        phenomena: a.phenomena, web: a.web, polygons: a.polygons,
      })),
      { onConflict: "id" },
    );
    if (error) report.errors.push(`official_alerts: ${error.message}`);
  }
  report.officialAlerts = official.alerts.length;
  await recordRun(sb, "smn-cap", t1, official.status.ok, official.alerts.length, official.status.dataTime, official.status.error);

  // 2. Pluviómetros INA (últimos 3 días): observaciones con control de calidad básico.
  const t2 = new Date();
  try {
    const from = new Date(now.getTime() - 3 * 86_400_000);
    const rows = [];
    for (const s of INA_SERIES_CORDOBA) {
      const r = await fetchSource(observationsUrl(s.seriesId, from, now), { revalidate: false, maxBytes: 1_000_000 });
      for (const o of parseObservations(r.body)) {
        const flags: string[] = [];
        if (o.mm < 0) flags.push("negativo");
        if (o.mm > 250) flags.push("extremo_revisar"); // récord diario local ~200 mm: se marca, no se descarta.
        rows.push({ source_id: "ina-a5", station_id: String(s.seriesId), variable: "precip_24h_12z", value: o.mm, unit: "mm", observed_at: o.timeend, period_start: o.timestart, quality_flags: flags, raw_sha256: r.sha256 });
      }
    }
    if (rows.length) await sb.from("observations").upsert(rows, { onConflict: "source_id,station_id,variable,observed_at" });
    report.observations = rows.length;
    await recordRun(sb, "ina-a5", t2, true, rows.length, rows.map((r) => r.observed_at).sort().at(-1) ?? null);
  } catch (e) {
    report.errors.push(`ina-a5: ${String(e)}`);
    await recordRun(sb, "ina-a5", t2, false, 0, null, "Fallo de lectura");
  }

  // 3. Lugares vigentes y preferencias.
  const { data: places, error: pe } = await sb
    .from("places")
    .select("id, user_id, kind, label, lat, lon, watch_until")
    .or(`watch_until.is.null,watch_until.gt.${now.toISOString()}`)
    .limit(MAX_PLACES_PER_RUN);
  if (pe) {
    report.errors.push(`places: ${pe.message}`);
    report.finishedAt = new Date().toISOString();
    return report;
  }
  report.places = places.length;
  const userIds = [...new Set(places.map((p) => p.user_id))];
  const [{ data: prefs }, { data: subs }, { data: prevNotices }] = await Promise.all([
    sb.from("notification_prefs").select("*").in("user_id", userIds),
    sb.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth, failures").in("user_id", userIds),
    sb.from("notices").select("*").in("user_id", userIds).in("state", ["activo", "degradado"]),
  ]);

  // 4. Inferencia por lugar (el pronóstico se cachea por celda) y registro de predicciones por celda.
  const cellsDone = new Set<string>();
  for (const place of places) {
    const lat = Number(place.lat), lon = Number(place.lon);
    const risk = await assessPoint(lat, lon, now, official);
    const cell = snapPoint(lat, lon);
    const cellKey = `${cell.lat},${cell.lon}`;
    if (!cellsDone.has(cellKey)) {
      cellsDone.add(cellKey);
      const rows = risk.assessments.map((a: PhenomenonAssessment) => ({
        cell: cellKey, phenomenon: a.phenomenon, level: a.level, probability: a.probability, metric: a.metric,
        window_start: a.window?.from ?? null, window_end: a.window?.to ?? null, model_version: a.modelVersion,
        inputs: { ...risk.trace, sources: a.inputs }, shadow: env.OWN_ESTIMATES_MODE === "shadow",
      }));
      await sb.from("predictions").insert(rows);
      report.predictions += rows.length;
    }

    // 5. Decisión.
    const pref = prefs?.find((p) => p.user_id === place.user_id);
    const allowed = new Set<string>(pref?.phenomena ?? ["granizo", "lluvia_intensa", "anegamiento", "tormenta"]);
    const candidates = candidatesFor(place.id, place.label, risk.matched, risk.assessments).filter((c) => c.kind === "oficial" || allowed.has(c.phenomenon));
    const previous: Notice[] = (prevNotices ?? []).filter((n) => n.place_id === place.id).map(rowToNotice);
    const degradedKinds = risk.sources.filter((s) => s.id.startsWith("open-meteo") && !s.ok).length ? (["estimacion"] as const) : [];
    const decisions = decide(previous, candidates, {
      now,
      ownEstimatesMode: env.OWN_ESTIMATES_MODE,
      minLevel: (pref?.min_level ?? "atento") as Level,
      degradedKinds: [...degradedKinds, ...(official.status.ok ? [] : (["oficial"] as const))],
    });
    report.decisions += decisions.length;

    for (const d of decisions) {
      const { data: saved, error } = await sb.from("notices").upsert(noticeToRow(place.user_id, d.notice), { onConflict: "user_id,key" }).select("id").single();
      if (error || !saved) {
        report.errors.push(`notice: ${error?.message}`);
        continue;
      }
      if (d.change !== "sin_cambio") await sb.from("notice_events").insert({ notice_id: saved.id, user_id: place.user_id, change: d.change, level: d.notice.level, reason: d.reason });
      if (!d.notify) continue;

      // 6. Envío.
      const quiet = d.notice.kind !== "oficial" && inQuietHours(now, pref?.quiet_start ?? null, pref?.quiet_end ?? null);
      const userSubs = pref?.push_enabled ? (subs ?? []).filter((s) => s.user_id === place.user_id) : [];
      if (quiet || !userSubs.length) {
        await sb.from("deliveries").insert({ notice_id: saved.id, user_id: place.user_id, status: "omitido", error: quiet ? "horario silencioso" : "sin dispositivos o push desactivado" });
        continue;
      }
      for (const s of userSubs) {
        const r = await sendPush(s, { title: d.notice.title, body: d.notice.body, url: "/alertas", tag: d.notice.key, kind: d.notice.kind });
        await sb.from("deliveries").insert({ notice_id: saved.id, user_id: place.user_id, status: r.ok ? "enviado" : "fallido", error: r.error ?? null, latency_ms: Date.now() - now.getTime() });
        if (r.ok) {
          report.notified++;
          await sb.from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), failures: 0 }).eq("id", s.id);
        } else {
          report.failedDeliveries++;
          if (r.gone) await sb.from("push_subscriptions").delete().eq("id", s.id);
          else await sb.from("push_subscriptions").update({ failures: (s.failures ?? 0) + 1 }).eq("id", s.id);
        }
      }
    }
  }
  report.finishedAt = new Date().toISOString();
  log("info", "ingest.done", { ...report, errors: report.errors.length });
  return report;
}

type NoticeRow = Record<string, unknown>;
function rowToNotice(r: NoticeRow): Notice {
  return {
    key: r.key as string, placeId: r.place_id as string, phenomenon: r.phenomenon as Notice["phenomenon"], kind: r.kind as Notice["kind"],
    level: r.level as Level, title: r.title as string, body: r.body as string, source: r.source as string, validTo: (r.valid_to as string) ?? null,
    state: r.state as Notice["state"], firstSeen: r.first_seen as string, lastChanged: r.last_changed as string,
    lastNotified: (r.last_notified as string) ?? null, lastNotifiedLevel: (r.last_notified_level as Level) ?? null,
    lowerSince: (r.lower_since as string) ?? null, lowerLevel: (r.lower_level as Level) ?? null, shadow: Boolean(r.shadow),
  };
}
function noticeToRow(userId: string, n: Notice) {
  return {
    user_id: userId, place_id: n.placeId, key: n.key, phenomenon: n.phenomenon, kind: n.kind, level: n.level, state: n.state, title: n.title,
    body: n.body, source: n.source, valid_to: n.validTo, first_seen: n.firstSeen, last_changed: n.lastChanged, last_notified: n.lastNotified,
    last_notified_level: n.lastNotifiedLevel, lower_since: n.lowerSince, lower_level: n.lowerLevel, shadow: n.shadow,
  };
}
