import { getFirebaseServices } from "../firebase.js";
import { buildSearchPrefixes, searchTerms } from "./search-index.js";

function procedureFromSnapshot(snapshot) {
  const data = snapshot.data();
  return Object.assign({}, data, {
    id: data.id || snapshot.id,
    steps: Array.isArray(data.steps) ? data.steps : []
  });
}

function logFromSnapshot(snapshot) {
  const data = snapshot.data();
  return {
    date: data.date || "—",
    time: data.time || "—",
    type: data.type || "update",
    procedureId: data.procedureId || null,
    procedureTitle: data.procedureTitle || "Nieznana procedura",
    user: data.userName || data.userEmail || data.userId || "Nieznany użytkownik"
  };
}

function actor(services) {
  const user = services.auth.currentUser;
  if (!user) return { id: null, email: "", name: "Nieznany użytkownik" };
  return {
    id: user.uid,
    email: user.email || "",
    name: user.displayName || user.email || user.uid
  };
}

function logPayload(services, log) {
  const currentActor = actor(services);
  return {
    type: log.type,
    procedureId: log.procedureId || null,
    procedureTitle: log.procedureTitle,
    date: log.date,
    time: log.time,
    userId: currentActor.id,
    userEmail: currentActor.email,
    userName: currentActor.name,
    createdAt: services.firestore.serverTimestamp(),
    createdBy: currentActor.id
  };
}

function logMoment() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date()).reduce(function (result, part) {
    result[part.type] = part.value;
    return result;
  }, {});
  return { date: parts.year + "-" + parts.month + "-" + parts.day, time: parts.hour + ":" + parts.minute + ":" + parts.second };
}

function automaticLog(type, procedure) {
  return Object.assign({
    type: type,
    procedureId: procedure.id,
    procedureTitle: procedure.title
  }, logMoment());
}

function procedurePayload(procedure) {
  return Object.assign({}, procedure, {
    searchPrefixes: buildSearchPrefixes(procedure)
  });
}

function cleanImportedProcedure(value, index) {
  if (!value || typeof value !== "object" || !String(value.id || "").trim() || !String(value.title || "").trim() || !String(value.dept || "").trim()) {
    throw new Error("Każda importowana procedura musi zawierać id, title oraz dept.");
  }
  const sourceOrder = Number(value.sortOrder);
  return {
    id: String(value.id).trim(),
    title: String(value.title).trim(),
    dept: String(value.dept).trim(),
    exec: String(value.exec || "").trim(),
    steps: (Array.isArray(value.steps) ? value.steps : []).map(function (step) { return String(step || "").trim(); }).filter(Boolean),
    notes: String(value.notes || "").trim(),
    sortOrder: Number.isFinite(sourceOrder) ? sourceOrder : Date.now() + index
  };
}

function sameProcedure(left, right) {
  return left.id === right.id
    && left.title === right.title
    && left.dept === right.dept
    && left.exec === right.exec
    && left.notes === right.notes
    && left.sortOrder === right.sortOrder
    && JSON.stringify(left.steps || []) === JSON.stringify(right.steps || []);
}

function procedureCreatePayload(services, procedure) {
  const currentActor = actor(services);
  const firestore = services.firestore;
  return Object.assign({}, procedurePayload(procedure), {
    sortOrder: procedure.sortOrder || Date.now(),
    createdAt: firestore.serverTimestamp(),
    createdBy: currentActor.id,
    updatedAt: firestore.serverTimestamp(),
    updatedBy: currentActor.id
  });
}

function procedureUpdatePayload(services, procedure) {
  return Object.assign({}, procedurePayload(procedure), {
    updatedAt: services.firestore.serverTimestamp(),
    updatedBy: actor(services).id
  });
}

function queueProcedureMutation(batch, services, mutation) {
  const firestore = services.firestore;
  const procedureRef = firestore.doc(services.db, "procedures", mutation.procedure.id);
  if (mutation.type === "create") batch.set(procedureRef, procedureCreatePayload(services, mutation.procedure));
  else if (mutation.type === "update") batch.update(procedureRef, procedureUpdatePayload(services, mutation.procedure));
  else batch.delete(procedureRef);
  const logRef = firestore.doc(firestore.collection(services.db, "logs"));
  batch.set(logRef, logPayload(services, automaticLog(mutation.type, mutation.procedure)));
}

