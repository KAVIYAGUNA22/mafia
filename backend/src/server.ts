import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
    cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

interface Player {
    id: number;
    name: string;
    role?: string;
    alive: boolean;
     left?: boolean;
}

interface GameRoom {
    roomCode: string;
    hostId: number;      // add
    nextId: number; 
    players: Player[];
    status: "WAITING" | "IN_PROGRESS" | "FINISHED";
    phase: "NIGHT" | "DAY";
    mafiaPicks: Record<number, number>;   // mafia player id -> target id
    mafiaChat: { playerId: number; playerName: string; message: string; timestamp: string }[];
    doctorTargetId?: number;
    nightActed: number[];          // players who already used their night action
    lastResult?: string;           // public message shown to everyone in the morning
    winner?: string;
    votes: { voterId: number; targetId: number }[];
    messages: {
        playerId: number;
        playerName: string;
        message: string;
        timestamp: string;
    }[];
}

const rooms: GameRoom[] = [];

/* ---------------- helpers ---------------- */

const findRoom = (code: string) =>
    rooms.find(room => room.roomCode === String(code).toUpperCase());

// What everybody is allowed to see. NEVER includes roles or secret night targets.
function publicRoom(room: GameRoom) {
    const over = room.status === "FINISHED";

    return {
        roomCode: room.roomCode,
        hostId: room.hostId,
        players: room.players.map(({ id, name, alive, left, role }) =>
            over ? { id, name, alive, left, role } : { id, name, alive, left }
        ),
        status: room.status,
        phase: room.phase,
        votes: room.votes,
        lastResult: room.lastResult,
        winner: room.winner
    };
}

function makeRoomCode(): string {
    let code = "";
    do {
        code = Math.random().toString(36).slice(2, 7).toUpperCase();
    } while (code.length < 5 || rooms.some(room => room.roomCode === code));
    return code;
}

function generateRoles(playerCount: number): string[] {
        const mafiaCount =
        Number(process.env.MAFIA_COUNT) || (playerCount <= 6 ? 1 : playerCount <= 9 ? 2 : 3);

    const roles: string[] = [
        ...Array(mafiaCount).fill("MAFIA"),
        "DOCTOR",
        "DETECTIVE"
    ];

    while (roles.length < playerCount) roles.push("CITIZEN");

    return roles.sort(() => Math.random() - 0.5);
}

function checkWinner(room: GameRoom): { gameOver: boolean; winner?: string } {
    const alive = room.players.filter(p => p.alive);
    const mafia = alive.filter(p => p.role === "MAFIA").length;
    const others = alive.length - mafia;

    if (mafia === 0) {
        room.status = "FINISHED";
        return { gameOver: true, winner: "CITIZENS" };
    }

    if (mafia >= others) {
        room.status = "FINISHED";
        return { gameOver: true, winner: "MAFIA" };
    }

    return { gameOver: false };
}

// Turns the night into the morning
function resolveNight(room: GameRoom) {
    // Every locked-in Mafia pick goes into a hat. If they agree the target is clear;
    // if not, one pick is drawn at random.
    const picks = room.players
        .filter(p => p.role === "MAFIA" && p.alive && room.nightActed.includes(p.id) && room.mafiaPicks[p.id] !== undefined)
        .map(p => room.mafiaPicks[p.id]);

    const targetId = picks.length ? picks[Math.floor(Math.random() * picks.length)] : undefined;
    const target = room.players.find(p => p.id === targetId);
    let result = "Nobody was attacked tonight";

    if (target && target.alive) {
        if (room.doctorTargetId === target.id) {
            result = `${target.name} was attacked but saved by the Doctor`;
        } else {
            target.alive = false;
            result = `${target.name} was killed by the Mafia`;
        }
    }

    room.mafiaPicks = {};
    room.doctorTargetId = undefined;
    room.nightActed = [];
    room.phase = "DAY";
    room.lastResult = result;

    const winner = checkWinner(room);
    if (winner.gameOver) room.winner = winner.winner;

    io.to(room.roomCode).emit("phase-changed");

    return { result, winner };
}

