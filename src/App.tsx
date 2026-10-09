import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { ArrowDown, ArrowLeft, ArrowRight, Check, Copy, Crown, LoaderCircle, LogOut, RotateCcw, Sparkles, Users, Wifi, WifiOff } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import { CARD_COLORS, type ActionResult, type Card, type CardColor, type GameState } from "./game";

const socket = io(import.meta.env.VITE_SERVER_URL || undefined, { autoConnect: false });
const colorLabels: Record<CardColor, string> = { red: "Red", yellow: "Yellow", green: "Green", blue: "Blue" };
type Screen = "lobby" | "room";

function App() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [name, setName] = useState(() => localStorage.getItem("uno-name") ?? "");
  const [joinCode, setJoinCode] = useState("");
  const [state, setState] = useState<GameState | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedColorCard, setSelectedColorCard] = useState<Card | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const onConnect = () => setPlayerId(socket.id ?? "");
    const onRoom = (next: GameState) => {
      setState(next);
      setScreen("room");
      setBusy(false);
    };
    const onHand = (cards: Card[]) => setHand(cards);
    const onError = (message: string) => {
      setError(message);
      setBusy(false);
    };
    const onClosed = () => {
      setState(null);
      setHand([]);
      setScreen("lobby");
      setError("The room was closed.");
    };
    socket.on("connect", onConnect);
    socket.on("room:update", onRoom);
    socket.on("hand:update", onHand);
    socket.on("room:closed", onClosed);
    socket.on("connect_error", () => {
      setError("Could not connect to the game server. Make sure the backend is running.");
      setBusy(false);
    });
    socket.on("disconnect", () => setNotice("Connection lost. Reconnecting…"));
    socket.on("connect", () => setNotice(""));
    socket.on("game:error", onError);
    return () => {
      socket.off("connect", onConnect);
      socket.off("room:update", onRoom);
      socket.off("hand:update", onHand);
      socket.off("room:closed", onClosed);
      socket.off("game:error", onError);
    };
  }, []);

  useEffect(() => {
    if (!state?.winnerId) return;
    const winner = state.players.find((player) => player.id === state.winnerId);
    setNotice(winner ? `${winner.name} wins the round!` : "Round complete!");
  }, [state?.winnerId, state?.players]);

  const currentPlayer = state?.players.find((player) => player.id === playerId);
  const isMyTurn = state?.started && state.currentPlayerId === playerId && !state.winnerId;
  const canPlayDrawnCard = state?.canPlayDrawnCardPlayerId === playerId;
  const playableCards = useMemo(() => {
    if (!isMyTurn) return new Set<string>();
    const top = state?.topCard;
    return new Set(hand.filter((card) =>
      card.color === "wild" || card.color === state?.currentColor || card.value === top?.value,
    ).map((card) => card.id));
  }, [hand, isMyTurn, state?.currentColor, state?.topCard]);

  function withResult(event: string, payload?: object) {
    setError("");
    socket.emit(event, ...(payload ? [payload] : []), (result: ActionResult) => {
      setBusy(false);
      if (!result.ok) setError(result.error ?? "That action could not be completed.");
    });
  }

  function connect(action: "create" | "join") {
    const playerName = name.trim();
    if (!playerName) {
      setError("Enter your name to continue.");
      return;
    }
    localStorage.setItem("uno-name", playerName);
    setError("");
    setBusy(true);
    const enter = () => {
      if (action === "create") withResult("room:create", { name: playerName });
      else withResult("room:join", { name: playerName, code: joinCode.trim().toUpperCase() });
    };
    if (!socket.connected) {
      socket.once("connect", enter);
      socket.connect();
    } else enter();
  }

  function startGame() {
    setBusy(true);
    withResult("game:start");
  }

  function playCard(card: Card) {
    if (!playableCards.has(card.id)) return;
    if (card.color === "wild") {
      setSelectedColorCard(card);
      return;
    }
    withResult("game:play", { cardId: card.id });
  }

  function chooseColor(color: CardColor) {
    if (!selectedColorCard) return;
    withResult("game:play", { cardId: selectedColorCard.id, color });
    setSelectedColorCard(null);
  }

  async function copyCode() {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy the room code. You can select and copy it manually.");
    }
  }

  function leaveRoom() {
    socket.disconnect();
    setState(null);
    setHand([]);
    setScreen("lobby");
    setError("");
  }

  return (
    <main className={screen === "room" && state?.started ? "app app--game" : "app"}>
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => event.preventDefault()} aria-label="UNO home">
          <span className="brand-mark"><span>U</span><span>N</span><span>O</span></span>
          <span className="brand-caption">PLAY TOGETHER</span>
        </a>
        <div className="topbar-right">
          <span className="live-indicator"><span /> LIVE MULTIPLAYER</span>
          {screen === "room" && <button className="icon-button leave-button" onClick={leaveRoom} aria-label="Leave room"><LogOut size={17} /></button>}
        </div>
      </header>

      {screen === "lobby" || !state ? (
        <Lobby
          name={name}
          joinCode={joinCode}
          busy={busy}
          error={error}
          onName={setName}
          onCode={(value) => setJoinCode(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
          onCreate={() => connect("create")}
          onJoin={() => connect("join")}
        />
      ) : (
        <GameRoom
          state={state}
          hand={hand}
          playerId={playerId}
          currentPlayerName={currentPlayer?.name ?? name}
          isMyTurn={Boolean(isMyTurn)}
          canPlayDrawnCard={Boolean(canPlayDrawnCard)}
          playableCards={playableCards}
          busy={busy}
          copied={copied}
          error={error}
          notice={notice}
          selectedColorCard={selectedColorCard}
          onCopy={copyCode}
          onLeave={leaveRoom}
          onStart={startGame}
          onPlay={playCard}
          onDraw={() => withResult("game:draw")}
          onEndTurn={() => withResult("game:end-turn")}
          onColor={chooseColor}
          onCloseColor={() => setSelectedColorCard(null)}
          onRematch={() => {
            setNotice("");
            startGame();
          }}
        />
      )}

      <footer className="footer"><span>GOOD GAMES. GOOD COMPANY.</span><span>Uno Online <span className="footer-dot">·</span> Private rooms</span></footer>
      <Analytics />
    </main>
  );
}