async function commitProcedureMutations(services, mutations) {
  const chunkSize = 200;
  for (let start = 0; start < mutations.length; start += chunkSize) {
    const batch = services.firestore.writeBatch(services.db);
    mutations.slice(start, start + chunkSize).forEach(function (mutation) {
      queueProcedureMutation(batch, services, mutation);
    });
    await batch.commit();
  }
}

async function currentProcedureMap(services) {
  const snapshot = await services.firestore.getDocs(services.firestore.collection(services.db, "procedures"));
  return new Map(snapshot.docs.map(function (document) {
    const procedure = cleanImportedProcedure(Object.assign({ id: document.id }, document.data()), 0);
    return [procedure.id, procedure];
  }));
}

export async function readRegistry() {
  const services = await getFirebaseServices();
  const firestore = services.firestore;
  const proceduresQuery = firestore.query(
    firestore.collection(services.db, "procedures"),
    firestore.orderBy("sortOrder", "asc")
  );
  const logsQuery = firestore.query(
    firestore.collection(services.db, "logs"),
    firestore.orderBy("createdAt", "desc"),
    firestore.limit(100)
  );
  const snapshots = await Promise.all([
    firestore.getDocs(proceduresQuery),
    firestore.getDocs(logsQuery)
  ]);
  return {
    procedures: snapshots[0].docs.map(procedureFromSnapshot),
    log: snapshots[1].docs.map(logFromSnapshot)
  };
}

export async function searchProceduresInFirestore(queryText) {
  const terms = searchTerms(queryText).slice(0, 30);
  if (!terms.length) return [];

  const services = await getFirebaseServices();
  const firestore = services.firestore;
  const searchQuery = firestore.query(
    firestore.collection(services.db, "procedures"),
    firestore.where("searchPrefixes", "array-contains-any", terms),
    firestore.limit(100)
  );
  const snapshot = await firestore.getDocs(searchQuery);
  return snapshot.docs.map(procedureFromSnapshot);
}

export async function subscribeToRegistry(onChange, onError) {
  const services = await getFirebaseServices();
  const firestore = services.firestore;
  const proceduresQuery = firestore.query(
    firestore.collection(services.db, "procedures"),
    firestore.orderBy("sortOrder", "asc")
  );
  const logsQuery = firestore.query(
    firestore.collection(services.db, "logs"),
    firestore.orderBy("createdAt", "desc"),
    firestore.limit(100)
  );
  let procedures = null;
  let log = null;

  function publish() {
    if (procedures && log) onChange({ procedures: procedures, log: log });
  }

  const unsubscribeProcedures = firestore.onSnapshot(proceduresQuery, function (snapshot) {
    procedures = snapshot.docs.map(procedureFromSnapshot);
    publish();
  }, onError);

  const unsubscribeLogs = firestore.onSnapshot(logsQuery, function (snapshot) {
    log = snapshot.docs.map(logFromSnapshot);
    publish();
  }, onError);

  return function () {
    unsubscribeProcedures();
    unsubscribeLogs();
  };
}

export async function createProcedureInFirestore(procedure, log) {
  const services = await getFirebaseServices();
  const firestore = services.firestore;
  const procedureRef = firestore.doc(services.db, "procedures", procedure.id);
  const logRef = firestore.doc(firestore.collection(services.db, "logs"));
  const batch = firestore.writeBatch(services.db);
  const currentActor = actor(services);
  batch.set(procedureRef, Object.assign({}, procedurePayload(procedure), {
    sortOrder: procedure.sortOrder || Date.now(),
    createdAt: firestore.serverTimestamp(),
    createdBy: currentActor.id,
    updatedAt: firestore.serverTimestamp(),
    updatedBy: currentActor.id
  }));
  batch.set(logRef, logPayload(services, log));
  await batch.commit();
}

export async function updateProcedureInFirestore(id, procedure, log) {
  const services = await getFirebaseServices();
  const firestore = services.firestore;
  const procedureRef = firestore.doc(services.db, "procedures", id);
  const logRef = firestore.doc(firestore.collection(services.db, "logs"));
  const batch = firestore.writeBatch(services.db);
  batch.update(procedureRef, Object.assign({}, procedurePayload(procedure), {
    updatedAt: firestore.serverTimestamp(),
    updatedBy: actor(services).id
  }));
  batch.set(logRef, logPayload(services, log));
  await batch.commit();
}