function maybeResolveNight(room: GameRoom) {
    const needed = room.players.filter(
        p => p.alive && ["MAFIA", "DOCTOR", "DETECTIVE"].includes(p.role ?? "")
    );
    const everyoneActed = needed.every(p => room.nightActed.includes(p.id));

    if (needed.some(p => p.role === "MAFIA") && everyoneActed) {
        return resolveNight(room);
    }
    return null;
}

/* ---------------- rooms ---------------- */

// Create a room
app.post("/rooms", (req, res) => {
    const { playerName } = req.body;

    if (!playerName || !String(playerName).trim()) {
        return res.status(400).json({ message: "Player name is required" });
    }

    const room: GameRoom = {
        roomCode: makeRoomCode(),
        hostId: 1,
        nextId: 2,
        players: [{ id: 1, name: String(playerName).trim(), alive: true }],
        status: "WAITING",
        phase: "NIGHT",
        nightActed: [],
        votes: [],
        messages: [],
        mafiaPicks: {}, 
        mafiaChat: []
    };

    rooms.push(room);

    res.status(201).json({
        message: "Room created successfully",
        room: publicRoom(room)
    });
});

// Join a room
app.post("/rooms/:roomCode/join", (req, res) => {
    const room = findRoom(req.params.roomCode);
    const { playerName } = req.body;

    if (!room) {
        return res.status(404).json({ message: "Room not found" });
    }

    if (!playerName || !String(playerName).trim()) {
        return res.status(400).json({ message: "Player name is required" });
    }

    if (room.status !== "WAITING") {
        return res.status(400).json({ message: "Game already started" });
    }

    if (room.players.length >= 10) {
        return res.status(400).json({ message: "Room is full" });
    }

    const name = String(playerName).trim();

    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        return res.status(400).json({ message: "That name is already taken in this room" });
    }

        room.players.push({
        id: room.nextId++,
        name,
        alive: true
    });

    res.status(201).json({
        message: `${name} joined the game`,
        room: publicRoom(room)
    });
});

// Get room (public information only)
app.get("/rooms/:roomCode", (req, res) => {
    const room = findRoom(req.params.roomCode);

    if (!room) {
        return res.status(404).json({ message: "Room not found" });
    }

    res.json(publicRoom(room));
});

// Start game
app.post("/rooms/:roomCode/start", (req, res) => {
    const room = findRoom(req.params.roomCode);
    
    if (!room) {
        return res.status(404).json({ message: "Room not found" });
    }
    if (Number(req.body?.playerId) !== room.hostId) {
        return res.status(403).json({ message: "Only the host can start the game" });
    }

    if (room.players.length < 4) {
        return res.status(400).json({ message: "At least 4 players are required" });
    }

    if (room.status === "IN_PROGRESS") {
        return res.status(400).json({ message: "Game already started" });
    }

    const roles = generateRoles(room.players.length);

    room.players.forEach((player, index) => {
        player.role = roles[index];
        player.alive = true;
    });

    room.status = "IN_PROGRESS";
    room.phase = "NIGHT";
    room.nightActed = [];
    room.mafiaPicks = {};
    room.mafiaChat = [];
    room.lastResult = undefined;
    room.winner = undefined;
    room.messages = [];
    room.votes = [];

    // Tell everyone in the room, so each player can fetch their own role
    io.to(room.roomCode).emit("game-started");

    res.json({
        message: "Game started successfully",
        room: publicRoom(room)
    });
});

// A player's private information (the ONLY place a role is returned)
app.get("/rooms/:roomCode/players/:playerId", (req, res) => {
    const room = findRoom(req.params.roomCode);

    if (!room) {
        return res.status(404).json({ message: "Room not found" });
    }

    const player = room.players.find(p => p.id === Number(req.params.playerId));

    if (!player) {
        return res.status(404).json({ message: "Player not found" });
    }

        const teammates =
        player.role === "MAFIA"
            ? room.players
                  .filter(p => p.role === "MAFIA" && p.id !== player.id)
                  .map(p => ({ id: p.id, name: p.name }))
            : undefined;

    res.json({
        id: player.id,
        name: player.name,
        role: player.role,
        alive: player.alive,
        teammates
    });
});

