class MockIncrement {
    constructor(val) { this.val = val; }
}

const getDB = () => JSON.parse(localStorage.getItem('zubiksMockDB')) || {};
const saveDB = (db) => localStorage.setItem('zubiksMockDB', JSON.stringify(db));

const listeners = {};
const notifySnapshot = (path) => {
    if (listeners[path]) {
        listeners[path].forEach(cb => cb());
    }
};

const applyData = (existing, newData) => {
    const result = { ...(existing || {}) };
    for (const key in newData) {
        if (newData[key] instanceof MockIncrement) {
            result[key] = (result[key] || 0) + newData[key].val;
        } else {
            result[key] = newData[key];
        }
    }
    return result;
};

// === Auth Mock ===
let currentUser = JSON.parse(localStorage.getItem('mockUser')) || null;
const saveUser = (u) => {
    currentUser = u;
    localStorage.setItem('mockUser', JSON.stringify(u));
    notifySnapshot('auth');
};

window.firebaseAuth = { currentUser };

window.firebaseSignIn = async (auth, email, password) => {
    const user = { uid: email, email, role: 'admin' };
    saveUser(user);
    return { user };
};

window.firebaseSignUp = async (auth, email, password) => {
    const user = { uid: email, email, role: 'user' };
    saveUser(user);
    return { user };
};

window.firebaseSignOut = async () => {
    saveUser(null);
};

window.firebaseResetPassword = async () => { console.log('Reset password mock'); };
window.firebaseUpdatePassword = async () => { console.log('Update password mock'); };
window.firebaseUpdateEmail = async () => { console.log('Update email mock'); };

window.firebaseOnAuthStateChanged = (auth, cb) => {
    cb(currentUser);
    if (!listeners['auth']) listeners['auth'] = [];
    const trigger = () => cb(currentUser);
    listeners['auth'].push(trigger);
    return () => {
        listeners['auth'] = listeners['auth'].filter(f => f !== trigger);
    };
};

// === Firestore Mock ===
window.firebaseDb = "mockDB";

window.firebaseDoc = (db, collection, id) => {
    return { collection, id };
};

window.firebaseCollection = (db, collection) => {
    return collection;
};

window.firebaseGetDoc = async (ref) => {
    const db = getDB();
    const data = db[ref.collection] ? db[ref.collection][ref.id] : null;
    return {
        id: ref.id,
        exists: () => !!data,
        data: () => data
    };
};

window.firebaseGetDocs = async (ref) => {
    const db = getDB();
    const collection = ref.collection || ref;
    const docsData = Object.entries(db[collection] || {}).map(([id, data]) => ({
        id,
        exists: () => true,
        data: () => data
    }));
    return {
        forEach: (fn) => docsData.forEach(fn),
        docs: docsData
    };
};

window.firebaseSetDoc = async (ref, data) => {
    const db = getDB();
    if (!db[ref.collection]) db[ref.collection] = {};
    db[ref.collection][ref.id] = applyData(db[ref.collection][ref.id], data);
    saveDB(db);
    notifySnapshot(ref.collection);
    notifySnapshot(ref.collection + '/' + ref.id);
};

window.firebaseUpdateDoc = async (ref, data) => {
    return window.firebaseSetDoc(ref, data);
};

window.firebaseAddDoc = async (collection, data) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2);
    await window.firebaseSetDoc({ collection, id }, data);
    return { id };
};

window.firebaseDeleteDoc = async (ref) => {
    const db = getDB();
    if (db[ref.collection] && db[ref.collection][ref.id]) {
        delete db[ref.collection][ref.id];
        saveDB(db);
        notifySnapshot(ref.collection);
        notifySnapshot(ref.collection + '/' + ref.id);
    }
};

window.firebaseIncrement = (val) => new MockIncrement(val);

window.firebaseWriteBatch = (db) => {
    return {
        set: (ref, data) => { window.firebaseSetDoc(ref, data); },
        update: (ref, data) => { window.firebaseUpdateDoc(ref, data); },
        delete: (ref) => { window.firebaseDeleteDoc(ref); },
        commit: async () => {} // Auto committed in mock
    };
};

// Queries
window.firebaseQuery = (collection, ...constraints) => {
    return { isQuery: true, collection, constraints };
};

window.firebaseOrderBy = (field, dir) => {
    return { type: 'orderBy', field, dir };
};

window.firebaseLimit = (lim) => {
    return { type: 'limit', lim };
};

window.firebaseWhere = (field, op, val) => {
    return { type: 'where', field, op, val };
};

// Snapshot
window.firebaseOnSnapshot = (ref, cb) => {
    const collection = ref.collection || ref;
    const isQuery = !!ref.isQuery;
    const docId = ref.id;
    
    const trigger = () => {
        const db = getDB();
        
        if (!isQuery && docId) {
            // Single document snapshot
            const data = db[collection] ? db[collection][docId] : null;
            cb({ id: docId, exists: () => !!data, data: () => data });
        } else {
            // Collection or Query snapshot
            let docsData = Object.entries(db[collection] || {}).map(([id, data]) => ({
                id,
                data: () => data,
                _data: data
            }));

            // Very basic filtering (just for where clauses, ignore complex ordering for mock)
            if (isQuery && ref.constraints) {
                ref.constraints.forEach(c => {
                    if (c.type === 'where' && c.op === '==') {
                        docsData = docsData.filter(d => d._data[c.field] === c.val);
                    }
                });
            }

            cb({
                forEach: (fn) => docsData.forEach(fn),
                docs: docsData
            });
        }
    };

    trigger();
    
    const listenPath = docId ? `${collection}/${docId}` : collection;
    if (!listeners[listenPath]) listeners[listenPath] = [];
    listeners[listenPath].push(trigger);
    
    return () => {
        listeners[listenPath] = listeners[listenPath].filter(f => f !== trigger);
    };
};

console.log("Mock Firebase chargé ! Backend local activé.");
