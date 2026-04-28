import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, query, orderBy, limit, onSnapshot, getDocFromServer, disableNetwork } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use initializeFirestore with long-polling to avoid "unavailable" errors in restricted networks
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

let quotaExceededGlobal = sessionStorage.getItem('firestore_quota_exceeded') === 'true';

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('resource-exhausted') || message.includes('Quota exceeded')) {
    if (!quotaExceededGlobal) {
      quotaExceededGlobal = true;
      sessionStorage.setItem('firestore_quota_exceeded', 'true');
      console.warn("CRITICAL: Firestore Quota Exceeded. Disconnecting network to prevent retry loops.");
      disableNetwork(db).catch(e => console.error("Failed to disable network:", e));
    }
  }
  
  const errInfo: FirestoreErrorInfo = {
    error: message,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error Detail: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validation test per instructions
async function testConnection() {
  if (quotaExceededGlobal || sessionStorage.getItem('firestore_quota_exceeded') === 'true') {
    return;
  }
  try {
    const docRef = doc(db, 'test', 'connection');
    await getDocFromServer(docRef);
  } catch (error: any) {
    // Ignore early errors to prevent noise if we're hitting quota right away
  }
}
testConnection();

let isSigningIn = false;

export const signInWithGoogle = async () => {
  if (isSigningIn) return;
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result;
  } catch (error: any) {
    // Suppress specific common environment errors that don't need UI alerts
    if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
      console.log("Sign-in popup was handled or closed by user.");
    } else if (error.code === 'auth/network-request-failed') {
      console.error("Firebase network error: check your connection or cross-origin policy.");
      alert("Neural Link Failed: Network request blocked. Ensure no browser blockers are active.");
    } else {
      console.error("Neural Link Authentication Error:", error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};
export const logout = () => signOut(auth);
// Logic check: if quota exceeded, we should fail fast to avoid SDK retries
export const isQuotaExceeded = () => {
    return quotaExceededGlobal || sessionStorage.getItem('firestore_quota_exceeded') === 'true';
};
