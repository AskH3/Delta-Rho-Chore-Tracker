import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";

/* ─────────────────────────────────────────────
   HOUSE DUTY BOARD — hosted edition
   Accounts via Supabase Auth; permissions enforced
   by database row-level security (see schema.sql).
   ───────────────────────────────────────────── */

const C = {
  cardinal: "#9D2235",
  cardinalDark: "#7A1A29",
  gold: "#C99700",
  goldSoft: "#F3E3B3",
  paper: "#F7F5F0",
  ink: "#1C1B1A",
  sub: "#6B665D",
  line: "#DDD8CE",
  white: "#FFFFFF",
  green: "#2E6B3F",
  red: "#A33131",
};
const DISPLAY =
  "Haettenschweiler, 'Arial Narrow', 'Franklin Gothic Medium', Impact, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const jsDayToIdx = (d) => (d + 6) % 7;

const WEEK_ANCHOR = new Date(2026, 0, 5, 0, 0, 0).getTime();
const currentWeek = () =>
  Math.floor((Date.now() - WEEK_ANCHOR) / (7 * 24 * 3600 * 1000));
const weekStart = (w) => new Date(WEEK_ANCHOR + w * 7 * 24 * 3600 * 1000);
function weekLabel(w) {
  const s = weekStart(w);
  const e = new Date(s.getTime() + 6 * 24 * 3600 * 1000);
  const f = (d) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${f(s)} – ${f(e)}`;
}

function compressImage(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const s = maxDim / Math.max(width, height);
          width = Math.round(width * s);
          height = Math.round(height * s);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error("Compression failed")),
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

const photoUrl = (path) =>
  supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;

/* ── UI atoms ── */
const btnBase = {
  border: "none",
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
  fontWeight: 700,
  borderRadius: 6,
  fontSize: 13,
};
function Btn({ children, onClick, kind = "solid", small, disabled, style }) {
  const kinds = {
    solid: { background: C.cardinal, color: C.white },
    gold: { background: C.gold, color: C.ink },
    ghost: {
      background: "transparent",
      color: C.cardinal,
      border: `1.5px solid ${C.cardinal}`,
    },
    danger: {
      background: "transparent",
      color: C.red,
      border: `1.5px solid ${C.red}`,
    },
    plain: { background: "#EFEBE2", color: C.ink },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...btnBase,
        ...kinds[kind],
        padding: small ? "5px 10px" : "9px 16px",
        opacity: disabled ? 0.45 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 10px",
  border: `1px solid ${C.line}`,
  borderRadius: 6,
  fontSize: 14,
  background: C.white,
};
function EmptyNote({ text }) {
  return (
    <div
      style={{
        border: `1.5px dashed ${C.line}`,
        borderRadius: 8,
        padding: "18px 14px",
        color: C.sub,
        fontSize: 13,
        textAlign: "center",
        marginBottom: 12,
      }}
    >
      {text}
    </div>
  );
}
function LockNote({ text }) {
  return (
    <div
      style={{
        background: C.goldSoft,
        border: `1px solid ${C.gold}`,
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: 12,
        color: C.ink,
        marginBottom: 12,
      }}
    >
      🔒 {text}
    </div>
  );
}
function DayChips({ selected, onToggle, readOnly }) {
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {DAYS.map((d, i) => {
        const on = selected.includes(i);
        return (
          <button
            key={d}
            onClick={readOnly ? undefined : () => onToggle(i)}
            style={{
              ...btnBase,
              fontFamily: MONO,
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 4,
              cursor: readOnly ? "default" : "pointer",
              background: on ? C.ink : "transparent",
              color: on ? C.goldSoft : C.sub,
              border: `1px solid ${on ? C.ink : C.line}`,
            }}
          >
            {d.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
function Modal({ children, onClose, maxWidth = 420 }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,27,26,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.paper,
          borderRadius: 10,
          width: "100%",
          maxWidth,
          padding: 18,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}
function ModalTitle({ children }) {
  return (
    <div
      style={{
        fontFamily: DISPLAY,
        fontSize: 24,
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────
   AUTH SCREEN
   ───────────────────────────────────────────── */
function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setErr("");
    setMsg("");
    if (!email.trim() || !pw) return setErr("Email and password are required.");
    if (mode === "signup" && !name.trim())
      return setErr("Enter your name — it's how your chores get credited.");
    setBusy(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password: pw,
        options: { data: { name: name.trim() } },
      });
      if (error) setErr(error.message);
      else
        setMsg(
          "Account created. If nothing happens, check your email for a confirmation link, then sign in."
        );
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pw,
      });
      if (error) setErr(error.message);
    }
    setBusy(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.paper,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div
          style={{
            background: C.cardinal,
            borderBottom: `4px solid ${C.gold}`,
            borderRadius: "10px 10px 0 0",
            padding: "18px 20px",
          }}
        >
          <div
            style={{
              fontFamily: DISPLAY,
              color: C.white,
              fontSize: 28,
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            House Duty Board
          </div>
          <div style={{ color: C.goldSoft, fontFamily: MONO, fontSize: 11 }}>
            WK {String(currentWeek()).padStart(2, "0")} ·{" "}
            {weekLabel(currentWeek())}
          </div>
        </div>
        <div
          style={{
            background: C.white,
            border: `1px solid ${C.line}`,
            borderTop: "none",
            borderRadius: "0 0 10px 10px",
            padding: 20,
          }}
        >
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[
              ["signin", "Sign in"],
              ["signup", "Create account"],
            ].map(([k, t]) => (
              <button
                key={k}
                onClick={() => {
                  setMode(k);
                  setErr("");
                  setMsg("");
                }}
                style={{
                  ...btnBase,
                  flex: 1,
                  padding: "8px 0",
                  background: mode === k ? C.ink : "transparent",
                  color: mode === k ? C.goldSoft : C.sub,
                  border: `1.5px solid ${mode === k ? C.ink : C.line}`,
                }}
              >
                {t}
              </button>
            ))}
          </div>
          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name (e.g., John Smith)"
              style={{ ...inputStyle, marginBottom: 8 }}
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            autoComplete="email"
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="Password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            style={{ ...inputStyle, marginBottom: 12 }}
          />
          {err && (
            <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>
              {err}
            </div>
          )}
          {msg && (
            <div style={{ color: C.green, fontSize: 13, marginBottom: 10 }}>
              {msg}
            </div>
          )}
          <Btn kind="solid" onClick={go} disabled={busy} style={{ width: "100%" }}>
            {busy
              ? "Working…"
              : mode === "signup"
              ? "Create account"
              : "Sign in"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SECTION BOARD
   ───────────────────────────────────────────── */
function SectionBoard({ section, label, profile, onPosted }) {
  const [chores, setChores] = useState(null);
  const [roster, setRoster] = useState(null);
  const [view, setView] = useState("week");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [newMember, setNewMember] = useState("");
  const isAdmin = profile.is_admin;
  const week = currentWeek();

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      supabase
        .from("chores")
        .select("*")
        .eq("section", section)
        .order("sort")
        .order("created_at"),
      supabase
        .from("roster")
        .select("*")
        .eq("section", section)
        .order("sort")
        .order("created_at"),
    ]);
    if (c.error || r.error)
      setErr((c.error || r.error).message);
    setChores(c.data || []);
    setRoster(r.data || []);
  }, [section]);

  useEffect(() => {
    load();
  }, [load]);

  if (!chores || !roster)
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.sub }}>
        Loading {label}…
      </div>
    );

  const assigneeFor = (choreIdx) =>
    roster.length ? roster[(choreIdx + week) % roster.length].name : null;

  const saveChore = async () => {
    const name = editing.name.trim();
    if (!name) return;
    if (!editing.days.length) return setErr("Pick at least one day.");
    setErr("");
    const res = editing.id
      ? await supabase
          .from("chores")
          .update({ name, days: editing.days })
          .eq("id", editing.id)
      : await supabase
          .from("chores")
          .insert({ section, name, days: editing.days, sort: chores.length });
    if (res.error) return setErr(res.error.message);
    setEditing(null);
    load();
  };
  const removeChore = async (id) => {
    const { error } = await supabase.from("chores").delete().eq("id", id);
    if (error) setErr(error.message);
    load();
  };
  const addMember = async () => {
    const n = newMember.trim();
    if (!n) return;
    const { error } = await supabase
      .from("roster")
      .insert({ section, name: n, sort: roster.length });
    if (error) setErr(error.message);
    setNewMember("");
    load();
  };
  const removeMember = async (id) => {
    const { error } = await supabase.from("roster").delete().eq("id", id);
    if (error) setErr(error.message);
    load();
  };

  const todayIdx = jsDayToIdx(new Date().getDay());
  const byDay = DAYS.map((_, di) =>
    chores.map((c, i) => ({ ...c, idx: i })).filter((c) => c.days.includes(di))
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <h2
          style={{
            fontFamily: DISPLAY,
            fontSize: 34,
            letterSpacing: 1,
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          {label}
        </h2>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 12,
            background: C.ink,
            color: C.goldSoft,
            padding: "4px 10px",
            borderRadius: 4,
          }}
        >
          ROTATION WEEK {String(week).padStart(2, "0")}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[
          ["week", "This Week"],
          ["bank", "Chore Bank"],
          ["roster", "Roster"],
        ].map(([k, t]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            style={{
              ...btnBase,
              padding: "7px 14px",
              background: view === k ? C.cardinal : "transparent",
              color: view === k ? C.white : C.sub,
              border: `1.5px solid ${view === k ? C.cardinal : C.line}`,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {err && (
        <div
          style={{
            background: "#FBEAEA",
            border: `1px solid ${C.red}`,
            color: C.red,
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {err}
        </div>
      )}

      {view === "week" && (
        <div>
          {chores.length === 0 && (
            <EmptyNote text="No chores yet. Add some in the Chore Bank." />
          )}
          {chores.length > 0 && roster.length === 0 && (
            <EmptyNote text="Add people to the Roster so chores can rotate." />
          )}
          {DAYS.map((day, di) =>
            byDay[di].length ? (
              <div key={day} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: DISPLAY,
                      fontSize: 20,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      color: di === todayIdx ? C.cardinal : C.ink,
                    }}
                  >
                    {day}
                  </span>
                  {di === todayIdx && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        background: C.gold,
                        color: C.ink,
                        padding: "2px 6px",
                        borderRadius: 3,
                        fontWeight: 700,
                      }}
                    >
                      TODAY
                    </span>
                  )}
                </div>
                {byDay[di].map((c) => (
                  <div
                    key={c.id + di}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      background: C.white,
                      border: `1px solid ${C.line}`,
                      borderLeft: `4px solid ${C.cardinal}`,
                      borderRadius: 6,
                      padding: "10px 12px",
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: 12, color: C.sub }}>
                        {assigneeFor(c.idx) ? (
                          <>
                            <span style={{ color: C.gold, fontWeight: 700 }}>
                              ➜
                            </span>{" "}
                            {assigneeFor(c.idx)}
                          </>
                        ) : (
                          "Unassigned — roster is empty"
                        )}
                      </div>
                    </div>
                    <Btn
                      small
                      kind="gold"
                      onClick={() => setCompleting({ chore: c, day })}
                    >
                      Mark done
                    </Btn>
                  </div>
                ))}
              </div>
            ) : null
          )}
        </div>
      )}

      {view === "bank" && (
        <div>
          {!isAdmin && (
            <LockNote text="Only the admin can add, edit, or remove chores." />
          )}
          {isAdmin && !editing && (
            <Btn
              kind="solid"
              onClick={() => setEditing({ name: "", days: [] })}
              style={{ marginBottom: 14 }}
            >
              + Add chore
            </Btn>
          )}
          {editing && (
            <div
              style={{
                background: C.white,
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                {editing.id ? "Edit chore" : "New chore"}
              </div>
              <input
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                placeholder="Chore name (e.g., Trash run — all floors)"
                style={{ ...inputStyle, marginBottom: 10 }}
              />
              <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>
                Days this chore must be completed:
              </div>
              <DayChips
                selected={editing.days}
                onToggle={(i) =>
                  setEditing({
                    ...editing,
                    days: editing.days.includes(i)
                      ? editing.days.filter((d) => d !== i)
                      : [...editing.days, i].sort(),
                  })
                }
              />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Btn kind="solid" onClick={saveChore}>
                  {editing.id ? "Save changes" : "Add to bank"}
                </Btn>
                <Btn kind="plain" onClick={() => setEditing(null)}>
                  Cancel
                </Btn>
              </div>
            </div>
          )}
          {chores.length === 0 && !editing && (
            <EmptyNote text="The chore bank is empty." />
          )}
          {chores.map((c, i) => (
            <div
              key={c.id}
              style={{
                background: C.white,
                border: `1px solid ${C.line}`,
                borderRadius: 6,
                padding: "10px 12px",
                marginBottom: 6,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div style={{ marginTop: 5 }}>
                  <DayChips selected={c.days} readOnly />
                </div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 5 }}>
                  This week: {assigneeFor(i) || "unassigned (empty roster)"}
                </div>
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn
                    small
                    kind="ghost"
                    onClick={() =>
                      setEditing({ id: c.id, name: c.name, days: [...c.days] })
                    }
                  >
                    Edit
                  </Btn>
                  <Btn small kind="danger" onClick={() => removeChore(c.id)}>
                    Remove
                  </Btn>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {view === "roster" && (
        <div>
          {!isAdmin && <LockNote text="Only the admin can change the roster." />}
          {isAdmin && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMember()}
                placeholder="Name"
                style={{ ...inputStyle, flex: 1 }}
              />
              <Btn kind="solid" onClick={addMember}>
                Add
              </Btn>
            </div>
          )}
          {roster.length === 0 && (
            <EmptyNote text="Nobody on this roster yet. Chores rotate through this list each week, top to bottom." />
          )}
          {roster.map((m, i) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: C.white,
                border: `1px solid ${C.line}`,
                borderRadius: 6,
                padding: "9px 12px",
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>
                <span
                  style={{
                    fontFamily: MONO,
                    color: C.sub,
                    fontSize: 11,
                    marginRight: 8,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {m.name}
              </span>
              {isAdmin && (
                <Btn small kind="danger" onClick={() => removeMember(m.id)}>
                  Remove
                </Btn>
              )}
            </div>
          ))}
          <p style={{ fontSize: 12, color: C.sub, marginTop: 10 }}>
            Rotation shifts by one name every Monday automatically.
          </p>
        </div>
      )}

      {completing && (
        <CompletionModal
          section={section}
          sectionLabel={label}
          data={completing}
          profile={profile}
          week={week}
          onClose={() => setCompleting(null)}
          onPosted={() => {
            setCompleting(null);
            onPosted();
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   COMPLETION MODAL — photo required
   ───────────────────────────────────────────── */
function CompletionModal({
  section,
  sectionLabel,
  data,
  profile,
  week,
  onClose,
  onPosted,
  existing,
}) {
  const [photoBlob, setPhotoBlob] = useState(null);
  const [preview, setPreview] = useState(existing ? photoUrl(existing.photo_path) : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setErr("");
    try {
      setBusy(true);
      const blob = await compressImage(f);
      setPhotoBlob(blob);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setErr("Couldn't process that image. Try a different photo.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!preview) return setErr("A photo of the finished chore is required.");
    setBusy(true);
    setErr("");
    try {
      let path = existing ? existing.photo_path : null;
      if (photoBlob) {
        path = `${section}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage
          .from("photos")
          .upload(path, photoBlob, { contentType: "image/jpeg" });
        if (error) throw error;
      }
      if (existing) {
        const { error } = await supabase
          .from("completions")
          .update({ photo_path: path })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("completions").insert({
          section,
          chore_id: data.chore.id,
          chore_name: data.chore.name,
          day: data.day,
          week,
          member: profile.name,
          user_id: profile.id,
          photo_path: path,
        });
        if (error) throw error;
      }
      onPosted();
    } catch (e) {
      setErr(e.message || "Upload failed. Try again.");
    }
    setBusy(false);
  };

  return (
    <Modal onClose={onClose}>
      <ModalTitle>{existing ? "Edit submission" : "Proof of work"}</ModalTitle>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>
        {existing ? existing.chore_name : data.chore.name} · {sectionLabel}
        {existing ? "" : ` · ${data.day}`} — posting as{" "}
        <b style={{ color: C.ink }}>{profile.name}</b>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={pick}
        style={{ display: "none" }}
      />
      {!preview ? (
        <Btn
          kind="ghost"
          onClick={() => fileRef.current && fileRef.current.click()}
          disabled={busy}
          style={{ width: "100%", padding: "14px 0" }}
        >
          {busy ? "Processing…" : "📷 Add required photo"}
        </Btn>
      ) : (
        <div>
          <img
            src={preview}
            alt="Completed chore"
            style={{
              width: "100%",
              borderRadius: 8,
              border: `1px solid ${C.line}`,
              display: "block",
            }}
          />
          <Btn
            small
            kind="plain"
            onClick={() => fileRef.current && fileRef.current.click()}
            style={{ marginTop: 8 }}
          >
            Retake
          </Btn>
        </div>
      )}
      {err && (
        <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Btn kind="gold" onClick={submit} disabled={busy || !preview}>
          {busy ? "Saving…" : existing ? "Save changes" : "Post to board"}
        </Btn>
        <Btn kind="plain" onClick={onClose}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   FEED — week navigation, votes, reports
   ───────────────────────────────────────────── */
function Feed({ profile, refreshFlag }) {
  const [rows, setRows] = useState(null); // completions for viewWeek
  const [votes, setVotes] = useState({}); // completion_id -> {up, down, mine}
  const [filter, setFilter] = useState("all");
  const [viewWeek, setViewWeek] = useState(currentWeek());
  const [earliestWeek, setEarliestWeek] = useState(currentWeek());
  const [showReport, setShowReport] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const thisWeek = currentWeek();
  const isAdmin = profile.is_admin;

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: comps, error }, { data: oldest }] = await Promise.all([
      supabase
        .from("completions")
        .select("*")
        .eq("week", viewWeek)
        .order("created_at", { ascending: false }),
      supabase
        .from("completions")
        .select("week")
        .order("week", { ascending: true })
        .limit(1),
    ]);
    if (!error) {
      setRows(comps || []);
      if (oldest && oldest.length) setEarliestWeek(oldest[0].week);
      const ids = (comps || []).map((c) => c.id);
      if (ids.length) {
        const { data: vs } = await supabase
          .from("votes")
          .select("*")
          .in("completion_id", ids);
        const agg = {};
        (vs || []).forEach((v) => {
          const a = (agg[v.completion_id] = agg[v.completion_id] || {
            up: 0,
            down: 0,
            mine: 0,
          });
          if (v.value === 1) a.up++;
          else a.down++;
          if (v.user_id === profile.id) a.mine = v.value;
        });
        setVotes(agg);
      } else setVotes({});
    }
    setLoading(false);
  }, [viewWeek, profile.id]);

  useEffect(() => {
    load();
  }, [load, refreshFlag]);

  const vote = async (comp, value) => {
    const cur = votes[comp.id] || { up: 0, down: 0, mine: 0 };
    if (cur.mine === value) {
      await supabase
        .from("votes")
        .delete()
        .eq("completion_id", comp.id)
        .eq("user_id", profile.id);
    } else {
      await supabase
        .from("votes")
        .upsert({ completion_id: comp.id, user_id: profile.id, value });
    }
    load();
  };

  const remove = async (comp) => {
    if (!window.confirm("Delete this submission?")) return;
    await supabase.storage.from("photos").remove([comp.photo_path]);
    await supabase.from("completions").delete().eq("id", comp.id);
    load();
  };

  const canManage = (c) => isAdmin || c.user_id === profile.id;
  const shown = (rows || []).filter(
    (r) => filter === "all" || r.section === filter
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <h2
          style={{
            fontFamily: DISPLAY,
            fontSize: 34,
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Work Log
        </h2>
        <div style={{ display: "flex", gap: 6 }}>
          {isAdmin && (
            <Btn small kind="ghost" onClick={() => setShowReport(true)}>
              ⤓ Report
            </Btn>
          )}
          <Btn small kind="plain" onClick={load}>
            ↻ Refresh
          </Btn>
        </div>
      </div>

      {/* week navigator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: C.ink,
          color: C.goldSoft,
          borderRadius: 6,
          padding: "6px 8px",
          marginBottom: 12,
        }}
      >
        <button
          onClick={() => setViewWeek((w) => w - 1)}
          disabled={viewWeek <= earliestWeek}
          aria-label="Previous week"
          style={{
            ...btnBase,
            background: "transparent",
            color: C.goldSoft,
            fontSize: 16,
            padding: "2px 8px",
            opacity: viewWeek <= earliestWeek ? 0.3 : 1,
          }}
        >
          ‹
        </button>
        <div style={{ flex: 1, textAlign: "center", lineHeight: 1.2 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>
            WEEK {String(viewWeek).padStart(2, "0")}
            {viewWeek === thisWeek ? " · THIS WEEK" : ""}
          </div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            {weekLabel(viewWeek)} · {shown.length} post
            {shown.length === 1 ? "" : "s"}
          </div>
        </div>
        {viewWeek !== thisWeek && (
          <button
            onClick={() => setViewWeek(thisWeek)}
            style={{
              ...btnBase,
              background: C.gold,
              color: C.ink,
              fontSize: 10,
              padding: "3px 7px",
            }}
          >
            Today
          </button>
        )}
        <button
          onClick={() => setViewWeek((w) => w + 1)}
          disabled={viewWeek >= thisWeek}
          aria-label="Next week"
          style={{
            ...btnBase,
            background: "transparent",
            color: C.goldSoft,
            fontSize: 16,
            padding: "2px 8px",
            opacity: viewWeek >= thisWeek ? 0.3 : 1,
          }}
        >
          ›
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[
          ["all", "All"],
          ["newboy", "New Boys"],
          ["houseboy", "House Boys"],
        ].map(([k, t]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              ...btnBase,
              padding: "6px 12px",
              background: filter === k ? C.ink : "transparent",
              color: filter === k ? C.goldSoft : C.sub,
              border: `1.5px solid ${filter === k ? C.ink : C.line}`,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ color: C.sub, textAlign: "center", padding: 30 }}>
          Loading the board…
        </div>
      )}
      {!loading && shown.length === 0 && (
        <EmptyNote
          text={
            viewWeek === thisWeek
              ? "No completed chores posted this week yet."
              : "Nothing was posted this week."
          }
        />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 14,
        }}
      >
        {shown.map((c) => {
          const v = votes[c.id] || { up: 0, down: 0, mine: 0 };
          const score = v.up - v.down;
          return (
            <div
              key={c.id}
              style={{
                background: C.white,
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <img
                src={photoUrl(c.photo_path)}
                alt={`${c.chore_name} completed by ${c.member}`}
                loading="lazy"
                style={{
                  width: "100%",
                  aspectRatio: "4/3",
                  objectFit: "cover",
                  display: "block",
                  borderBottom: `3px solid ${
                    c.section === "newboy" ? C.gold : C.cardinal
                  }`,
                }}
              />
              <div style={{ padding: "10px 12px", flex: 1 }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: c.section === "newboy" ? C.gold : C.cardinal,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    marginBottom: 3,
                  }}
                >
                  {(c.section === "newboy" ? "New Boys" : "House Boys").toUpperCase()}{" "}
                  · WK {String(c.week).padStart(2, "0")} ·{" "}
                  {(c.day || "").toUpperCase()}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {c.chore_name}
                </div>
                <div style={{ fontSize: 12, color: C.sub }}>
                  {c.member} ·{" "}
                  {new Date(c.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderTop: `1px solid ${C.line}`,
                }}
              >
                <button
                  onClick={() => vote(c, 1)}
                  aria-label="Thumbs up"
                  style={{
                    ...btnBase,
                    padding: "5px 10px",
                    background: v.mine === 1 ? "#E4F0E7" : "transparent",
                    border: `1.5px solid ${v.mine === 1 ? C.green : C.line}`,
                    color: C.green,
                  }}
                >
                  👍 {v.up}
                </button>
                <button
                  onClick={() => vote(c, -1)}
                  aria-label="Thumbs down"
                  style={{
                    ...btnBase,
                    padding: "5px 10px",
                    background: v.mine === -1 ? "#FBEAEA" : "transparent",
                    border: `1.5px solid ${v.mine === -1 ? C.red : C.line}`,
                    color: C.red,
                  }}
                >
                  👎 {v.down}
                </button>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: MONO,
                    fontSize: 12,
                    fontWeight: 700,
                    color: score > 0 ? C.green : score < 0 ? C.red : C.sub,
                  }}
                >
                  {score > 0 ? "+" : ""}
                  {score}
                </span>
                {canManage(c) && (
                  <>
                    <button
                      onClick={() => setEditingPost(c)}
                      title="Edit submission"
                      style={{
                        ...btnBase,
                        background: "transparent",
                        color: C.sub,
                        padding: "4px 6px",
                        fontSize: 12,
                      }}
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => remove(c)}
                      title="Delete submission"
                      style={{
                        ...btnBase,
                        background: "transparent",
                        color: C.sub,
                        padding: "4px 6px",
                        fontSize: 12,
                      }}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showReport && (
        <ReportModal
          thisWeek={thisWeek}
          earliestWeek={earliestWeek}
          onClose={() => setShowReport(false)}
        />
      )}
      {editingPost && (
        <CompletionModal
          section={editingPost.section}
          sectionLabel={
            editingPost.section === "newboy" ? "New Boys" : "House Boys"
          }
          data={{ chore: { name: editingPost.chore_name }, day: editingPost.day }}
          profile={profile}
          week={editingPost.week}
          existing={editingPost}
          onClose={() => setEditingPost(null)}
          onPosted={() => {
            setEditingPost(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   REPORT — export a week or month as HTML
   ───────────────────────────────────────────── */
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])
  );

function ReportModal({ thisWeek, earliestWeek, onClose }) {
  const [mode, setMode] = useState("week");
  const [week, setWeek] = useState(thisWeek);
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [section, setSection] = useState("all");
  const [withPhotos, setWithPhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const weeks = [];
  for (let w = thisWeek; w >= earliestWeek; w--) weeks.push(w);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const generate = async () => {
    setErr("");
    setBusy(true);
    let q = supabase.from("completions").select("*").order("created_at");
    let title;
    if (mode === "week") {
      q = q.eq("week", week);
      title = `Week ${String(week).padStart(2, "0")} (${weekLabel(week)})`;
    } else {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(y, m - 1, 1).toISOString();
      const end = new Date(y, m, 1).toISOString();
      q = q.gte("created_at", start).lt("created_at", end);
      title = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
    }
    if (section !== "all") q = q.eq("section", section);
    const { data: comps, error } = await q;
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    const ids = (comps || []).map((c) => c.id);
    let voteAgg = {};
    if (ids.length) {
      const { data: vs } = await supabase
        .from("votes")
        .select("completion_id, value")
        .in("completion_id", ids);
      (vs || []).forEach((v) => {
        const a = (voteAgg[v.completion_id] = voteAgg[v.completion_id] || {
          up: 0,
          down: 0,
        });
        if (v.value === 1) a.up++;
        else a.down++;
      });
    }

    const tally = {};
    (comps || []).forEach((c) => {
      const v = voteAgg[c.id] || { up: 0, down: 0 };
      const t = (tally[c.member] = tally[c.member] || { n: 0, up: 0, down: 0 });
      t.n++;
      t.up += v.up;
      t.down += v.down;
    });

    const rows = (comps || [])
      .map((c) => {
        const v = voteAgg[c.id] || { up: 0, down: 0 };
        return `<tr>
  <td>${esc(
    new Date(c.created_at).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  )}</td>
  <td>${esc(c.section === "newboy" ? "New Boys" : "House Boys")}</td>
  <td>${esc(c.member)}</td>
  <td>${esc(c.chore_name)}<br><small>due ${esc(c.day)} · wk ${String(
          c.week
        ).padStart(2, "0")}</small></td>
  <td class="v">👍 ${v.up} &nbsp; 👎 ${v.down}</td>
  ${withPhotos ? `<td><img src="${esc(photoUrl(c.photo_path))}" alt=""></td>` : ""}
</tr>`;
      })
      .join("\n");

    const tallyRows = Object.entries(tally)
      .sort((a, b) => b[1].n - a[1].n)
      .map(
        ([m, t]) =>
          `<tr><td>${esc(m)}</td><td class="v">${t.n}</td><td class="v">${
            t.up
          }</td><td class="v">${t.down}</td><td class="v">${
            t.up - t.down > 0 ? "+" : ""
          }${t.up - t.down}</td></tr>`
      )
      .join("\n");

    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>House Duty Report — ${esc(title)}</title>
<style>
body{font-family:system-ui,sans-serif;color:#1C1B1A;max-width:960px;margin:24px auto;padding:0 16px}
h1{font-family:Impact,'Arial Narrow',sans-serif;letter-spacing:1px;text-transform:uppercase;border-bottom:4px solid #C99700;padding-bottom:6px;margin-bottom:2px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:1px;color:#9D2235;margin-top:28px}
.meta{color:#6B665D;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#1C1B1A;color:#F3E3B3;text-align:left;padding:7px 8px;font-size:11px;letter-spacing:.5px}
td{border-bottom:1px solid #DDD8CE;padding:7px 8px;vertical-align:top}
td.v{white-space:nowrap}
img{width:180px;height:135px;object-fit:cover;border-radius:4px;border:1px solid #DDD8CE}
small{color:#6B665D}
@media print{img{width:120px;height:90px}}
</style></head><body>
<h1>House Duty Report</h1>
<div class="meta">${esc(title)}${
      section !== "all"
        ? " · " + esc(section === "newboy" ? "New Boys" : "House Boys")
        : ""
    } · generated ${esc(new Date().toLocaleString())} · ${
      (comps || []).length
    } submission${(comps || []).length === 1 ? "" : "s"}</div>
<h2>Summary by person</h2>
<table><thead><tr><th>Name</th><th>Chores posted</th><th>👍</th><th>👎</th><th>Net</th></tr></thead><tbody>${
      tallyRows ||
      "<tr><td colspan=5><small>No submissions in this range.</small></td></tr>"
    }</tbody></table>
<h2>All submissions</h2>
<table><thead><tr><th>Posted</th><th>Section</th><th>Who</th><th>Chore</th><th>Votes</th>${
      withPhotos ? "<th>Photo</th>" : ""
    }</tr></thead><tbody>${
      rows || "<tr><td colspan=6><small>Nothing to show.</small></td></tr>"
    }</tbody></table>
<p><small>Note: photos in this report load from the live site. For a fully offline copy, open this file and print to PDF.</small></p>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `house-duty-report-${
      mode === "week" ? "wk" + String(week).padStart(2, "0") : month
    }.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
    setBusy(false);
  };

  const sel = { ...inputStyle, marginBottom: 10 };

  return (
    <Modal onClose={onClose} maxWidth={380}>
      <ModalTitle>Download report</ModalTitle>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>
        Exports an HTML file (opens in any browser, prints to PDF) with a
        per-person tally and every submission, photos included.
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[
          ["week", "Week"],
          ["month", "Month"],
        ].map(([k, t]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            style={{
              ...btnBase,
              flex: 1,
              padding: "7px 0",
              background: mode === k ? C.ink : "transparent",
              color: mode === k ? C.goldSoft : C.sub,
              border: `1.5px solid ${mode === k ? C.ink : C.line}`,
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {mode === "week" ? (
        <select
          value={week}
          onChange={(e) => setWeek(Number(e.target.value))}
          style={sel}
        >
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week {String(w).padStart(2, "0")} — {weekLabel(w)}
              {w === thisWeek ? " (this week)" : ""}
            </option>
          ))}
        </select>
      ) : (
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={sel}
        >
          {months.map((m) => {
            const [y, mo] = m.split("-").map(Number);
            return (
              <option key={m} value={m}>
                {new Date(y, mo - 1, 1).toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </option>
            );
          })}
        </select>
      )}
      <select
        value={section}
        onChange={(e) => setSection(e.target.value)}
        style={sel}
      >
        <option value="all">Both sections</option>
        <option value="newboy">New Boys only</option>
        <option value="houseboy">House Boys only</option>
      </select>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        <input
          type="checkbox"
          checked={withPhotos}
          onChange={(e) => setWithPhotos(e.target.checked)}
        />
        Include photos
      </label>
      {err && (
        <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{err}</div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn kind="solid" onClick={generate} disabled={busy}>
          {busy ? "Building…" : "Download"}
        </Btn>
        <Btn kind="plain" onClick={onClose}>
          Close
        </Btn>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────
   APP SHELL
   ───────────────────────────────────────────── */
export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("home");
  const [feedRefresh, setFeedRefresh] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setProfile(data));
  }, [session]);

  if (!supabase)
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <h2>Configuration needed</h2>
        <p>
          Set <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> (see README).
        </p>
      </div>
    );
  if (session === undefined)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.paper,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.sub,
        }}
      >
        Loading…
      </div>
    );
  if (!session) return <AuthScreen />;
  if (!profile)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.paper,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.sub,
        }}
      >
        Loading your profile…
      </div>
    );

  const tabs = [
    ["home", "Work Log"],
    ["newboy", "New Boys"],
    ["houseboy", "House Boys"],
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.paper,
        color: C.ink,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        body{margin:0}
        button:focus-visible, input:focus-visible, select:focus-visible {
          outline: 3px solid ${C.gold}; outline-offset: 2px;
        }
      `}</style>
      <header
        style={{
          background: C.cardinal,
          borderBottom: `4px solid ${C.gold}`,
          padding: "14px 16px 0",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <h1
              style={{
                fontFamily: DISPLAY,
                color: C.white,
                fontSize: 26,
                margin: 0,
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              House Duty Board
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: C.goldSoft, fontSize: 12 }}>
                {profile.name}
                {profile.is_admin ? " · Admin" : ""}
              </span>
              <button
                onClick={() => supabase.auth.signOut()}
                style={{
                  ...btnBase,
                  background: "rgba(255,255,255,0.15)",
                  color: C.white,
                  padding: "4px 10px",
                  fontSize: 11,
                }}
              >
                Sign out
              </button>
            </div>
          </div>
          <nav style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {tabs.map(([k, t]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  ...btnBase,
                  borderRadius: "6px 6px 0 0",
                  padding: "9px 16px",
                  background: tab === k ? C.paper : "rgba(255,255,255,0.12)",
                  color: tab === k ? C.cardinal : C.white,
                }}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main
        style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px 60px" }}
      >
        {tab === "home" && <Feed profile={profile} refreshFlag={feedRefresh} />}
        {tab === "newboy" && (
          <SectionBoard
            section="newboy"
            label="New Boys"
            profile={profile}
            onPosted={() => {
              setFeedRefresh((n) => n + 1);
              setTab("home");
            }}
          />
        )}
        {tab === "houseboy" && (
          <SectionBoard
            section="houseboy"
            label="House Boys"
            profile={profile}
            onPosted={() => {
              setFeedRefresh((n) => n + 1);
              setTab("home");
            }}
          />
        )}
      </main>
    </div>
  );
}
