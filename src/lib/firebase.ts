import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, query, orderBy, limit, onSnapshot, getDocFromServer } from 'firebase/firestore';
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
  try {
    const docRef = doc(db, 'test', 'connection');
    await getDocFromServer(docRef);
    console.log("Firebase Connection: Active");
  } catch (error: any) {
    if (error?.code === 'unavailable') {
      console.warn("Firestore backend is currently unavailable. This might be a temporary network issue.");
    } else if (error?.message?.includes('the client is offline')) {
      console.error("Firebase Connection Failed: Client is offline. Please check your config.");
    } else {
      console.log("Firebase Connection Test Result:", error?.code || error?.message);
    }
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
