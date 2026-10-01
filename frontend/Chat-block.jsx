function Chat({ roomCode, me, canSend, open, setOpen }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState([]); // popup bubbles shown while the chat is closed
  const box = useRef(null);
  const openRef = useRef(open);
  openRef.current = open;

  const merge = (a, b) => {
    const seen = new Map();
    [...a, ...b].forEach((m) => seen.set(`${m.timestamp}|${m.playerId}|${m.message}`, m));
    return [...seen.values()];
  };

  useEffect(() => {
    let live = true;
    fetch(`${API}/rooms/${roomCode}/chat`)
      .then((r) => r.json())
      .then((d) => live && setMsgs((v) => merge(d.messages || [], v)))
      .catch(() => {});

    const onMsg = (m) => {
      setMsgs((v) => merge(v, [m]));
      if (!openRef.current && m.playerId !== me) {
        setUnread((n) => n + 1);
        const id = `${m.timestamp}|${m.playerId}|${Math.random()}`;
        setToasts((t) => [...t.slice(-2), { id, name: m.playerName, text: m.message }]); // max 3 on screen
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
      }
    };

    socket.on("new-message", onMsg);
    return () => {
      live = false;
      socket.off("new-message", onMsg);
    };
  }, [roomCode, me]);

  // opening the chat clears the badge and the popups
  useEffect(() => {
    if (open) {
      setUnread(0);
      setToasts([]);
    }
  }, [open]);

  // full-screen chat on phones: stop the page behind it from scrolling
  useEffect(() => {
    if (!open || !window.matchMedia("(max-width:760px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [msgs, open]);

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    setErr("");
    try {
      const r = await fetch(`${API}/rooms/${roomCode}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: me, message }),
      });
      if (r.ok) setText("");
      else setErr((await r.json()).message || "Could not send.");
    } catch {
      setErr("Can't reach the server.");
    }
  };

  return (
    <>
      {!open && toasts.length > 0 && (
        <div className="mf-toasts" aria-live="polite">
          {toasts.map((t) => (
            <button key={t.id} className="mf-toast" onClick={() => setOpen(true)}>
              <b>{t.name}</b>
              <span>{t.text}</span>
            </button>
          ))}
        </div>
      )}

      {!open && (
        <button className="mf-chat-fab" onClick={() => setOpen(true)} aria-label="Open chat">
          {unread > 0 && <span className="mf-badge">{unread}</span>}
          <span className="t">CHAT</span>
        </button>
      )}

      <aside className={`mf-chat-panel ${open ? "open" : ""}`} style={{ "--bg": `url(${mafiaHood})` }} aria-hidden={!open}>
        <div className="mf-chat-head">
          Town Chat
          <button onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
        </div>

        <div className="mf-msgs" ref={box}>
          {msgs.length === 0 && <div className="mf-msg-empty">No messages yet.<br />Start the discussion.</div>}
          {msgs.map((m, i) => (
            <div key={i} className={`mf-msg ${m.playerId === me ? "me" : ""}`}>
              <b>{m.playerName}</b>
              {m.message}
            </div>
          ))}
        </div>

        <div className="mf-chat-foot">
          {err && <div className="mf-err" role="alert" style={{ margin: "0 0 8px" }}>{err}</div>}
          {canSend ? (
            <div className="mf-chatbar">
              <input
                value={text}
                maxLength={200}
                placeholder="Say something…"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button onClick={send} disabled={!text.trim()}>Send</button>
            </div>
          ) : (
            <p className="mf-note" style={{ margin: 0 }}>You're out, so you can read but not talk.</p>
          )}
        </div>
      </aside>
    </>
  );
}