export async function deleteProcedureInFirestore(id, log) {
  const services = await getFirebaseServices();
  const firestore = services.firestore;
  const procedureRef = firestore.doc(services.db, "procedures", id);
  const logRef = firestore.doc(firestore.collection(services.db, "logs"));
  const batch = firestore.writeBatch(services.db);
  batch.delete(procedureRef);
  batch.set(logRef, logPayload(services, log));
  await batch.commit();
}

function legacyLogType(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "add" || normalized === "create") return "create";
  if (normalized === "del" || normalized === "delete") return "delete";
  return "update";
}

function legacyLogHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function legacyLogDocumentId(entry, index) {
  const source = [entry.date, entry.type, entry.text, index].map(function (value) { return String(value || ""); }).join("|");
  return "legacy-" + String(index + 1).padStart(3, "0") + "-" + legacyLogHash(source);
}

function legacyLog(entry, index) {
  const text = String(entry.text || "Wpis historyczny z procedury.json").trim();
  const sourceType = String(entry.type || "mod").trim();
  const sourceDate = String(entry.date || "—").trim();
  return {
    type: legacyLogType(sourceType),
    procedureId: "legacy-" + String(index + 1),
    procedureTitle: text,
    date: sourceDate,
    time: "00:00:00",
    legacyDate: sourceDate,
    legacyType: sourceType,
    legacyText: text,
    source: "procedury.json"
  };
}

async function importLegacyLogs(services, entries) {
  const firestore = services.firestore;
  const pending = [];
  let skipped = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] || {};
    const id = legacyLogDocumentId(entry, index);
    const reference = firestore.doc(services.db, "logs", id);
    const existing = await firestore.getDoc(reference);
    if (existing.exists()) {
      skipped += 1;
      continue;
    }
    pending.push({ reference: reference, payload: legacyLog(entry, index) });
  }

  const chunkSize = 400;
  for (let start = 0; start < pending.length; start += chunkSize) {
    const batch = firestore.writeBatch(services.db);
    pending.slice(start, start + chunkSize).forEach(function (item) {
      batch.set(item.reference, logPayload(services, item.payload));
    });
    await batch.commit();
  }

  return { created: pending.length, updated: 0, skipped: skipped, total: entries.length };
}

export async function importLegacyProceduresFromJson() {
  const response = await fetch(new URL("../../procedury.json", import.meta.url));
  if (!response.ok) throw new Error("Nie udało się odczytać archiwalnego pliku procedury.json.");
  const payload = await response.json();
  const procedures = Array.isArray(payload && payload.procedures) ? payload.procedures : null;
  const logs = Array.isArray(payload && payload.log) ? payload.log : null;
  if (!procedures || !logs) throw new Error("Plik procedury.json ma nieprawidłową strukturę migracji.");

  const procedureResult = await importProceduresToFirestore({
    procedures: procedures.map(function (procedure, index) {
      return Object.assign({}, procedure, { sortOrder: index + 1 });
    })
  });
  const services = await getFirebaseServices();
  const logResult = await importLegacyLogs(services, logs);
  return {
    procedures: procedureResult,
    logs: logResult,
    created: procedureResult.created + logResult.created,
    updated: procedureResult.updated + logResult.updated,
    skipped: procedureResult.skipped + logResult.skipped,
    total: procedureResult.total + logResult.total
  };
}

export async function importProceduresToFirestore(payload) {
  const source = Array.isArray(payload) ? payload : payload && payload.procedures;
  if (!Array.isArray(source)) throw new Error("Plik JSON musi zawierać tablicę procedures.");
  const procedures = source.map(cleanImportedProcedure);
  const uniqueIds = new Set(procedures.map(function (procedure) { return procedure.id; }));
  if (uniqueIds.size !== procedures.length) throw new Error("Plik JSON zawiera powielone identyfikatory procedur.");

  const services = await getFirebaseServices();
  const current = await currentProcedureMap(services);
  const mutations = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  procedures.forEach(function (procedure) {
    const existing = current.get(procedure.id);
    if (!existing) {
      mutations.push({ type: "create", procedure: procedure });
      created += 1;
    } else if (!sameProcedure(existing, procedure)) {
      mutations.push({ type: "update", procedure: procedure });
      updated += 1;
    } else skipped += 1;
  });

  await commitProcedureMutations(services, mutations);
  return { created: created, updated: updated, skipped: skipped, total: procedures.length };
}

