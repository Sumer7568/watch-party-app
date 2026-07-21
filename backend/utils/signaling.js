const callRooms = new Map();
let signalId = 0;

const normalizeRoom = (room) => String(room || "").trim().toUpperCase();
const pruneEvents = (events) => events.filter((event) => Date.now() - event.createdAt < 60 * 60 * 1000);

const pushSignal = (room, sender, type, payload) => {
  const key = normalizeRoom(room);
  const events = callRooms.get(key) || [];
  const event = { id: ++signalId, sender, type, payload, createdAt: Date.now() };
  events.push(event);
  callRooms.set(key, pruneEvents(events));
  return event;
};

const getSignals = (room, after, sender) => {
  const key = normalizeRoom(room);
  const events = callRooms.get(key) || [];
  return events.filter((event) => event.id > after && event.sender !== sender);
};

const getChatHistory = (room, limit = 50) => {
  const key = normalizeRoom(room);
  const events = callRooms.get(key) || [];
  return events
    .filter((event) => event.type === "chat")
    .slice(-limit)
    .map((event) => ({ id: event.id, ...event.payload, sender: event.sender }));
};

module.exports = { pushSignal, getSignals, getChatHistory, normalizeRoom };