// Reset game
app.post("/rooms/:roomCode/reset", (req, res) => {
    const room = findRoom(req.params.roomCode);
      if (Number(req.body?.playerId) !== 1) {
      return res.status(403).json({ message: "Only the host can reset the game" });
  }
    if (!room) {
        return res.status(404).json({ message: "Room not found" });
    }
        if (Number(req.body?.playerId) !== room.hostId) {
        return res.status(403).json({ message: "Only the host can reset the game" });
    }
    room.players = room.players.filter(p => !p.left);
    room.players.forEach(player => {
        player.role = undefined;
        player.alive = true;
    });

    room.status = "WAITING";
    room.phase = "NIGHT";
   room.mafiaPicks = {}; 
   room.mafiaChat = [];
    room.doctorTargetId = undefined;
    room.nightActed = [];
    room.lastResult = undefined;
    room.winner = undefined;
    room.votes = [];

    io.to(room.roomCode).emit("phase-changed");

    res.json({
        message: "Game reset successfully",
        room: publicRoom(room)
    });
});

/* ---------------- night actions ---------------- */

interface NightOptions {
    role: "MAFIA" | "DOCTOR" | "DETECTIVE";
    actorField: string;
    allowSelf: boolean;
    apply: (room: GameRoom, actor: Player, target: Player) => object;
}

function nightRoute(path: string, options: NightOptions) {
    app.post(`/rooms/:roomCode/${path}`, (req, res) => {
        const room = findRoom(req.params.roomCode);

        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        if (room.status !== "IN_PROGRESS") {
            return res.status(400).json({ message: "Game has not started" });
        }

        if (room.phase !== "NIGHT") {
            return res.status(400).json({ message: "This action is only allowed at night" });
        }

        const actor = room.players.find(
            p => p.id === Number(req.body[options.actorField])
        );

        if (!actor || actor.role !== options.role) {
            return res.status(403).json({ message: `Only ${options.role} can perform this action` });
        }

        if (!actor.alive) {
            return res.status(400).json({ message: "Dead players cannot act" });
        }

        const target = room.players.find(
            p => p.id === Number(req.body.targetPlayerId)
        );

        if (!target) {
            return res.status(404).json({ message: "Target player not found" });
        }

        if (!target.alive) {
            return res.status(400).json({ message: "Target is already dead" });
        }

        if (!options.allowSelf && target.id === actor.id) {
            return res.status(400).json({ message: "You cannot choose yourself" });
        }
        if (options.role === "MAFIA" && target.role === "MAFIA") {
            return res.status(400).json({ message: "You cannot target a fellow Mafia" });
        }

        if (room.nightActed.includes(actor.id)) {
            return res.status(400).json({ message: "You already used your night action" });
        }

        const data = options.apply(room, actor, target);

        room.nightActed.push(actor.id);
        io.to(room.roomCode).emit("mafia-update");

        const resolved = maybeResolveNight(room);

        res.json({ ...data, nightResolved: Boolean(resolved) });
    });
}

nightRoute("mafia/kill", {
    role: "MAFIA",
    actorField: "mafiaPlayerId",
    allowSelf: false,
        apply: (room, actor, target) => {
        room.mafiaPicks[actor.id] = target.id;
        return { message: "Mafia locked in a target", targetPlayerId: target.id };
    }
});

nightRoute("doctor/save", {
    role: "DOCTOR",
    actorField: "doctorPlayerId",
    allowSelf: true,
    apply: (room, _actor, target) => {
        room.doctorTargetId = target.id;
        return { message: "Doctor selected a player to save", targetPlayerId: target.id };
    }
});

nightRoute("detective/investigate", {
    role: "DETECTIVE",
    actorField: "detectivePlayerId",
    allowSelf: false,
    apply: (_room, _actor, target) => ({
        message: "Investigation completed",
        targetPlayerId: target.id,
        targetName: target.name,
        result: target.role === "MAFIA" ? "MAFIA" : "NOT_MAFIA"
    })
});

