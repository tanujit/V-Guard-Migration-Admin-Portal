import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { StatusBadge } from "@/components/ui/primitives";
import { Checkbox, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { GIFT_TYPE } from "@/config/giftsCatalogue";
import { SEED_SKUS } from "@/data/mock/masterSeed";
import { saveMapping, savePartner, setMappingStatus } from "@/features/gifts/store";
import type { FulfilmentPartner, GiftType, SkuMapping } from "@/types/gifts";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { DecisionRef, TypeTag, dt, giftLink, giftName, partnerName, useGiftsView, useParam, useRun, type GiftsView } from "./shared";

type PartnerForm = Omit<FulfilmentPartner, "integration" | "updatedAt" | "updatedBy">;

export function PartnersPage() {
  const v = useGiftsView();
  const [tab, setTab] = useParam("tab", "directory");
  const [edit, setEdit] = useState<PartnerForm | null>(null);
  const [map, setMap] = useState<Omit<SkuMapping, "updatedAt" | "updatedBy"> | null>(null);
  const { result, run } = useRun();
  const p = v.gs.partners;
  return (
    <>
      <SectionTitle title="Fulfilment partners" description="Voucher providers, physical fulfilment partners and the V-Guard.com arrangement, with partner / SKU mapping against the Phase 4 Product & SKU master" actions={
        tab === "mapping" ? v.can("fulfilment-partners:manage") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setMap({ id: "", giftId: v.gs.items[0].id, productSkuId: null, partnerId: v.gs.partners[0].id, partnerSku: "", partnerProductRef: "", availabilityMapping: "partner_stock", status: "active" })}><Plus size={14} aria-hidden="true" />New mapping</button>
        : v.can("fulfilment-partners:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit({ id: "", code: "", name: "", type: "physical", supportedTypes: ["physical"], description: "", contactRef: "", integrationRef: "", status: "active" })}><Plus size={14} aria-hidden="true" />New partner</button>
      } />
      <Notice tone="warn">Every partner here is a mock adapter: no voucher provider, courier or V-Guard.com integration is connected. Credentials, API secrets and tokens are never stored in the portal. The tracking partner is open (<DecisionRef id="OP-GIFT1" />).</Notice>
      <PolicyMessages result={result} />
      <Tabs label="Partner sections" value={tab} onChange={setTab} tabs={[{ id: "directory", label: "Partner directory", count: p.length }, { id: "mapping", label: "Partner / SKU mapping", count: v.gs.mappings.length }, { id: "integration", label: "Integration monitoring" }]} />
      {tab === "directory" && (
        <Panel title="Partner directory" padded={false}>
          <DataTable rows={p} rowKey={(x) => x.id} caption="Fulfilment partners" exportName={v.can("fulfilment-partners:export") ? "fulfilment-partners" : undefined} onRowClick={(x) => v.can("fulfilment-partners:edit") && setEdit({ id: x.id, code: x.code, name: x.name, type: x.type, supportedTypes: x.supportedTypes, description: x.description, contactRef: x.contactRef, integrationRef: x.integrationRef, status: x.status })} columns={[
            { key: "id", header: "Partner ID", value: (x) => x.id },
            { key: "n", header: "Partner name", value: (x) => x.name },
            { key: "t", header: "Partner type", value: (x) => GIFT_TYPE[x.type].label, render: (x) => <TypeTag type={x.type} /> },
            { key: "st", header: "Supported gift types", value: (x) => x.supportedTypes.map((t) => GIFT_TYPE[t].short).join(", ") },
            { key: "m", header: "Mapped SKUs", value: (x) => v.gs.mappings.filter((m) => m.partnerId === x.id && m.status === "active").length, align: "right" },
            { key: "i", header: "Integration status", value: (x) => x.integration.connection, render: (x) => <StatusBadge tone={x.integration.sync === "failed" ? "negative" : x.integration.connection === "mock" ? "info" : "neutral"}>{x.integration.connection === "mock" ? "Mock adapter" : "Not connected"}{x.integration.sync === "failed" ? " · failing" : ""}</StatusBadge> },
            { key: "s", header: "Status", value: (x) => x.status, render: (x) => <StatusBadge tone={x.status === "active" ? "positive" : "neutral"}>{x.status}</StatusBadge> },
            { key: "ls", header: "Last sync", value: (x) => x.integration.lastSuccess ?? "", render: (x) => <span className="small">{dt(x.integration.lastSuccess)}</span> },
            { key: "u", header: "Last modified", value: (x) => x.updatedAt, render: (x) => <span className="small">{dt(x.updatedAt)}</span> },
          ]} />
        </Panel>
      )}
      {tab === "mapping" && <Mappings v={v} onEdit={setMap} />}
      {tab === "integration" && (
        <Panel title="Integration monitoring" subtitle="Mock integration data: not a live connection" padded={false}>
          <DataTable rows={p} rowKey={(x) => x.id} caption="Partner integration" columns={[
            { key: "n", header: "Partner", value: (x) => x.name },
            { key: "c", header: "Connection status", value: (x) => x.integration.connection, render: (x) => (x.integration.connection === "mock" ? "Mock adapter (not connected)" : "Not connected") },
            { key: "ok", header: "Last successful request", value: (x) => x.integration.lastSuccess ?? "", render: (x) => dt(x.integration.lastSuccess) },
            { key: "f", header: "Last failed request", value: (x) => x.integration.lastFailure ?? "", render: (x) => dt(x.integration.lastFailure) },
            { key: "s", header: "Sync status", value: (x) => x.integration.sync, render: (x) => <StatusBadge tone={x.integration.sync === "ok" ? "positive" : x.integration.sync === "failed" ? "negative" : "neutral"}>{x.integration.sync}</StatusBadge> },
            { key: "e", header: "Error summary", value: (x) => x.integration.errorSummary ?? "", render: (x) => <span className="small">{x.integration.errorSummary ?? "—"}</span> },
            { key: "r", header: "Fulfilment reference", value: (x) => x.integration.lastFulfilmentRef ?? "", render: (x) => <span className="mono small">{x.integration.lastFulfilmentRef ?? "—"}</span> },
            { key: "ir", header: "Integration reference", value: (x) => x.integrationRef, render: (x) => <span className="mono small">{x.integrationRef}</span> },
          ]} />
        </Panel>
      )}
      {edit && <PartnerDrawer v={v} p={edit} onClose={() => setEdit(null)} />}
      {map && <MappingDrawer v={v} m={map} onClose={() => setMap(null)} run={run} />}
    </>
  );
}

function Mappings({ v, onEdit }: { v: GiftsView; onEdit: (m: Omit<SkuMapping, "updatedAt" | "updatedBy">) => void }) {
  const { result, run } = useRun();
  return (
    <Panel title="Partner / SKU mapping" padded={false}>
      <PolicyMessages result={result} />
      <DataTable rows={v.gs.mappings} rowKey={(x) => x.id} caption="Partner SKU mappings" exportName={v.can("fulfilment-partners:export") ? "partner-sku-mapping" : undefined} onRowClick={(x) => v.can("fulfilment-partners:manage") && onEdit(x)} columns={[
        { key: "id", header: "Mapping", value: (x) => x.id },
        { key: "g", header: "Internal gift ID", value: (x) => x.giftId, render: (x) => <span>{giftLink(x.giftId)} <span className="small">{giftName(v.gs, x.giftId)}</span></span> },
        { key: "sku", header: "Product / SKU reference", value: (x) => x.productSkuId ?? "", render: (x) => (x.productSkuId ? <span className="mono small">{SEED_SKUS.find((s) => s.id === x.productSkuId)?.code ?? x.productSkuId}</span> : <span className="muted small">—</span>) },
        { key: "p", header: "Partner", value: (x) => partnerName(v.gs, x.partnerId) },
        { key: "ps", header: "Partner SKU", value: (x) => x.partnerSku, render: (x) => <span className="mono small">{x.partnerSku}</span> },
        { key: "pr", header: "Partner product reference", value: (x) => x.partnerProductRef, render: (x) => <span className="mono small">{x.partnerProductRef}</span> },
        { key: "am", header: "Availability mapping", value: (x) => x.availabilityMapping.replace(/_/g, " ") },
        { key: "s", header: "Mapping status", value: (x) => x.status, render: (x) => <StatusBadge tone={x.status === "active" ? "positive" : "neutral"}>{x.status}</StatusBadge> },
        { key: "x", header: "", value: () => "", render: (x) => (v.can("fulfilment-partners:manage") ? <button type="button" className="btn btn--tertiary btn--xs" onClick={(e) => { e.stopPropagation(); run(setMappingStatus(v.uid, x.id, x.status === "active" ? "inactive" : "active", "Changed from the mapping list"), "Mapping updated"); }}>{x.status === "active" ? "Deactivate" : "Activate"}</button> : null) },
      ]} />
    </Panel>
  );
}

function PartnerDrawer({ v, p, onClose }: { v: GiftsView; p: PartnerForm; onClose: () => void }) {
  const [f, setF] = useState(p);
  const { result, run } = useRun();
  const set = (x: Partial<PartnerForm>) => setF({ ...f, ...x });
  const toggle = (t: GiftType, on: boolean) => set({ supportedTypes: on ? [...new Set([...f.supportedTypes, t])] : f.supportedTypes.filter((x) => x !== t) });
  return (
    <Drawer open onClose={onClose} title={f.id ? `Edit ${f.id}` : "New fulfilment partner"} footer={<div className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button><button type="button" className="btn btn--primary btn--sm" onClick={() => { if (run(savePartner(v.uid, f), "Partner saved").ok) onClose(); }}><Save size={14} aria-hidden="true" />Save</button></div>}>
      <TextField label="Partner name" value={f.name} onChange={(x) => set({ name: x })} required />
      <TextField label="Partner code" value={f.code} onChange={(x) => set({ code: x })} required />
      <SelectInput label="Partner type" value={f.type} onChange={(x) => set({ type: x as GiftType })} options={Object.entries(GIFT_TYPE).map(([k, x]) => ({ value: k, label: x.label }))} />
      <p className="field__label">Supported fulfilment types</p>
      {(Object.keys(GIFT_TYPE) as GiftType[]).map((t) => <Checkbox key={t} label={GIFT_TYPE[t].label} checked={f.supportedTypes.includes(t)} onChange={(on) => toggle(t, on)} />)}
      <TextArea label="Description" value={f.description} onChange={(x) => set({ description: x })} />
      <TextField label="Contact reference" value={f.contactRef} onChange={(x) => set({ contactRef: x })} />
      <TextField label="Integration reference" value={f.integrationRef} onChange={(x) => set({ integrationRef: x })} hint="Reference only. Never enter credentials, API secrets or tokens" />
      <SelectInput label="Status" value={f.status} onChange={(x) => set({ status: x as "active" })} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
      <PolicyMessages result={result} />
    </Drawer>
  );
}

function MappingDrawer({ v, m, onClose, run }: { v: GiftsView; m: Omit<SkuMapping, "updatedAt" | "updatedBy">; onClose: () => void; run: ReturnType<typeof useRun>["run"] }) {
  const [f, setF] = useState(m);
  const local = useRun();
  const set = (x: Partial<typeof f>) => setF({ ...f, ...x });
  return (
    <Drawer open onClose={onClose} title={f.id ? `Edit ${f.id}` : "New partner / SKU mapping"} subtitle="Validated for duplicates, missing references, inactive products and incompatible gift types" footer={<div className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button><button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = local.run(saveMapping(v.uid, f), "Mapping saved"); if (r.ok) { run(r, "Mapping saved"); onClose(); } }}><Save size={14} aria-hidden="true" />Save</button></div>}>
      <SelectInput label="Internal gift ID" value={f.giftId} onChange={(x) => set({ giftId: x })} options={v.gs.items.map((i) => ({ value: i.id, label: `${i.id} · ${i.name}` }))} required />
      <SelectInput label="Internal Product / SKU reference" value={f.productSkuId ?? ""} onChange={(x) => set({ productSkuId: x || null })} options={[{ value: "", label: "None" }, ...SEED_SKUS.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}${s.status !== "active" ? ` (${s.status})` : ""}` }))]} />
      <SelectInput label="Partner" value={f.partnerId} onChange={(x) => set({ partnerId: x })} options={v.gs.partners.map((p) => ({ value: p.id, label: `${p.name}${p.status === "inactive" ? " (inactive)" : ""}` }))} required />
      <TextField label="Partner SKU" value={f.partnerSku} onChange={(x) => set({ partnerSku: x })} required />
      <TextField label="Partner product reference" value={f.partnerProductRef} onChange={(x) => set({ partnerProductRef: x })} />
      <SelectInput label="Availability mapping" value={f.availabilityMapping} onChange={(x) => set({ availabilityMapping: x as SkuMapping["availabilityMapping"] })} options={[{ value: "partner_stock", label: "Partner stock feed" }, { value: "always_available_on_partner", label: "Issued on demand by the partner" }, { value: "manual", label: "Operator-maintained" }]} />
      <PolicyMessages result={local.result} />
    </Drawer>
  );
}
