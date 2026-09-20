import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/FormField";
import { SectionCard } from "@/components/SectionCard";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { demoSelf, useDemoTeam, type DemoMember } from "./demoTeamStore";

export function DemoTeam({ name }: { name: string }) {
  const { team, self, save, error: storageError } = useDemoTeam();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState<{ kind: "owner" | "remove" | "code"; member?: DemoMember } | null>(null);
  const me = self?.owner;
  const lastOwner = (member: DemoMember) => member.owner && team.members.filter(m => m.owner).length === 1;
  function invite(event: FormEvent) {
    event.preventDefault(); const next = email.trim().toLowerCase(); setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) { setError("Ingresá un email válido."); return; }
    if ([...team.members, ...team.requests, ...team.invites].some(m => m.email.toLowerCase() === next)) { setError("Ese email ya pertenece al equipo o tiene una invitación o solicitud pendiente."); return; }
    if (save({ ...team, invites: [...team.invites, { id: crypto.randomUUID(), email: next }] })) { setEmail(""); setNotice(`Invitación de ejemplo creada para ${next}. No se envió ningún email.`); }
  }
  async function copy(link: boolean) { try { await navigator.clipboard.writeText(link ? `${location.origin}/redesign/settings?join=${encodeURIComponent(team.code)}` : team.code); setNotice(link ? "Enlace de la demo copiado." : "Código copiado."); } catch { setError("No pudimos copiar. Podés seleccionar el código y copiarlo manualmente."); } }
  const confirm = () => {
    if (!action) return;
    if (action.kind === "code") { if (save({ ...team, code: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}` })) { setNotice("Código regenerado. El anterior dejó de funcionar en la demo."); setAction(null); } return; }
    const member = action.member; if (!member) return;
    if (lastOwner(member) && (action.kind === "remove" || member.owner)) { setError("Asigná otro owner antes de quitar al último owner o salir."); setAction(null); return; }
    const members = action.kind === "remove" ? team.members.filter(m => m.id !== member.id) : team.members.map(m => m.id === member.id ? { ...m, owner: !m.owner } : m);
    if (save({ ...team, members })) { setNotice(action.kind === "remove" ? "Miembro quitado de la demo." : "Rol actualizado en la demo."); setAction(null); }
  };
  return <SectionCard title="Equipo"><div className="rd-mapped-form">
    {me && <><form onSubmit={invite} className="rd-mapped-form"><FormField label="Email de la persona a invitar" htmlFor="invite-email"><Input id="invite-email" type="email" required value={email} onChange={e => { setEmail(e.target.value); setError(""); }} /></FormField><Button type="submit">Crear invitación de ejemplo</Button></form><div className="rd-value-actions"><code className="rd-team-code">{team.code}</code><Button variant="outline" onClick={() => void copy(false)}>Copiar código</Button><Button variant="outline" onClick={() => void copy(true)}>Copiar enlace</Button><Button variant="ghost" onClick={() => setAction({ kind: "code" })}>Regenerar código</Button></div></>}
    {team.requests.length > 0 && <><h3>Solicitudes de ingreso</h3>{team.requests.map(member => <div className="rd-team-row" key={member.id}><span><strong>{member.name}</strong><small>{member.email}</small></span>{me && <div className="rd-value-actions"><Button onClick={() => { if (save({ ...team, requests: team.requests.filter(r => r.id !== member.id), members: [...team.members, member] })) setNotice(`${member.name} ya forma parte del equipo.`); }}>Aprobar a {member.name}</Button><Button variant="outline" onClick={() => { if (save({ ...team, requests: team.requests.filter(r => r.id !== member.id) })) setNotice("Solicitud rechazada."); }}>Rechazar a {member.name}</Button></div>}</div>)}</>}
    <h3>Miembros</h3>{team.members.map(member => <div className="rd-team-row" key={member.id}><span><strong>{member.id === "self" ? `${name} (vos)` : member.name}</strong><small>{member.email} · {member.owner ? "Owner" : "Miembro"}</small></span><div className="rd-value-actions">{me && <Button variant="outline" onClick={() => setAction({ kind: "owner", member })}>{member.owner ? "Quitar owner a" : "Hacer owner a"} {member.id === "self" ? name : member.name}</Button>}{(me || member.id === "self") && <Button variant="ghost" onClick={() => setAction({ kind: "remove", member })}>{member.id === "self" ? "Salir de la startup" : `Quitar a ${member.name}`}</Button>}</div></div>)}
    {me && team.invites.length > 0 && <><h3>Invitaciones pendientes</h3>{team.invites.map(invite => <div className="rd-team-row" key={invite.id}><span>{invite.email}</span><Button variant="ghost" onClick={() => { if (save({ ...team, invites: team.invites.filter(i => i.id !== invite.id) })) setNotice("Invitación cancelada en la demo."); }}>Cancelar invitación a {invite.email}</Button></div>)}<details><summary>Probar aceptación de una invitación</summary><p className="rd-muted">Simulá la respuesta de la persona invitada.</p>{team.invites.map(invite => <Button key={invite.id} variant="outline" onClick={() => { if (save({ ...team, invites: team.invites.filter(i => i.id !== invite.id), members: [...team.members, { ...invite, name: invite.email.split("@")[0], owner: false }] })) setNotice("La persona invitada se incorporó a la demo."); }}>Simular aceptación de {invite.email}</Button>)}</details></>}
    {!me && <p className="rd-muted">Solo un owner puede invitar personas y administrar roles.</p>}
    {notice && <p role="status" className="rd-muted">{notice}</p>}{(error || storageError) && <p role="alert" className="rd-field-error">{error || storageError}</p>}
    <ConfirmationDialog open={!!action} onOpenChange={open => !open && setAction(null)} title={action?.kind === "code" ? "Regenerar código" : action?.kind === "owner" ? "Cambiar rol" : action?.member?.id === "self" ? "Salir de la startup" : "Quitar miembro"} description={action?.kind === "code" ? "Los enlaces con el código anterior dejarán de permitir solicitudes de ingreso." : action?.kind === "owner" ? `${action.member?.owner ? "Perderá" : "Obtendrá"} permisos para administrar la startup, sus miembros y conexiones.` : "Perderá acceso a esta startup en la demo. Podrá volver a solicitar unirse."} confirmLabel="Confirmar cambio" onConfirm={confirm} />
  </div></SectionCard>;
}

export function DemoMembershipGate() {
  const { team, save, error: storageError } = useDemoTeam();
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get("join") || "");
  const [error, setError] = useState("");
  const pending = team.requests.some(r => r.id === "self");
  return <div className="rd-root rd-membership-gate"><SectionCard title="Unirte a una startup"><div className="rd-mapped-form"><p>Saliste de la startup de ejemplo. Ingresá el código para solicitar acceso.</p><form className="rd-mapped-form" onSubmit={e => { e.preventDefault(); if (code.trim() !== team.code) { setError("El código no coincide o dejó de estar vigente."); return; } if (save({ ...team, requests: [...team.requests.filter(r => r.id !== "self"), { ...demoSelf, owner: false }] })) setError(""); }}><FormField label="Código de la startup" htmlFor="join-code"><Input id="join-code" required value={code} disabled={pending} onChange={e => setCode(e.target.value)} /></FormField><Button disabled={pending}>{pending ? "Solicitud pendiente de aprobación" : "Solicitar ingreso"}</Button></form>{pending && <Button variant="outline" onClick={() => save({ ...team, requests: team.requests.filter(r => r.id !== "self") })}>Cancelar solicitud de ingreso</Button>}<details><summary>Controles de la demo</summary>{pending && <Button onClick={() => save({ ...team, requests: team.requests.filter(r => r.id !== "self"), members: [...team.members, { ...demoSelf, owner: false }] })}>Simular aprobación del ingreso</Button>}<Button variant="outline" onClick={() => save({ ...team, requests: team.requests.filter(r => r.id !== "self"), members: [...team.members.filter(m => m.id !== "self"), demoSelf] })}>Restablecer mi acceso como owner</Button></details>{(error || storageError) && <p role="alert" className="rd-field-error">{error || storageError}</p>}</div></SectionCard></div>;
}