export async function createFirestoreBackup() {
  const services = await getFirebaseServices();
  const firestore = services.firestore;
  const currentActor = actor(services);
  const procedures = Array.from((await currentProcedureMap(services)).values());
  const backupRef = firestore.doc(firestore.collection(services.db, "backups"));
  const moment = logMoment();
  const metadata = {
    status: "creating",
    name: "Kopia " + moment.date + " " + moment.time,
    procedureCount: procedures.length,
    date: moment.date,
    time: moment.time,
    createdBy: currentActor.id,
    createdByName: currentActor.name,
    createdAt: firestore.serverTimestamp()
  };
  await firestore.setDoc(backupRef, metadata);

  try {
    const chunkSize = 400;
    for (let start = 0; start < procedures.length; start += chunkSize) {
      const batch = firestore.writeBatch(services.db);
      procedures.slice(start, start + chunkSize).forEach(function (procedure) {
        batch.set(firestore.doc(backupRef, "procedures", procedure.id), procedure);
      });
      await batch.commit();
    }
    await firestore.updateDoc(backupRef, { status: "complete", completedAt: firestore.serverTimestamp() });
  } catch (error) {
    await firestore.updateDoc(backupRef, { status: "failed", failedAt: firestore.serverTimestamp() });
    throw error;
  }

  return Object.assign({ id: backupRef.id }, metadata, { status: "complete" });
}

export async function listFirestoreBackups() {
  const services = await getFirebaseServices();
  const firestore = services.firestore;
  const backupsQuery = firestore.query(
    firestore.collection(services.db, "backups"),
    firestore.orderBy("createdAt", "desc"),
    firestore.limit(30)
  );
  const snapshot = await firestore.getDocs(backupsQuery);
  return snapshot.docs.map(function (document) {
    const data = document.data();
    return {
      id: document.id,
      name: data.name || "Kopia zapasowa",
      status: data.status || "unknown",
      procedureCount: Number(data.procedureCount || 0),
      date: data.date || "—",
      time: data.time || "—",
      createdByName: data.createdByName || data.createdBy || "Nieznany użytkownik"
    };
  }).filter(function (backup) { return backup.status === "complete"; });
}

export async function restoreFirestoreBackup(backupId) {
  const services = await getFirebaseServices();
  const firestore = services.firestore;
  const backupRef = firestore.doc(services.db, "backups", backupId);
  const metadata = await firestore.getDoc(backupRef);
  if (!metadata.exists() || metadata.data().status !== "complete") throw new Error("Nie znaleziono gotowej kopii zapasowej.");

  const backupSnapshot = await firestore.getDocs(firestore.collection(backupRef, "procedures"));
  const backupProcedures = backupSnapshot.docs.map(function (document, index) {
    return cleanImportedProcedure(Object.assign({ id: document.id }, document.data()), index);
  });
  const backupMap = new Map(backupProcedures.map(function (procedure) { return [procedure.id, procedure]; }));
  const current = await currentProcedureMap(services);
  const mutations = [];
  let created = 0;
  let updated = 0;
  let deleted = 0;

  backupProcedures.forEach(function (procedure) {
    const existing = current.get(procedure.id);
    if (!existing) {
      mutations.push({ type: "create", procedure: procedure });
      created += 1;
    } else if (!sameProcedure(existing, procedure)) {
      mutations.push({ type: "update", procedure: procedure });
      updated += 1;
    }
  });
  current.forEach(function (procedure, id) {
    if (!backupMap.has(id)) {
      mutations.push({ type: "delete", procedure: procedure });
      deleted += 1;
    }
  });

  await commitProcedureMutations(services, mutations);
  await firestore.updateDoc(backupRef, {
    lastRestoredAt: firestore.serverTimestamp(),
    lastRestoredBy: actor(services).id
  });
  return { created: created, updated: updated, deleted: deleted, total: backupProcedures.length };
}