// Manual night resolve (kept for testing; the game resolves automatically)
app.post("/rooms/:roomCode/resolve-night", (req, res) => {
    const room = findRoom(req.params.roomCode);

    if (!room) {
        return res.status(404).json({ message: "Room not found" });
    }

    if (room.status !== "IN_PROGRESS") {
        return res.status(400).json({ message: "Game has not started" });
    }

    if (room.phase !== "NIGHT") {
        return res.status(400).json({ message: "It is not night phase" });
    }

        if (Object.keys(room.mafiaPicks).length === 0) {
        return res.status(400).json({ message: "Mafia has not selected a target" });
    }

    const { result, winner } = resolveNight(room);

    res.json({
        message: "Night resolved",
        result,
        phase: room.phase,
        winner,
        players: publicRoom(room).players
    });
});
// Counts the votes and moves the game on
function resolveVotes(room: GameRoom) {
    const counts: Record<number, number> = {};
    room.votes.forEach(v => {
        counts[v.targetId] = (counts[v.targetId] || 0) + 1;
    });

    const highest = Math.max(...Object.values(counts));
    const top = Object.entries(counts)
        .filter(([, count]) => count === highest)
        .map(([id]) => Number(id));

    room.votes = [];

    // Tie: nobody leaves, everyone votes again
    if (top.length > 1) {
        room.lastResult = "The vote ended in a tie. Nobody was eliminated. Vote again.";
        io.to(room.roomCode).emit("phase-changed");
        return { tie: true, nextPhase: "DAY" };
    }

    const eliminated = room.players.find(p => p.id === top[0])!;
    eliminated.alive = false;
    room.lastResult = `${eliminated.name} was voted out`;

    const winner = checkWinner(room);

    if (winner.gameOver) {
        room.winner = winner.winner;
    } else {
        room.phase = "NIGHT";
    }

    io.to(room.roomCode).emit("phase-changed");

    return {
        tie: false,
        eliminatedPlayer: { id: eliminated.id, name: eliminated.name },
        winner,
        nextPhase: winner.gameOver ? "GAME_OVER" : "NIGHT"
    };
}
function closeRoom(room: GameRoom) {
    const i = rooms.indexOf(room);
    if (i >= 0) rooms.splice(i, 1);
}

function removePlayer(room: GameRoom, playerId: number) {
    const player = room.players.find(p => p.id === playerId);
    if (!player || player.left) return;

    if (room.status === "WAITING") {
        room.players = room.players.filter(p => p.id !== playerId);      // lobby: just remove
    } else {
        player.left = true;                                               // game: they drop out
        player.alive = false;
        room.votes = room.votes.filter(v => v.voterId !== playerId && v.targetId !== playerId);
        room.nightActed = room.nightActed.filter(id => id !== playerId);
    }

    if (room.players.every(p => p.left)) {                                // nobody left: close it
        closeRoom(room);
        return;
    }

    if (room.hostId === playerId) {                                       // host handover
        const next = room.players.find(p => !p.left);
        if (next) room.hostId = next.id;
    }

    if (room.status === "IN_PROGRESS") {                                  // don't let the game hang
        const winner = checkWinner(room);
        if (winner.gameOver) {
            room.winner = winner.winner;
            room.lastResult = `${player.name} left the game`;
        } else if (room.phase === "NIGHT") {
            maybeResolveNight(room);
        } else {
            const aliveCount = room.players.filter(p => p.alive).length;
            if (room.votes.length > 0 && room.votes.length >= aliveCount) resolveVotes(room);
        }
    }

    io.to(room.roomCode).emit("phase-changed");
}

app.post("/rooms/:roomCode/leave", (req, res) => {
    const room = findRoom(req.params.roomCode);
    if (!room) return res.json({ message: "Room already closed" });

    const playerId = Number(req.body?.playerId);
    if (!room.players.some(p => p.id === playerId)) {
        return res.status(404).json({ message: "Player not found" });
    }

    removePlayer(room, playerId);
    res.json({ message: "Left the room" });
});

/* ---------------- day: voting ---------------- */