function Lobby(props: {
  name: string;
  joinCode: string;
  busy: boolean;
  error: string;
  onName: (value: string) => void;
  onCode: (value: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <section className="lobby">
      <div className="lobby-copy">
        <span className="eyebrow"><Sparkles size={14} /> THE CLASSIC, TOGETHER</span>
        <h1>One more<br /><span>round?</span></h1>
        <p>Bring your people. Deal the cards. See who really knows when to say UNO.</p>
        <div className="feature-row">
          <div><span className="feature-icon"><Users size={16} /></span><span>2–8 players</span></div>
          <div><span className="feature-icon"><Wifi size={16} /></span><span>Live multiplayer</span></div>
        </div>
        <div className="card-stack" aria-hidden="true">
          <GameCard card={{ id: "back", color: "wild", value: "uno" }} faceDown className="stack-card stack-card--one" />
          <GameCard card={{ id: "r7", color: "red", value: "7" }} className="stack-card stack-card--two" />
          <GameCard card={{ id: "b2", color: "blue", value: "2" }} className="stack-card stack-card--three" />
        </div>
        <span className="card-scribble">Your move <ArrowRight size={18} /></span>
      </div>
      <div className="lobby-panel">
        <div className="panel-top"><div className="panel-icon"><Users size={20} /></div><span>LET'S PLAY</span></div>
        <h2>Get in the game</h2>
        <p className="panel-description">Choose a name, then create a room or join your friends.</p>
        <label className="field-label" htmlFor="player-name">YOUR NAME</label>
        <input id="player-name" className="text-input" maxLength={18} placeholder="What should we call you?" value={props.name} onChange={(event) => props.onName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && props.onCreate()} />
        <button className="button button--primary create-button" onClick={props.onCreate} disabled={props.busy}>
          {props.busy ? <LoaderCircle size={18} className="spin" /> : <Users size={18} />}
          Create a room <ArrowRight size={17} />
        </button>
        <div className="divider"><span /> <span>OR JOIN A ROOM</span> <span /></div>
        <label className="field-label" htmlFor="room-code">ROOM CODE</label>
        <div className="join-row">
          <input id="room-code" className="text-input code-input" placeholder="e.g. K7P2M" maxLength={5} value={props.joinCode} onChange={(event) => props.onCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && props.onJoin()} />
          <button className="button button--outline join-button" onClick={props.onJoin} disabled={props.busy || props.joinCode.length !== 5}>Join <ArrowRight size={16} /></button>
        </div>
        {props.error && <p className="error-message" role="alert">{props.error}</p>}
        <p className="privacy-note"><span className="privacy-dot" /> Private rooms. Just your friends.</p>
      </div>
    </section>
  );
}

function GameRoom(props: {
  state: GameState;
  hand: Card[];
  playerId: string;
  currentPlayerName: string;
  isMyTurn: boolean;
  canPlayDrawnCard: boolean;
  playableCards: Set<string>;
  busy: boolean;
  copied: boolean;
  error: string;
  notice: string;
  selectedColorCard: Card | null;
  onCopy: () => void;
  onLeave: () => void;
  onStart: () => void;
  onPlay: (card: Card) => void;
  onDraw: () => void;
  onEndTurn: () => void;
  onColor: (color: CardColor) => void;
  onCloseColor: () => void;
  onRematch: () => void;
}) {
  const winner = props.state.players.find((player) => player.id === props.state.winnerId);
  const activeIndex = props.state.players.findIndex((player) => player.id === props.playerId);
  const opponents = props.state.players.filter((player) => player.id !== props.playerId);
  const positions = ["seat--top", "seat--left", "seat--right", "seat--top-left", "seat--top-right", "seat--far-left", "seat--far-right"];
  return (
    <section className="game-page">
      <div className="room-toolbar">
        <div className="room-title"><button className="back-link" onClick={props.onLeave}><ArrowLeft size={16} /> Back</button><span className="toolbar-divider" /><span className="room-title-text">FRIEND ROOM</span></div>
        <button className="room-code" onClick={props.onCopy}><span>ROOM CODE</span><strong>{props.state.code}</strong>{props.copied ? <Check size={16} /> : <Copy size={15} />}</button>
      </div>
      {!props.state.started ? (
        <div className="waiting-layout">
          <div className="waiting-hero">
            <span className="eyebrow"><span className="privacy-dot" /> ROOM IS OPEN</span>
            <h1>Waiting on<br /><span>your crew.</span></h1>
            <p>Send the room code to your friends. The more, the messier.</p>
            <button className="button button--outline invite-button" onClick={props.onCopy}>{props.copied ? <Check size={17} /> : <Copy size={17} />}{props.copied ? "Copied!" : "Copy invite code"}</button>
            <div className="waiting-orbit"><span className="orbit-ring" /><span className="orbit-card orbit-card--red">5</span><span className="orbit-card orbit-card--yellow">↻</span><span className="orbit-card orbit-card--blue">2</span><span className="orbit-star">✦</span></div>
          </div>
          <div className="players-panel">
            <div className="players-panel-heading"><div><span className="field-label">THE TABLE</span><h2>Players <span className="count-pill">{props.state.players.length}/8</span></h2></div><span className="online-tag"><span /> {props.state.players.length} HERE</span></div>
            <div className="player-list">
              {props.state.players.map((player, index) => (
                <div className="player-row" key={player.id}>
                  <span className={`avatar avatar--${index % 4}`}>{player.name.slice(0, 1).toUpperCase()}</span>
                  <div className="player-row-name"><strong>{player.name}{player.id === props.playerId && <span className="you-label">YOU</span>}</strong><span>{player.id === props.state.hostId ? "Room host" : "Ready to play"}</span></div>
                  {player.id === props.state.hostId && <Crown size={17} className="crown-icon" />}
                </div>
              ))}
              {Array.from({ length: Math.max(0, 2 - props.state.players.length) }).map((_, index) => (
                <div className="player-row player-row--empty" key={`empty-${index}`}><span className="avatar avatar--empty"><Users size={16} /></span><div className="player-row-name"><strong>Waiting for player</strong><span>Share the code to invite them</span></div><LoaderCircle className="waiting-spinner" size={17} /></div>
              ))}
            </div>
            {props.playerId === props.state.hostId ? (
              <button className="button button--primary start-button" onClick={props.onStart} disabled={props.busy || props.state.players.length < 2}>
                {props.busy ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />} Start game <ArrowRight size={17} />
              </button>
            ) : <p className="host-note"><LoaderCircle className="waiting-spinner" size={14} /> The host will start the game when everyone's here.</p>}
            {props.error && <p className="error-message" role="alert">{props.error}</p>}
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <div className="table-status"><span className={`turn-badge ${props.isMyTurn ? "turn-badge--active" : ""}`}><span />{props.isMyTurn ? "YOUR TURN" : `${props.state.players.find((player) => player.id === props.state.currentPlayerId)?.name ?? "Player"}'S TURN`}</span><span className="table-status-divider" /><span className="table-round">{props.state.players.length} PLAYERS <span>·</span> ROUND 1</span></div>
          <div className={`game-table ${props.isMyTurn ? "game-table--my-turn" : ""}`}>
            <div className="table-texture" />
            <div className="table-inner-ring" />
            <div className="table-brand"><span className="mini-uno">UNO</span><span>FRIENDS TABLE</span></div>
            <div className="table-center">
              <button className="direction-chip" aria-label="Turn direction"><RotateCcw size={16} className={props.state.direction === -1 ? "direction-reverse" : ""} /></button>
              <div className="discard-pile"><span className={`current-color-indicator swatch--${props.state.currentColor ?? "red"}`} /><GameCard card={props.state.topCard ?? { id: "empty", color: "wild", value: "wild" }} /></div>
              <div className="deck-pile"><GameCard card={{ id: "deck", color: "wild", value: "uno" }} faceDown /><span>{props.state.players.reduce((total, player) => total + player.cardCount, 0)} CARDS IN PLAY</span></div>
            </div>
            {opponents.map((player, index) => (
              <div key={player.id} className={`opponent-seat ${positions[(index + Math.max(0, activeIndex)) % positions.length]} ${player.id === props.state.currentPlayerId ? "opponent-seat--active" : ""}`}>
                <div className={`opponent-avatar avatar--${index % 4}`}>{player.name.slice(0, 1).toUpperCase()}</div>
                <div className="opponent-info"><strong>{player.name}</strong><span>{player.cardCount} cards {player.saidUno && <b className="uno-call">UNO!</b>}</span></div>
                {player.id === props.state.hostId && <Crown className="seat-crown" size={13} />}
                <div className="opponent-cards">{Array.from({ length: Math.min(4, player.cardCount) }).map((_, cardIndex) => <span className="tiny-card" key={cardIndex} />)}{player.cardCount > 4 && <span className="card-overflow">+{player.cardCount - 4}</span>}</div>
              </div>
            ))}
            <div className={`player-seat ${props.isMyTurn ? "player-seat--active" : ""}`}>
              <div className={`player-seat-avatar avatar--${Math.max(0, activeIndex) % 4}`}>{props.currentPlayerName.slice(0, 1).toUpperCase()}</div>
              <div className="player-seat-info"><strong>{props.currentPlayerName} <span>(you)</span></strong><span>{props.hand.length} cards</span></div>
              {props.state.players.find((player) => player.id === props.playerId)?.saidUno && <span className="uno-call uno-call--self">UNO!</span>}
            </div>
          </div>
          <div className="hand-area">
            <div className="hand-label"><span>YOUR HAND <strong>{props.hand.length}</strong></span>{props.isMyTurn ? <span className="hand-helper"><span className="privacy-dot" /> {props.canPlayDrawnCard ? "Play your drawn card or pass" : "Choose a card to play"}</span> : <span className="hand-helper">Waiting for your turn…</span>}</div>
            <div className="hand-cards">
              {props.hand.map((card, index) => (
                <button
                  key={card.id}
                  className={`hand-card ${props.playableCards.has(card.id) ? "hand-card--playable" : ""} ${props.isMyTurn && !props.playableCards.has(card.id) ? "hand-card--dim" : ""}`}
                  style={{ "--card-index": index, "--card-total": props.hand.length } as React.CSSProperties}
                  onClick={() => props.onPlay(card)}
                  disabled={!props.playableCards.has(card.id)}
                  aria-label={`${card.color} ${card.value}${props.playableCards.has(card.id) ? ", playable" : ""}`}
                >
                  <GameCard card={card} />
                </button>
              ))}
            </div>
            <div className="turn-actions">
              <button className="button button--outline draw-button" onClick={props.onDraw} disabled={!props.isMyTurn || props.canPlayDrawnCard || props.busy}><ArrowDown size={17} /> Draw card</button>
              {props.canPlayDrawnCard && <button className="button button--primary end-turn-button" onClick={props.onEndTurn} disabled={props.busy}>Pass turn <ArrowRight size={17} /></button>}
              <span className="table-color-label"><span className={`swatch--${props.state.currentColor ?? "red"}`} /> Playing {colorLabels[props.state.currentColor ?? "red"]}</span>
            </div>
          </div>
          {props.error && <p className="error-message game-error" role="alert">{props.error}</p>}
          {props.notice && !props.state.winnerId && <p className="connection-note"><WifiOff size={14} />{props.notice}</p>}
          {winner && <div className="winner-overlay"><div className="winner-card"><span className="winner-confetti">✦</span><span className="eyebrow">ROUND COMPLETE</span><h2>{winner.name} wins!</h2><p>{props.playerId === props.state.hostId ? "That was a good one. Deal again?" : "That was a good one. Waiting for the host to deal again."}</p>{props.playerId === props.state.hostId && <button className="button button--primary" onClick={props.onRematch}><RotateCcw size={17} /> Play again</button>}</div></div>}
          {props.selectedColorCard && <div className="modal-backdrop" role="presentation" onClick={props.onCloseColor}><div className="color-modal" role="dialog" aria-modal="true" aria-labelledby="color-title" onClick={(event) => event.stopPropagation()}><span className="eyebrow">WILD CARD</span><h2 id="color-title">Choose a color</h2><p>What color should the next player match?</p><div className="color-choices">{CARD_COLORS.map((color) => <button className={`color-choice color-choice--${color}`} key={color} onClick={() => props.onColor(color)} aria-label={colorLabels[color]} />)}</div></div></div>}
        </div>
      )}
    </section>
  );
}

function GameCard({ card, faceDown = false, className = "" }: { card: Card; faceDown?: boolean; className?: string }) {
  const wild = card.color === "wild";
  const label = card.value === "reverse" ? "↻" : card.value === "skip" ? "⊘" : card.value === "draw2" ? "+2" : card.value === "wild4" ? "+4" : card.value;
  return (
    <span className={`game-card ${faceDown ? "game-card--back" : `game-card--${wild ? "wild" : card.color}`} ${className}`}>
      {faceDown ? <span className="card-back-logo">UNO</span> : <>
        {wild && <span className="wild-corners"><i /><i /><i /><i /></span>}
        <span className="card-corner card-corner--top">{label}</span>
        <span className="card-center">{wild ? <span className="wild-center"><i /><i /><i /><i /></span> : label}</span>
        <span className="card-corner card-corner--bottom">{label}</span>
      </>}
    </span>
  );
}

export default App;
