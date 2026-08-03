import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION } from "./config.js";

const requiredConfigKeys = ["apiKey", "authDomain", "projectId", "appId"];
let servicesPromise = null;

export function isFirebaseConfigured() {
  return requiredConfigKeys.every(function (key) {
    const value = FIREBASE_CONFIG[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export async function getFirebaseServices() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase nie jest skonfigurowany. Uzupełnij FIREBASE_CONFIG w js/config.js.");
  }

  if (!servicesPromise) {
    const baseUrl = "https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION;
    servicesPromise = Promise.all([
      import(baseUrl + "/firebase-app.js"),
      import(baseUrl + "/firebase-firestore.js"),
      import(baseUrl + "/firebase-auth.js")
    ]).then(function (modules) {
      const appSdk = modules[0];
      const firestoreSdk = modules[1];
      const authSdk = modules[2];
      const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(FIREBASE_CONFIG);
      return {
        app: app,
        auth: authSdk.getAuth(app),
        db: firestoreSdk.getFirestore(app),
        firestore: firestoreSdk,
        authSdk: authSdk
      };
    }).catch(function (error) {
      servicesPromise = null;
      throw error;
    });
  }

  return servicesPromise;
}

async function sessionForUser(services, user) {
  if (!user) return null;
  const profileRef = services.firestore.doc(services.db, "users", user.uid);
  const profile = await services.firestore.getDoc(profileRef);
  const configuredRole = profile.exists() ? profile.data().role : "viewer";
  const role = ["admin", "editor", "viewer"].includes(configuredRole) ? configuredRole : "viewer";
  return {
    uid: user.uid,
    email: user.email || "",
    role: role,
    canEdit: role === "editor" || role === "admin",
    canDelete: role === "admin"
  };
}

export async function signInAdministrator(email, password) {
  const services = await getFirebaseServices();
  const credential = await services.authSdk.signInWithEmailAndPassword(services.auth, email, password);
  return sessionForUser(services, credential.user);
}

export async function signOutAdministrator() {
  const services = await getFirebaseServices();
  await services.authSdk.signOut(services.auth);
}

export async function subscribeToAdministratorSession(onChange, onError) {
  const services = await getFirebaseServices();
  return services.authSdk.onAuthStateChanged(services.auth, async function (user) {
    try {
      onChange(await sessionForUser(services, user));
    } catch (error) {
      onError(error);
    }
  }, onError);
}