app.post("/rooms/:roomCode/vote", (req, res) => {
    const room = findRoom(req.params.roomCode);
    const { voterId, targetId } = req.body;

    if (!room) {
        return res.status(404).json({ message: "Room not found" });
    }

    if (room.status !== "IN_PROGRESS") {
        return res.status(400).json({ message: "Game has not started" });
    }

    if (room.phase !== "DAY") {
        return res.status(400).json({ message: "Voting is only allowed during the day" });
    }

    const voter = room.players.find(p => p.id === Number(voterId));
    const target = room.players.find(p => p.id === Number(targetId));

    if (!voter || !target) {
        return res.status(404).json({ message: "Player not found" });
    }

    if (!voter.alive) {
        return res.status(400).json({ message: "Dead players cannot vote" });
    }

    if (!target.alive) {
        return res.status(400).json({ message: "Cannot vote for a dead player" });
    }

    if (voter.id === target.id) {
        return res.status(400).json({ message: "You cannot vote for yourself" });
    }

    if (room.votes.some(v => v.voterId === voter.id)) {
        return res.status(400).json({ message: "You have already voted" });
    }

    room.votes.push({ voterId: voter.id, targetId: target.id });

    const aliveCount = room.players.filter(p => p.alive).length;

    // Last vote in: resolve straight away
    if (room.votes.length >= aliveCount) {
        return res.json({ message: "Voting completed", ...resolveVotes(room) });
    }

    io.to(room.roomCode).emit("phase-changed"); // so everyone sees the vote count update
    res.json({ message: `${voter.name} voted`, totalVotes: room.votes.length });
});

app.post("/rooms/:roomCode/resolve-votes", (req, res) => {
    const room = findRoom(req.params.roomCode);

    if (!room) {
        return res.status(404).json({ message: "Room not found" });
    }

    if (room.status !== "IN_PROGRESS" || room.phase !== "DAY") {
        return res.status(400).json({ message: "It is not day phase" });
    }

    if (room.votes.length === 0) {
        return res.status(400).json({ message: "Nobody has voted" });
    }

    res.json({ message: "Voting completed", ...resolveVotes(room) });
});
// Mafia changes their leaning pick (visible to their partner until they lock in)
app.post("/rooms/:roomCode/mafia/pick", (req, res) => {
    const room = findRoom(req.params.roomCode);
    if (!room) return res.status(404).json({ message: "Room not found" });
    if (room.status !== "IN_PROGRESS" || room.phase !== "NIGHT")
        return res.status(400).json({ message: "Picks are only allowed at night" });

    const actor = room.players.find(p => p.id === Number(req.body.mafiaPlayerId));
    if (!actor || actor.role !== "MAFIA" || !actor.alive)
        return res.status(403).json({ message: "Only living Mafia can do this" });
    if (room.nightActed.includes(actor.id))
        return res.status(400).json({ message: "You already locked in" });

    const target = room.players.find(p => p.id === Number(req.body.targetPlayerId));
    if (!target || !target.alive || target.role === "MAFIA")
        return res.status(400).json({ message: "Invalid target" });

    room.mafiaPicks[actor.id] = target.id;
    io.to(room.roomCode).emit("mafia-update");
    res.json({ message: "Pick updated" });
});

// What only Mafia may see: partners' picks and the private chat
app.get("/rooms/:roomCode/mafia", (req, res) => {
    const room = findRoom(req.params.roomCode);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const me = room.players.find(p => p.id === Number(req.query.playerId));
    if (!me || me.role !== "MAFIA") return res.status(403).json({ message: "Mafia only" });

    const team = room.players
        .filter(p => p.role === "MAFIA")
        .map(p => {
            const pickId = room.mafiaPicks[p.id];
            return {
                id: p.id,
                name: p.name,
                alive: p.alive,
                locked: room.phase === "NIGHT" && room.nightActed.includes(p.id),
                pickName: pickId !== undefined ? room.players.find(x => x.id === pickId)?.name : undefined
            };
        });

    res.json({ team, messages: room.mafiaChat });
});

