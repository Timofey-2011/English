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

const QUOTA_KEY = 'firestore_quota_exceeded_timestamp';

const checkQuotaExpiry = () => {
  const saved = localStorage.getItem(QUOTA_KEY);
  if (!saved) return false;
  const timestamp = parseInt(saved, 10);
  const now = Date.now();
  // Quota usually resets at midnight Pacific Time, but a 24-hour block is a safe assumption for client-side stabilization
  if (now - timestamp > 24 * 60 * 60 * 1000) {
    localStorage.removeItem(QUOTA_KEY);
    return false;
  }
  return true;
};

let quotaExceededGlobal = checkQuotaExpiry();

if (quotaExceededGlobal) {
  console.warn("[Firebase] Initializing in offline-only mode due to active quota suspension.");
  disableNetwork(db).catch(() => {});
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  const isQuotaError = message.includes('resource-exhausted') || message.includes('Quota exceeded');
  
  if (isQuotaError) {
    if (!quotaExceededGlobal) {
      quotaExceededGlobal = true;
      localStorage.setItem(QUOTA_KEY, Date.now().toString());
      console.warn("CRITICAL: Firestore Quota Exceeded. Suspending network activity.");
      disableNetwork(db).catch(() => {});
    }
    // Return instead of throw to prevent crashing/looping components that don't catch correctly
    return;
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
    return quotaExceededGlobal || checkQuotaExpiry();
};