app.post("/rooms/:roomCode/mafia/chat", (req, res) => {
    const room = findRoom(req.params.roomCode);
    if (!room) return res.status(404).json({ message: "Room not found" });
    if (room.status !== "IN_PROGRESS" || room.phase !== "NIGHT")
        return res.status(400).json({ message: "Mafia chat is only open at night" });

    const player = room.players.find(p => p.id === Number(req.body.playerId));
    if (!player || player.role !== "MAFIA" || !player.alive)
        return res.status(403).json({ message: "Only living Mafia can chat here" });

    const text = String(req.body.message ?? "").trim().slice(0, 200);
    if (!text) return res.status(400).json({ message: "Message cannot be empty" });

    room.mafiaChat.push({
        playerId: player.id,
        playerName: player.name,
        message: text,
        timestamp: new Date().toISOString()
    });
    if (room.mafiaChat.length > 100) room.mafiaChat.shift();

    io.to(room.roomCode).emit("mafia-update");
    res.status(201).json({ message: "Sent" });
});

/* ---------------- chat ---------------- */

app.post("/rooms/:roomCode/chat", (req, res) => {
    const room = findRoom(req.params.roomCode);
    const { playerId, message } = req.body;

    if (!room) {
        return res.status(404).json({ message: "Room not found" });
    }

    if (room.status !== "IN_PROGRESS") {
        return res.status(400).json({ message: "Game has not started" });
    }

    if (room.phase !== "DAY") {
        return res.status(400).json({ message: "Chat is only open during the day" });
    }

    const player = room.players.find(p => p.id === Number(playerId));

    if (!player) {
        return res.status(404).json({ message: "Player not found" });
    }

    if (!player.alive) {
        return res.status(403).json({ message: "Dead players cannot chat" });
    }

    const text = String(message ?? "").trim().slice(0, 200);

    if (!text) {
        return res.status(400).json({ message: "Message cannot be empty" });
    }

    const newMessage = {
        playerId: player.id,
        playerName: player.name,
        message: text,
        timestamp: new Date().toISOString()
    };

    room.messages.push(newMessage);
    if (room.messages.length > 200) room.messages.shift();

    io.to(room.roomCode).emit("new-message", newMessage);

    res.status(201).json({ message: "Message sent", data: newMessage });
});

app.get("/rooms/:roomCode/chat", (req, res) => {
    const room = findRoom(req.params.roomCode);

    if (!room) {
        return res.status(404).json({ message: "Room not found" });
    }

    res.json({ messages: room.messages });
});

/* ---------------- sockets ---------------- */

const GRACE_MS = 120000;
const seatKey = (code: string, id: number) => `${code}:${id}`;
const presence = new Map<string, Set<string>>();          // seat -> open sockets
const dropTimers = new Map<string, NodeJS.Timeout>();
const socketSeat = new Map<string, { roomCode: string; playerId: number }>();

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    socket.on("join-room", (payload) => {
        const roomCode = typeof payload === "string" ? payload : payload?.roomCode;
        const playerId = typeof payload === "object" ? Number(payload?.playerId) : 0;
        if (!roomCode) return;

        socket.join(roomCode);

        if (playerId) {
            const key = seatKey(roomCode, playerId);
            socketSeat.set(socket.id, { roomCode, playerId });
            const sockets = presence.get(key) ?? new Set<string>();
            sockets.add(socket.id);
            presence.set(key, sockets);
            clearTimeout(dropTimers.get(key));
            dropTimers.delete(key);
        }

        socket.to(roomCode).emit("player-joined");
    });

    socket.on("leave-room", (roomCode) => {
        socket.leave(roomCode);
        const seat = socketSeat.get(socket.id);
        if (seat) presence.get(seatKey(seat.roomCode, seat.playerId))?.delete(socket.id);
        socketSeat.delete(socket.id);
    });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);
        const seat = socketSeat.get(socket.id);
        socketSeat.delete(socket.id);
        if (!seat) return;

        const key = seatKey(seat.roomCode, seat.playerId);
        const sockets = presence.get(key);
        sockets?.delete(socket.id);
        if (sockets && sockets.size > 0) return;      // still connected in another tab

        presence.delete(key);
        dropTimers.set(key, setTimeout(() => {
            dropTimers.delete(key);
            const room = findRoom(seat.roomCode);
            if (room) removePlayer(room, seat.playerId);
        }, GRACE_MS));
    });
});

httpServer.listen(3002, () => {
    console.log("Game service running on port 3002");
});